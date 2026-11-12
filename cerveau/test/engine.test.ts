import { describe, expect, it } from 'vitest';
import type {
  IssueContext,
  PrContext,
  RuleCode,
  RuleConfig,
  Waiver,
} from '../src/shared';
import { evaluateAll } from '../src/rules/engine';
import type { EvaluationInput } from '../src/rules/input';
import { defaultRuleConfigs } from '../src/rules/defaults';
import { implementedRuleCodes } from '../src/rules/registry';

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

/** Les treize réglages par défaut, surchargés règle par règle. */
function configs(over: Partial<Record<RuleCode, Partial<RuleConfig>>> = {}): RuleConfig[] {
  return defaultRuleConfigs().map((config) => ({ ...config, ...(over[config.rule] ?? {}) }));
}

/** Entrée du moteur, tout réglé pour une PR sans histoire. */
function input(over: Partial<EvaluationInput> = {}): EvaluationInput {
  return {
    pr: pr(),
    issues: [issue()],
    freezes: [],
    incidents: [],
    waivers: [],
    configs: configs(),
    now: NOW,
    locale: 'fr',
    ...over,
  };
}

const nonCoches = { criteria: [{ text: 'a', done: false }, { text: 'b', done: false }] };

const derogation: Waiver = {
  id: 'w-1',
  prId: 42,
  repositoryUuid: 'repo-uuid',
  rule: 'R-03',
  requestedBy: 'lea',
  grantedBy: 'tech-lead',
  reason: 'correctif de prix avant l’ouverture',
  requestedAt: '2026-11-11T08:00:00Z',
  expiresAt: '2026-11-11T12:00:00Z',
  status: 'granted',
};

describe('evaluateAll — verdict', () => {
  it('autorise une PR dont toutes les règles passent ou ne s’appliquent pas', () => {
    const evaluation = evaluateAll(input());
    expect(evaluation.verdict).toBe('allowed');
    expect(evaluation.reasons).toEqual([]);
    expect(evaluation.issueKeys).toEqual(['PAY-123']);
    expect(evaluation.trigger).toBe('on-code-pushed');
    expect(evaluation.evaluatedAt).toBe(NOW);
  });

  it('bloque dès qu’une raison bloquante non dérogée existe', () => {
    const evaluation = evaluateAll(input({ issues: [issue(nonCoches)] }));
    expect(evaluation.verdict).toBe('blocked');
    expect(evaluation.reasons[0]?.rule).toBe('R-03');
  });

  it('trie les raisons, la plus grave d’abord puis dans l’ordre du catalogue', () => {
    const evaluation = evaluateAll(input({
      issues: [issue({ ...nonCoches, fixVersions: [{ name: '2026.11', released: true }] })],
    }));
    expect(evaluation.reasons.map((raison) => raison.rule)).toEqual(['R-03', 'R-07']);
  });
});

describe('evaluateAll — mode observation', () => {
  it('n’affiche pas une règle en observation et ne bloque pas', () => {
    const evaluation = evaluateAll(input({
      issues: [issue(nonCoches)],
      configs: configs({ 'R-03': { mode: 'observe' } }),
    }));
    expect(evaluation.verdict).toBe('allowed');
    expect(evaluation.reasons[0]?.observed).toBe(true);
    expect(evaluation.observedOnly).toBe(true);
  });

  it('n’annonce observedOnly que si tout ce qui échouait était observé', () => {
    const evaluation = evaluateAll(input({
      // « Done » n'est pas un statut autorisé (la liste par défaut n'admet
      // que l'ouvert et l'en cours) : une raison bloquante survit à
      // l'observation de R-03, le verdict n'est donc pas « observedOnly ».
      issues: [issue({ ...nonCoches, status: 'Done', statusCategory: 'done' })],
      configs: configs({ 'R-03': { mode: 'observe' } }),
    }));
    expect(evaluation.verdict).toBe('blocked');
    expect(evaluation.observedOnly).toBeUndefined();
  });
});

describe('evaluateAll — dérogations', () => {
  it('lève le blocage quand une dérogation couvre la règle', () => {
    const evaluation = evaluateAll(input({ issues: [issue(nonCoches)], waivers: [derogation] }));
    expect(evaluation.verdict).toBe('allowed');
    expect(evaluation.reasons[0]?.waived).toBe(true);
  });

  it('ne protège plus quand la dérogation est expirée', () => {
    const evaluation = evaluateAll(input({
      issues: [issue(nonCoches)],
      now: '2026-11-11T13:00:00Z',
      waivers: [derogation],
    }));
    expect(evaluation.verdict).toBe('blocked');
    expect(evaluation.reasons[0]?.waived).toBeUndefined();
  });

  it('ignore une dérogation accordée à une autre PR', () => {
    const evaluation = evaluateAll(input({
      issues: [issue(nonCoches)],
      waivers: [{ ...derogation, prId: 43 }],
    }));
    expect(evaluation.verdict).toBe('blocked');
  });
});

describe('evaluateAll — plusieurs tickets', () => {
  it('retient le pire résultat et cite le ticket fautif', () => {
    const evaluation = evaluateAll(input({
      pr: pr({ sourceBranch: 'feature/PAY-123-et-PAY-124', title: 'Deux tickets' }),
      issues: [
        issue(),
        issue({ key: 'PAY-124', id: '10002', criteria: [{ text: 'a', done: false }] }),
      ],
    }));
    const raison = evaluation.reasons.find((r) => r.rule === 'R-03');
    expect(raison?.issueKey).toBe('PAY-124');
    expect(raison?.text).toBe('PAY-124 : 1 critère(s) d’acceptation non coché(s).');
  });
});

describe('evaluateAll — portée', () => {
  it('ignore une règle dont la portée ne couvre pas la branche cible', () => {
    const evaluation = evaluateAll(input({
      issues: [issue(nonCoches)],
      configs: configs({ 'R-03': { scope: { branches: ['release/*'] } } }),
    }));
    expect(evaluation.verdict).toBe('allowed');
    expect(evaluation.reasons).toEqual([]);
  });

  it('applique une règle dont la portée couvre la branche par motif', () => {
    const evaluation = evaluateAll(input({
      issues: [issue(nonCoches)],
      configs: configs({ 'R-03': { scope: { branches: ['ma*'] } } }),
    }));
    expect(evaluation.verdict).toBe('blocked');
  });

  it('ignore une règle dont la portée ne couvre pas le dépôt', () => {
    const evaluation = evaluateAll(input({
      issues: [issue(nonCoches)],
      configs: configs({ 'R-03': { scope: { repositories: ['autre-api'] } } }),
    }));
    expect(evaluation.verdict).toBe('allowed');
  });
});

describe('evaluateAll — catalogue', () => {
  it('couvre les treize règles du catalogue', () => {
    expect(implementedRuleCodes()).toHaveLength(13);
  });

  it('ne bloque pas sur une règle non évaluée faute de données', () => {
    const evaluation = evaluateAll(input({ service: undefined }));
    expect(evaluation.verdict).toBe('allowed');
    expect(evaluation.reasons).toEqual([]);
  });
});
