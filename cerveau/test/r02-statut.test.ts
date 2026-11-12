/**
 * R-02 — le statut autorisé, sans dépendre de la langue du site.
 *
 * Le défaut relevé en production : la liste blanche mémorisée contenait des
 * noms français (« À faire », « En cours »), le site renvoyait « In Progress »
 * — tout ticket réel était bloqué à tort. Ces tests verrouillent la
 * comparaison par nom traduit, par identifiant Jira et par catégorie, et la
 * rétrocompatibilité des listes mémorisées.
 */
import { describe, expect, it } from 'vitest';
import type { IssueContext, PrContext, RuleConfig, RuleInput } from '../src/shared';
import { defaultRuleConfigs } from '../src/rules/defaults';
import { ruleFor } from '../src/rules/registry';

const NOW = '2026-11-12T09:00:00Z';

/** PR de référence : branche et titre portent la clé PAY-123. */
function pr(): PrContext {
  return {
    workspaceUuid: 'ws-1',
    repositoryUuid: 'repo-uuid',
    repositorySlug: 'payments-api',
    pullRequestId: 42,
    title: 'Limite des tentatives',
    sourceBranch: 'feature/PAY-123-limite-tentatives',
    targetBranch: 'main',
    commitMessages: [],
    changedPaths: [],
    reviewers: [],
    trigger: 'on-code-pushed',
  };
}

/** Ticket de référence : PAY-123, statut et catégorie surchargés au besoin. */
function ticket(over: Partial<IssueContext> = {}): IssueContext {
  return {
    key: 'PAY-123',
    id: '10001',
    exists: true,
    status: 'In Progress',
    statusCategory: 'inProgress',
    criteria: [],
    links: [],
    fixVersions: [],
    labels: [],
    components: [],
    incidentKeys: [],
    ...over,
  };
}

/** Réglage par défaut de R-02, paramètres surchargés au besoin. */
function config(params: Record<string, unknown> = {}): RuleConfig {
  const base = defaultRuleConfigs().find((c) => c.rule === 'R-02');
  if (!base) throw new Error('règle R-02 absente des défauts');
  return { ...base, params: { ...base.params, ...params } };
}

/** Entrée de R-02 prise isolément. */
function input(issues: IssueContext[], params: Record<string, unknown> = {}): RuleInput {
  return {
    pr: pr(),
    issues,
    freezes: [],
    incidents: [],
    waivers: [],
    config: config(params),
    now: NOW,
    locale: 'fr',
  };
}

/** Verdict de R-02 sur les tickets donnés. */
function outcome(issues: IssueContext[], params: Record<string, unknown> = {}) {
  const rule = ruleFor('R-02');
  if (!rule) throw new Error('règle R-02 non enregistrée');
  return rule.evaluate(input(issues, params));
}

describe('R-02 — la langue du site ne doit plus bloquer les tickets', () => {
  it('autorise « In Progress » (identifiant 3) avec la liste par défaut', () => {
    const resultat = outcome([ticket({ status: 'In Progress', statusId: '3' })]);
    expect(resultat.status).toBe('pass');
  });

  it('autorise « En cours » avec la liste par défaut', () => {
    const resultat = outcome([ticket({ status: 'En cours', statusId: '3', statusCategory: 'inProgress' })]);
    expect(resultat.status).toBe('pass');
  });

  it('bloque « Done » et « Terminé(e) »', () => {
    for (const status of ['Done', 'Terminé(e)']) {
      const resultat = outcome([ticket({ status, statusId: '5', statusCategory: 'done' })]);
      expect(resultat.status).toBe('fail');
    }
  });

  it('bloque un statut inconnu', () => {
    const resultat = outcome([ticket({ status: 'Statut inconnu', statusId: '9', statusCategory: undefined })]);
    expect(resultat.status).toBe('fail');
  });

  it('accepte un statut autorisé par son identifiant Jira', () => {
    const resultat = outcome(
      [ticket({ status: 'Statut inconnu', statusId: '3', statusCategory: undefined })],
      { allowedStatuses: ['3'] },
    );
    expect(resultat.status).toBe('pass');
  });

  it('accepte un statut autorisé par sa catégorie', () => {
    const resultat = outcome(
      [ticket({ status: 'Statut inconnu', statusId: '9', statusCategory: 'inProgress' })],
      { allowedStatuses: ['inProgress'] },
    );
    expect(resultat.status).toBe('pass');
  });

  it('accepte les catégories brutes de Jira', () => {
    const resultat = outcome(
      [ticket({ status: 'Statut inconnu', statusId: '9', statusCategory: 'inProgress' })],
      { allowedStatuses: ['indeterminate'] },
    );
    expect(resultat.status).toBe('pass');
  });

  it('laisse les listes mémorisées en français valides sur un site anglais', () => {
    const memorise = ['À faire', 'En cours', 'En revue', 'Prêt pour la livraison'];
    const resultat = outcome(
      [ticket({ status: 'In Progress', statusId: '3', statusCategory: 'inProgress' })],
      { allowedStatuses: memorise },
    );
    expect(resultat.status).toBe('pass');
  });

  it('bloque un statut terminé même quand la liste mémorisée est française', () => {
    const memorise = ['À faire', 'En cours', 'En revue', 'Prêt pour la livraison'];
    const resultat = outcome(
      [ticket({ status: 'Done', statusId: '5', statusCategory: 'done' })],
      { allowedStatuses: memorise },
    );
    expect(resultat.status).toBe('fail');
  });

  it('nomme le statut vu, sa catégorie et les statuts attendus', () => {
    const resultat = outcome([ticket({ status: 'Done', statusId: '5', statusCategory: 'done' })]);
    expect(resultat.reasons[0]?.text).toBe(
      'PAY-123 est au statut « Done » (catégorie « terminé »), attendu : à faire, en cours.',
    );
  });

  it('garde le message simple quand la catégorie est inconnue', () => {
    const resultat = outcome([ticket({ status: 'Statut inconnu', statusId: '9', statusCategory: undefined })]);
    expect(resultat.reasons[0]?.text).toBe(
      'PAY-123 est au statut « Statut inconnu », attendu : à faire, en cours.',
    );
  });
});
