/**
 * Règles du dépôt côté Cerveau (MC-17, §23 — audit 20) et empreinte du contrat
 * sur la route `health` (audit 79).
 *
 * La route `evaluate` compose les règles reçues du dépôt avec les réglages de
 * l'espace de travail : le dépôt durcit, jamais il n'affaiblit, et tout
 * affaiblissement tenté est journalisé.
 */
import { describe, expect, it } from 'vitest';
import type { BridgeDeps, EvaluationInput } from '../src/bridge/deps';
import { ROUTES } from '../src/bridge/routes';
import { EMPREINTE_CONTRAT, type Evaluation, type RuleConfig } from '../src/shared';

const NOW = '2026-11-27T16:30:00Z';
const SITE = 'https://demo.atlassian.net';

/** Réglages de l'espace de travail : R-05 en avertissement, partout. */
const CONFIGS_ESPACE: RuleConfig[] = [
  { rule: 'R-05', level: 'warning', mode: 'active', scope: {}, params: { jsmProjects: ['JSM'] } },
];

const PAYLOAD = {
  workspaceUuid: 'ws-demo',
  repositoryUuid: 'repo-1',
  repositorySlug: 'checkout-api',
  pullRequestId: 42,
  trigger: 'on-code-pushed',
  issueKeys: ['PAY-123'],
  sourceBranch: 'feature/PAY-123-limite',
  targetBranch: 'main',
};

/** Évaluation vide : seul le contenu de l'entrée nous intéresse ici. */
function evaluationVide(input: EvaluationInput): Evaluation {
  return {
    verdict: 'allowed',
    reasons: [],
    issueKeys: input.issueKeys,
    trigger: input.pr.trigger,
    evaluatedAt: input.now,
    durationMs: 0,
  };
}

/** Ports du pont en doublure : capture l'entrée d'évaluation et le journal. */
function depsFictifs() {
  const entrees: EvaluationInput[] = [];
  const messages: string[] = [];
  const deps = {
    pairing: {
      pairingForWorkspace: async () => ({
        workspaceUuid: 'ws-demo',
        secret: 'secret-de-test-32-octets-01234567',
        siteUrl: SITE,
        pairedAt: NOW,
      }),
      pairings: async () => [],
      fallbackPolicy: async () => 'open',
      saveOffer: async () => undefined,
      findOffer: async () => undefined,
      markOfferUsed: async () => undefined,
      savePairing: async () => undefined,
    },
    context: {
      rules: async () => CONFIGS_ESPACE,
      serviceForRepository: async () => undefined,
      freezes: async () => [],
    },
    waivers: {
      demander: async () => undefined,
      decider: async () => undefined,
      lister: async () => [],
    },
    nonces: {},
    evaluate: async (input: EvaluationInput) => {
      entrees.push(input);
      return evaluationVide(input);
    },
    clock: () => NOW,
    logger: {
      info: (message: string) => messages.push(message),
      error: (message: string) => messages.push(message),
    },
    config: {
      bridgeUrl: 'https://pont.demo/v2',
      version: '1.0.0',
      siteUrl: SITE,
      adminAccountId: 'admin',
      locale: 'fr',
    },
  } as unknown as BridgeDeps;
  return { deps, entrees, messages };
}

/** Corps JSON d'une réponse du pont. */
function corps(reponse: { body: string }): Record<string, unknown> {
  return JSON.parse(reponse.body) as Record<string, unknown>;
}

describe('route health — empreinte du contrat (audit 79)', () => {
  it('annonce l’empreinte du contrat partagé', async () => {
    const { deps } = depsFictifs();
    const reponse = await ROUTES.health({}, deps);
    expect(reponse.statusCode).toBe(200);
    expect(corps(reponse).contrat).toBe(EMPREINTE_CONTRAT);
    expect(String(corps(reponse).contrat)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('route evaluate — composition des règles du dépôt (audit 20)', () => {
  it('durcit une règle du dépôt sur ce dépôt', async () => {
    const { deps, entrees } = depsFictifs();
    await ROUTES.evaluate(
      { ...PAYLOAD, depotRules: [{ code: 'R-05', level: 'blocking' }] },
      deps,
    );
    const configs = entrees[0].configs;
    expect(configs).toHaveLength(2);
    expect(configs[1]).toMatchObject({
      rule: 'R-05',
      level: 'blocking',
      scope: { repositories: ['checkout-api'] },
    });
  });

  it('ignore et journalise un niveau plus permissif imposé par le dépôt', async () => {
    const { deps, entrees, messages } = depsFictifs();
    await ROUTES.evaluate(
      { ...PAYLOAD, depotRules: [{ code: 'R-05', level: 'information' }] },
      deps,
    );
    expect(entrees[0].configs[1].level).toBe('warning');
    expect(messages.join(' ')).toContain('plus permissif');
  });

  it('ignore et journalise un mode observation imposé par le dépôt', async () => {
    const { deps, entrees, messages } = depsFictifs();
    await ROUTES.evaluate(
      { ...PAYLOAD, depotRules: [{ code: 'R-05', level: 'blocking', mode: 'observe' }] },
      deps,
    );
    expect(entrees[0].configs[1].mode).toBe('active');
    expect(messages.join(' ')).toContain('observation');
  });

  it('évalue normalement une PR sans fichier de règles', async () => {
    const { deps, entrees } = depsFictifs();
    const reponse = await ROUTES.evaluate(PAYLOAD, deps);
    expect(reponse.statusCode).toBe(200);
    expect(entrees[0].configs).toEqual(CONFIGS_ESPACE);
  });

  it('rejette une charge utile dont depotRules n’est pas une liste de règles', async () => {
    const { deps } = depsFictifs();
    // Les gestionnaires lèvent une `BridgeError` ; le handler la traduit en 400.
    await expect(ROUTES.evaluate({ ...PAYLOAD, depotRules: 'R-05' }, deps)).rejects.toThrow();
  });
});
