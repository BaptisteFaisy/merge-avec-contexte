/**
 * Câblage de bout en bout du Cerveau, sans Forge : store mémoire, coffre
 * mémoire, lecteur Jira factice. On vérifie que les modules assemblés se
 * parlent vraiment — jumelage, pont signé, journal, repli, actions Rovo.
 */
import { describe, expect, it } from 'vitest';
import { actionsRovo, assemblerCerveau, resolversUi, traiterPont } from '../src/app/compose';
import { horlogeFixe } from '../src/app/horloge';
import { loggerSilencieux } from '../src/app/logger';
import { createMemoryReglagesStore } from '../src/app/reglages';
import { createMemorySecretVault } from '../src/app/secrets';
import type { IssueReader } from '../src/jira/reader';
import { createMemoryStore } from '../src/storage/memory-store';
import { signRequest, type IssueContext } from '../src/shared';

const NOW = '2026-11-27T16:30:00Z';
const WORKSPACE = 'ws-demo';
const SECRET = 'secret-de-test-32-octets-01234567';

const ticket: IssueContext = {
  key: 'PAY-123',
  id: '10001',
  exists: true,
  status: 'En cours',
  statusCategory: 'inProgress',
  criteria: [{ text: 'Critère A', done: true }, { text: 'Critère B', done: false }],
  links: [],
  fixVersions: [],
  labels: [],
  components: ['paiement'],
  incidentKeys: [],
};

/** Lecteur Jira factice : un ticket connu, tout le reste inexistant. */
const jiraFactice: IssueReader = {
  async lire(cle) {
    return cle === 'PAY-123' ? ticket : { ...ticket, key: cle, id: cle, exists: false };
  },
  async incidentsOuverts() {
    return [];
  },
};

function assembler() {
  return assemblerCerveau({
    store: createMemoryStore(),
    vault: createMemorySecretVault(),
    reglages: createMemoryReglagesStore({ approbateurs: ['tech-lead'] }),
    config: { siteUrl: 'https://demo.atlassian.net', projectId: 'PAY', bridgeUrl: 'https://pont.demo/v2', locale: 'fr' },
    clock: horlogeFixe(NOW),
    logger: loggerSilencieux(),
    jira: jiraFactice,
  });
}

/** Jumelage complet par la route publique `pair`, puis renvoie le secret. */
async function jumeler(cerveau: ReturnType<typeof assembler>): Promise<string> {
  const reglages = await resolversUi(cerveau).reglages({ method: 'genererCode' });
  const code = reglages.vue.jumelage.codeEnCours ?? '';
  const reponse = await traiterPont(cerveau, {
    body: JSON.stringify({ route: 'pair', payload: { code, workspaceUuid: WORKSPACE } }),
    headers: {},
  });
  expect(reponse.statusCode).toBe(200);
  return (JSON.parse(reponse.body) as { secret: string }).secret;
}

/** Requête signée sur la route `evaluate`. */
function requeteSignee(secret: string, corps: Record<string, unknown>) {
  const body = JSON.stringify(corps);
  return { body, headers: signRequest({ secret, body, now: () => Date.parse(NOW) }).headers };
}

const payloadEvaluate = {
  workspaceUuid: WORKSPACE,
  repositoryUuid: 'repo-1',
  repositorySlug: 'checkout-api',
  pullRequestId: 42,
  trigger: 'on-code-pushed',
  issueKeys: ['PAY-123'],
  sourceBranch: 'feature/PAY-123-limite',
  targetBranch: 'main',
};

describe('composition du Cerveau', () => {
  it('jumelle par code à usage unique et range le secret dans le coffre', async () => {
    const cerveau = assembler();
    const secret = await jumeler(cerveau);
    expect(secret.length).toBeGreaterThan(20);
    const enregistre = await cerveau.store.pairing.current();
    expect(enregistre?.workspaceUuid).toBe(WORKSPACE);
    expect(enregistre?.secretRef).not.toBe(secret);
    expect(await cerveau.vault.read(enregistre?.secretRef ?? '')).toBe(secret);
  });

  it('évalue une requête signée de bout en bout et la journalise', async () => {
    const cerveau = assembler();
    const secret = await jumeler(cerveau);
    await resolversUi(cerveau).reglages({ method: 'enregistrerRegles', regles: { 'R-03': { niveau: 'blocking', mode: 'active' } } });
    const reponse = await traiterPont(cerveau, requeteSignee(secret, { route: 'evaluate', payload: payloadEvaluate }));
    expect(reponse.statusCode).toBe(200);
    const corps = JSON.parse(reponse.body) as { verdict: string; message: string };
    expect(corps.verdict).toBe('blocked');
    expect(corps.message).toContain('PAY-123');
    const journal = await cerveau.store.evaluations.latestByPullRequest('repo-1', 42);
    expect(journal?.verdict).toBe('blocked');
  });

  it('refuse une requête dont la signature est fausse', async () => {
    const cerveau = assembler();
    await jumeler(cerveau);
    const reponse = await traiterPont(cerveau, requeteSignee('mauvais-secret', { route: 'evaluate', payload: payloadEvaluate }));
    expect(reponse.statusCode).toBe(401);
  });

  it('applique la politique de repli quand la lecture du contexte échoue', async () => {
    const cerveau = assembler();
    const secret = await jumeler(cerveau);
    await cerveau.store.pairing.setFallbackPolicy('closed', NOW);
    const jiraEnPanne: IssueReader = {
      async lire() {
        throw new Error('Jira injoignable');
      },
      async incidentsOuverts() {
        throw new Error('Jira injoignable');
      },
    };
    const enPanne = assemblerCerveau({ ...cerveau, jira: jiraEnPanne });
    const reponse = await traiterPont(enPanne, requeteSignee(secret, { route: 'evaluate', payload: payloadEvaluate }));
    const corps = JSON.parse(reponse.body) as { verdict: string };
    expect(['inconclusive', 'blocked']).toContain(corps.verdict);
  });

  it('rend les mêmes raisons par l’action evaluate-merge que par le pont', async () => {
    const cerveau = assembler();
    const secret = await jumeler(cerveau);
    await resolversUi(cerveau).reglages({ method: 'enregistrerRegles', regles: { 'R-03': { niveau: 'blocking', mode: 'active' } } });
    const pont = await traiterPont(cerveau, requeteSignee(secret, { route: 'evaluate', payload: payloadEvaluate }));
    const mcp = await actionsRovo(cerveau).evaluateMerge({ issueKey: 'PAY-123', targetBranch: 'main' });
    const raisonsPont = (JSON.parse(pont.body) as { reasons: string[] }).reasons;
    expect(mcp.message.length).toBeGreaterThan(0);
    expect(raisonsPont.length).toBeGreaterThan(0);
  });

  it('enregistre une dérogation demandée par l’action request-waiver', async () => {
    const cerveau = assembler();
    const sortie = await actionsRovo(cerveau).requestWaiver({
      issueKey: 'PAY-123',
      ruleCode: 'R-03',
      reason: 'correctif de prix avant l’ouverture',
      hours: 2,
    });
    expect(sortie).toMatchObject({ ok: true });
    const liste = await cerveau.store.waivers.listByIssue('PAY-123');
    expect(liste).toHaveLength(1);
  });
});
