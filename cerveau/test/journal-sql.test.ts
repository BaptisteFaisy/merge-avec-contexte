/**
 * Journal des évaluations sur Forge SQL — l'écriture qui échouait en production.
 *
 * Le défaut constaté sur l'app déployée : `journal : écriture impossible —
 * ForgeSQLError: Unknown SQL execution error` à chaque évaluation, alors que
 * le démarrage annonçait des migrations passées. La cause est une **dérive de
 * schéma** : la colonne `correlation_id` d'`evaluation` a été déclarée après la
 * création de la table, et `CREATE TABLE IF NOT EXISTS` ne complète jamais une
 * table déjà créée — `migrationRunner`, de son côté, ne rejoue que les
 * opérations dont le nom est absent de `__migrations`. L'insertion citait donc
 * une colonne absente de la table en place.
 *
 * Ces tests rejouent la situation sur le faux moteur Forge SQL
 * (`fake-forge-sql.ts`) : une installation déjà migrée, dont la table
 * `evaluation` a été créée sans la colonne tardive.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoggerCommun } from '../src/app/logger';
import { createEvaluateService } from '../src/app/evaluate';
import { horlogeFixe } from '../src/app/horloge';
import type { EvaluationInput } from '../src/bridge/deps';
import type { IssueReader } from '../src/jira/reader';
import { defaultRuleConfigs } from '../src/rules/defaults';
import type { IssueContext, Reason } from '../src/shared';
import { instructionsMigration, migrationName, runMigrations } from '../src/storage/migrate';
import type { StoredEvaluation } from '../src/storage/ports';
import { createSqlStore } from '../src/storage/sql-store';
import { colonnesDe, demarrerInstallation, executerDdl, installation, lignesDe } from './fake-forge-sql';

vi.mock('@forge/sql', async () => {
  const faux = await import('./fake-forge-sql');
  const module = faux.moduleForgeSql();
  return { ...module, default: module.sql };
});

const NOW = '2026-11-11T10:00:00.000Z';
const WORKSPACE = 'ws-uuid';
const REPO = 'repo-uuid';
/** Nom de la migration d'alignement : le numéro suit les dix créations. */
const ALIGNEMENT = 'v011_evaluation_correlation_id';

/** Une évaluation journalisée, avec ses valeurs par défaut. */
function evaluation(id: string, over: Partial<StoredEvaluation> = {}): StoredEvaluation {
  return {
    id, workspaceUuid: WORKSPACE, repositoryUuid: REPO, pullRequestId: 42, issueKeys: ['PAY-123'],
    trigger: 'on-code-pushed', verdict: 'allowed', reasons: [], evaluatedAt: NOW, durationMs: 100,
    correlationId: `corr-42-${id}`, ...over,
  };
}

/** Installation neuve, schéma appliqué : la base est prête à écrire. */
async function migrer(): Promise<void> {
  demarrerInstallation();
  await runMigrations();
}

/**
 * Installation déjà migrée **avant** le correctif : la table `evaluation`
 * existe sans la colonne tardive, et la migration qui la crée est déjà
 * enregistrée dans `__migrations` — donc jamais rejouée.
 */
function installerAncienneInstallation(): void {
  demarrerInstallation();
  for (const [rang, instruction] of instructionsMigration().entries()) {
    if (instruction.startsWith('ALTER')) continue;
    executerDdl(instruction);
    installation.migrations.add(migrationName(instruction, rang));
  }
  const table = installation.tables.get('evaluation');
  if (table === undefined) throw new Error('la table `evaluation` manque de l’installation simulée');
  table.colonnes = table.colonnes.filter((colonne) => colonne !== 'correlation_id');
}

/** Journal applicatif capturé, pour vérifier qu'aucune erreur n'est émise. */
function journalCapture(): LoggerCommun & { lignes: Array<{ message: string; contexte?: Record<string, unknown> }> } {
  const lignes: Array<{ message: string; contexte?: Record<string, unknown> }> = [];
  const noter = (message: string, contexte?: Record<string, unknown>) => {
    lignes.push({ message, contexte });
  };
  return { lignes, info: noter, warn: noter, error: noter };
}

