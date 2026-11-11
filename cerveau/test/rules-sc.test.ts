import { describe, expect, it } from 'vitest';
import type { IssueContext, PrContext, RuleCode, RuleConfig, RuleInput } from '../src/shared';
import { defaultRuleConfigs } from '../src/rules/defaults';
import { ruleFor } from '../src/rules/registry';

const NOW = '2026-11-11T09:00:00Z';

/** PR de référence : branche et titre portent la clé PAY-123. */
function pr(over: Partial<PrContext> = {}): PrContext {
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
    ...over,
  };
}

/** Ticket de référence : PAY-123, en cours, sans critère ni lien. */
function issue(over: Partial<IssueContext> = {}): IssueContext {
  return {
    key: 'PAY-123',
    id: '10001',
    exists: true,
    status: 'In Progress',
    criteria: [],
    links: [],
    fixVersions: [],
    labels: [],
    components: [],
    incidentKeys: [],
    ...over,
  };
}

/** Réglage par défaut d'une règle, paramètres surchargés au besoin. */
function configFor(code: RuleCode, params: Record<string, unknown> = {}): RuleConfig {
  const base = defaultRuleConfigs().find((config) => config.rule === code);
  if (!base) throw new Error(`règle absente des défauts : ${code}`);
  return { ...base, params: { ...base.params, ...params } };
}

/** Entrée d'une règle prise isolément. */
function inputFor(code: RuleCode, over: Partial<RuleInput> = {}, params: Record<string, unknown> = {}): RuleInput {
  return {
    pr: pr(),
    issues: [issue()],
    freezes: [],
    incidents: [],
    waivers: [],
    config: configFor(code, params),
    now: NOW,
    locale: 'fr',
    ...over,
  };
}

/** Résultat de la règle demandée sur l'entrée donnée. */
function outcomeOf(code: RuleCode, over: Partial<RuleInput> = {}, params: Record<string, unknown> = {}) {
  const rule = ruleFor(code);
  if (!rule) throw new Error(`règle non enregistrée : ${code}`);
  return rule.evaluate(inputFor(code, over, params));
}

describe('R-08 — heures calmes', () => {
  it('passe dans la plage autorisée (mercredi 10 h, Paris)', () => {
    expect(outcomeOf('R-08').status).toBe('pass');
  });

  it('échoue hors plage, en rappelant la fenêtre', () => {
    const outcome = outcomeOf('R-08', { now: '2026-11-11T20:00:00Z' });
    expect(outcome.status).toBe('fail');
    expect(outcome.reasons[0]?.text).toBe('Fusion sur main hors des heures autorisées (8 h – 18 h).');
    expect(outcome.reasons[0]?.action).toBe('Attendez la plage autorisée ou demandez une dérogation.');
  });

  it('passe quand la branche cible n’est pas concernée', () => {
    expect(outcomeOf('R-08', { pr: pr({ targetBranch: 'develop' }), now: '2026-11-11T20:00:00Z' }).status).toBe('pass');
  });
});

describe('R-09 — revue de sécurité', () => {
  it('passe quand le ticket ne la réclame pas', () => {
    expect(outcomeOf('R-09').status).toBe('pass');
  });

  it('passe quand elle est réclamée et approuvée', () => {
    const outcome = outcomeOf('R-09', {
      issues: [issue({ labels: ['security-review'], securityReviewApproved: true })],
    });
    expect(outcome.status).toBe('pass');
  });

  it('échoue quand elle est réclamée sans approbation', () => {
    const outcome = outcomeOf('R-09', { issues: [issue({ labels: ['security-review'] })] });
    expect(outcome.status).toBe('fail');
    expect(outcome.reasons[0]?.text).toBe(
      'PAY-123 exige une revue de sécurité, elle n’est pas approuvée.',
    );
  });
});

describe('R-10 — un membre de l’équipe propriétaire a approuvé', () => {
  it('passe quand un membre de l’équipe a approuvé', () => {
    const outcome = outcomeOf(
      'R-10',
      {
        service: 'checkout-api',
        pr: pr({ reviewers: [{ accountId: 'acc-1', state: 'approved' }] }),
      },
      { team: ['acc-1', 'acc-2'] },
    );
    expect(outcome.status).toBe('pass');
  });

  it('échoue quand seul un externe a approuvé', () => {
    const outcome = outcomeOf(
      'R-10',
      {
        service: 'checkout-api',
        pr: pr({ reviewers: [{ accountId: 'acc-9', state: 'approved' }] }),
      },
      { team: ['acc-1'] },
    );
    expect(outcome.status).toBe('fail');
    expect(outcome.reasons[0]?.text).toBe(
      'Aucun membre de l’équipe checkout-api n’a approuvé cette PR.',
    );
  });

  it('n’est pas évaluée quand l’équipe est inconnue', () => {
    const outcome = outcomeOf('R-10', { service: 'checkout-api' });
    expect(outcome.status).toBe('not-evaluated');
    expect(outcome.note).toBe('Équipe propriétaire inconnue pour ce dépôt, règle non évaluée.');
  });
});

describe('R-11 — autres tickets référencés', () => {
  it('passe quand la PR ne cite que son ticket', () => {
    const outcome = outcomeOf('R-11', { pr: pr({ commitMessages: ['PAY-123 corrige le calcul'] }) });
    expect(outcome.status).toBe('pass');
  });

  it('signale les autres tickets, sans bloquer', () => {
    const outcome = outcomeOf('R-11', {
      pr: pr({ commitMessages: ['PAY-123 corrige le calcul', 'suite de PAY-999'] }),
    });
    expect(outcome.status).toBe('fail');
    expect(outcome.reasons[0]?.level).toBe('information');
    expect(outcome.reasons[0]?.text).toBe('La PR référence d’autres tickets : PAY-999.');
  });
});

describe('R-12 — fichiers sensibles et plan de retour arrière', () => {
  it('passe sans fichier sensible modifié', () => {
    expect(outcomeOf('R-12', { pr: pr({ changedPaths: ['src/prix.ts'] }) }).status).toBe('pass');
  });

  it('passe quand un plan de retour arrière est joint', () => {
    const outcome = outcomeOf('R-12', {
      pr: pr({ changedPaths: ['migrations/001.sql'] }),
      issues: [issue({ rollbackPlanAttached: true })],
    });
    expect(outcome.status).toBe('pass');
  });

  it('échoue sans plan de retour arrière', () => {
    const outcome = outcomeOf('R-12', { pr: pr({ changedPaths: ['migrations/001.sql'] }) });
    expect(outcome.status).toBe('fail');
    expect(outcome.reasons[0]?.text).toBe(
      'Fichiers sensibles modifiés (migrations/001.sql) sans plan de retour arrière sur PAY-123.',
    );
    expect(outcome.reasons[0]?.action).toBe('Joignez un plan de retour arrière au ticket.');
  });
});

describe('R-13 — dépendances amont livrées', () => {
  const lien = { type: 'Depends on', direction: 'outward' as const, targetKey: 'PAY-50' };

  it('passe quand la dépendance est livrée', () => {
    const outcome = outcomeOf('R-13', {
      issues: [issue({ links: [{ ...lien, targetStatus: 'Done' }] })],
    });
    expect(outcome.status).toBe('pass');
  });

  it('échoue quand la dépendance n’est pas livrée', () => {
    const outcome = outcomeOf('R-13', {
      issues: [issue({ links: [{ ...lien, targetStatus: 'In Progress' }] })],
    });
    expect(outcome.status).toBe('fail');
    expect(outcome.reasons[0]?.text).toBe('Dépendance amont non livrée : PAY-50 (In Progress).');
    expect(outcome.reasons[0]?.action).toBe('Attendez la livraison de PAY-50.');
  });
});