/** Le ticket connu du lecteur factice. */
const ticket: IssueContext = {
  key: 'PAY-123', id: '10001', exists: true, status: 'En cours', statusCategory: 'inProgress',
  criteria: [{ text: 'Critère A', done: true }], links: [], fixVersions: [], labels: [], components: [],
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

/** Entrée d'évaluation minimale, horodatée par l'horloge injectée. */
function entreeEvaluation(): EvaluationInput {
  return {
    pr: {
      workspaceUuid: WORKSPACE, repositoryUuid: REPO, repositorySlug: REPO, pullRequestId: 42,
      title: 'PAY-123 correctif', sourceBranch: 'feature/PAY-123', targetBranch: 'main',
      commitMessages: ['PAY-123 correctif'], changedPaths: [], reviewers: [], trigger: 'on-code-pushed',
    },
    issueKeys: ['PAY-123'],
    siteUrl: 'https://demo.atlassian.net',
    freezes: [],
    waivers: [],
    configs: defaultRuleConfigs(),
    now: NOW,
    locale: 'fr',
    fallbackPolicy: 'open',
  };
}

describe('dérive de schéma de `evaluation`', () => {
  beforeEach(() => { demarrerInstallation(); });

  it('refuse l’écriture quand la colonne tardive manque (le défaut de production)', async () => {
    installerAncienneInstallation();
    const store = createSqlStore();
    await expect(store.evaluations.record(evaluation('e1')))
      .rejects.toThrow(/Unknown SQL execution error/);
    expect(lignesDe('evaluation')).toHaveLength(0);
  });

  it('aligne une installation déjà migrée : la colonne est ajoutée', async () => {
    installerAncienneInstallation();
    expect(colonnesDe('evaluation')).not.toContain('correlation_id');
    const rapport = await runMigrations();
    expect(rapport.mode).toBe('runner');
    expect(rapport.applied).toEqual([ALIGNEMENT]);
    expect(rapport.declared).toHaveLength(instructionsMigration().length);
    expect(colonnesDe('evaluation')).toContain('correlation_id');
  });

  it('est rejouable : un second passage ne rejoue rien', async () => {
    installerAncienneInstallation();
    await runMigrations();
    const second = await runMigrations();
    expect(second.applied).toEqual([]);
    expect(colonnesDe('evaluation')).toContain('correlation_id');
  });

  it('nomme l’alignement d’après la table et la colonne ajoutée', () => {
    const rangs = instructionsMigration().entries();
    const noms = [...rangs].map(([rang, instruction]) => migrationName(instruction, rang));
    expect(noms.slice(0, 10)).toEqual([
      'v001_pairing', 'v002_rule_config', 'v003_freeze', 'v004_repo_service', 'v005_evaluation',
      'v006_waiver', 'v007_issue_cache', 'v008_service_incident', 'v009_bridge_nonce', 'v010_waiver_audit',
    ]);
    expect(noms[10]).toBe(ALIGNEMENT);
  });
});

describe('journal des évaluations sur Forge SQL', () => {
  beforeEach(async () => { await migrer(); });

  it('écrit l’évaluation puis la relit', async () => {
    const store = createSqlStore();
    await store.evaluations.record(evaluation('e1', { verdict: 'blocked', correlationId: 'corr-42-1' }));
    const relue = await store.evaluations.find('e1');
    expect(relue?.verdict).toBe('blocked');
    expect(relue?.correlationId).toBe('corr-42-1');
    expect(relue?.issueKeys).toEqual(['PAY-123']);
    expect(relue?.reasons).toEqual([]);
  });

  it('garde deux écritures successives de la même PR, sans les écraser', async () => {
    const store = createSqlStore();
    await store.evaluations.record(evaluation('e1', { evaluatedAt: '2026-11-11T10:00:00.000Z' }));
    await store.evaluations.record(evaluation('e2', {
      evaluatedAt: '2026-11-11T11:00:00.000Z', verdict: 'blocked',
    }));
    expect(lignesDe('evaluation')).toHaveLength(2);
    const lues = await store.evaluations.listSince('2026-11-01T00:00:00.000Z');
    expect(lues.map((ligne) => ligne.id)).toEqual(['e2', 'e1']);
    expect((await store.evaluations.latestByPullRequest(REPO, 42))?.id).toBe('e2');
    expect((await store.evaluations.latestByIssue('PAY-123'))?.id).toBe('e2');
  });

  it('est idempotente : rejouer la même écriture ne duplique pas la ligne', async () => {
    const store = createSqlStore();
    await store.evaluations.record(evaluation('e1', { verdict: 'allowed' }));
    await store.evaluations.record(evaluation('e1', { verdict: 'blocked' }));
    expect(lignesDe('evaluation')).toHaveLength(1);
    expect((await store.evaluations.find('e1'))?.verdict).toBe('blocked');
  });

  it('écrit et relit un motif bloquant très long, sans le tronquer', async () => {
    const store = createSqlStore();
    const long: Reason = { rule: 'R-04', level: 'blocking', text: 'gel '.repeat(70_000) };
    await store.evaluations.record(evaluation('e1', { reasons: [long], verdict: 'blocked' }));
    const relue = await store.evaluations.find('e1');
    expect(relue?.reasons[0]?.text).toHaveLength(long.text.length);
    expect(relue?.reasons[0]?.rule).toBe('R-04');
  });

  it('journalise l’évaluation du service, sans « écriture impossible »', async () => {
    const store = createSqlStore();
    const journal = journalCapture();
    const service = createEvaluateService({ store, jira: jiraFactice, clock: horlogeFixe(NOW), logger: journal });
    const evaluationRendue = await service(entreeEvaluation());
    expect(journal.lignes.map((ligne) => ligne.message)).not.toContain('journal : écriture impossible');
    const ligne = await store.evaluations.latestByPullRequest(REPO, 42);
    expect(ligne?.verdict).toBe(evaluationRendue.verdict);
    expect(ligne?.correlationId).toMatch(/^corr-42-/);
  });
});
