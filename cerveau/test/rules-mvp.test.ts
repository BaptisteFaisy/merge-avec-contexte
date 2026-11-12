import { describe, expect, it } from 'vitest';
import type { Freeze, IssueContext, PrContext, RuleCode, RuleConfig, RuleInput } from '../src/shared';
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

const gel: Freeze = {
  id: 'gel-1',
  name: 'Black Friday',
  startsAt: '2026-11-10T09:00:00Z',
  endsAt: '2026-11-30T09:00:00Z',
  branches: ['main'],
  services: [],
  recurrence: { kind: 'none' },
};

describe('R-01 — la PR est reliée à un ticket Jira existant', () => {
  it('passe quand la branche porte une clé de ticket connue', () => {
    const outcome = outcomeOf('R-01');
    expect(outcome.status).toBe('pass');
    expect(outcome.reasons).toEqual([]);
  });

  it('échoue sans aucune clé de ticket', () => {
    const outcome = outcomeOf('R-01', {
      pr: pr({ sourceBranch: 'feature/sans-cle', title: 'Rien à voir' }),
    });
    expect(outcome.status).toBe('fail');
    expect(outcome.reasons[0]?.text).toBe('Aucun ticket Jira reconnu dans cette PR.');
    expect(outcome.reasons[0]?.action).toBe('Nommez la branche ou le titre avec la clé du ticket (ex. PAY-123).');
  });

  it('échoue avec un message distinct quand la clé est inconnue du site', () => {
    const outcome = outcomeOf('R-01', {
      pr: pr({ sourceBranch: 'feature/PAY-404', title: 'Fantôme' }),
      issues: [issue({ key: 'PAY-404', exists: false })],
    });
    expect(outcome.reasons).toHaveLength(1);
    expect(outcome.reasons[0]?.text).toBe('La clé PAY-404 ne correspond à aucun ticket du site jumelé.');
  });

  it('signale une PR sans aucun ticket une fois et une seule', () => {
    const outcome = outcomeOf('R-01', {
      pr: pr({ sourceBranch: 'feature/migration-sans-ticket', title: 'Migration' }),
      issues: [],
    });
    expect(outcome.status).toBe('fail');
    expect(outcome.reasons).toHaveLength(1);
    expect(outcome.reasons[0]?.text).toContain('Aucun ticket Jira reconnu');
    expect(outcome.reasons[0]?.action).toBe('Nommez la branche ou le titre avec la clé du ticket (ex. PAY-123).');
    expect(outcome.reasons[0]?.level).toBe('warning');
  });

  it('ne répète pas sa raison quand plusieurs clés sont inconnues', () => {
    const outcome = outcomeOf('R-01', {
      pr: pr({ sourceBranch: 'feature/PAY-404', title: 'PAY-405' }),
      issues: [issue({ key: 'PAY-404', exists: false }), issue({ key: 'PAY-405', exists: false })],
    });
    expect(outcome.reasons).toHaveLength(1);
    expect(outcome.reasons[0]?.text).toContain('correspond à aucun ticket');
  });

  it('cite le ticket fautif quand une clé est inconnue parmi d’autres', () => {
    const outcome = outcomeOf('R-01', {
      pr: pr({ sourceBranch: 'feature/PAY-123', title: 'PAY-404' }),
      issues: [issue({ key: 'PAY-123' }), issue({ key: 'PAY-404', exists: false })],
    });
    expect(outcome.reasons).toHaveLength(1);
    expect(outcome.reasons[0]?.issueKey).toBe('PAY-404');
  });
});

describe('R-02 — le ticket est dans un statut autorisé', () => {
  it('passe quand le statut est dans la liste réglée', () => {
    expect(outcomeOf('R-02').status).toBe('pass');
  });

  it('échoue en nommant le statut fautif et les statuts attendus', () => {
    // « Done » est terminé : la liste par défaut n'autorise que l'ouvert et
    // l'en cours, quelle que soit la langue du site.
    const outcome = outcomeOf('R-02', { issues: [issue({ status: 'Done', statusCategory: 'done' })] });
    expect(outcome.status).toBe('fail');
    expect(outcome.reasons[0]?.text).toBe(
      'PAY-123 est au statut « Done » (catégorie « terminé »), attendu : à faire, en cours.',
    );
    expect(outcome.reasons[0]?.issueKey).toBe('PAY-123');
  });
});

describe('R-03 — les critères d’acceptation sont validés', () => {
  it('passe quand tous les critères sont cochés', () => {
    const outcome = outcomeOf('R-03', {
      issues: [issue({ criteria: [{ text: 'a', done: true }, { text: 'b', done: true }] })],
    });
    expect(outcome.status).toBe('pass');
  });

  it('échoue en comptant les critères non cochés', () => {
    const outcome = outcomeOf('R-03', {
      issues: [issue({ criteria: [{ text: 'a', done: true }, { text: 'b', done: false }, { text: 'c', done: false }] })],
    });
    expect(outcome.status).toBe('fail');
    expect(outcome.reasons[0]?.text).toBe('PAY-123 : 2 critère(s) d’acceptation non coché(s).');
    expect(outcome.reasons[0]?.action).toBe('Cochez dans le ticket les critères vraiment validés.');
  });
});

describe('R-04 — aucun gel en cours sur la branche cible', () => {
  it('passe sans gel actif', () => {
    expect(outcomeOf('R-04').status).toBe('pass');
  });

  it('échoue en nommant le gel et sa fin', () => {
    const outcome = outcomeOf('R-04', { freezes: [gel] });
    expect(outcome.status).toBe('fail');
    expect(outcome.reasons[0]?.text).toBe('Gel « Black Friday » sur main jusqu’au 30/11 à 9 h.');
  });
});

describe('R-05 — aucun incident ouvert sur le service touché', () => {
  const incident = {
    service: 'checkout-api',
    incidentKey: 'INC-52',
    openedAt: '2026-11-11T07:00:00Z',
  };

  it('passe sans incident ouvert sur le service', () => {
    expect(outcomeOf('R-05', { service: 'checkout-api' }).status).toBe('pass');
  });

  it('échoue quand un incident est ouvert sur le service', () => {
    const outcome = outcomeOf('R-05', { service: 'checkout-api', incidents: [incident] });
    expect(outcome.status).toBe('fail');
    expect(outcome.reasons[0]?.text).toBe('Incident INC-52 ouvert sur checkout-api.');
  });

  it('laisse passer le correctif lié à l’incident, en raison informative', () => {
    const outcome = outcomeOf('R-05', {
      service: 'checkout-api',
      incidents: [incident],
      issues: [issue({ incidentKeys: ['INC-52'] })],
    });
    expect(outcome.status).toBe('pass');
    expect(outcome.reasons[0]?.level).toBe('information');
    expect(outcome.reasons[0]?.text).toBe('Correctif d’incident INC-52 : la fusion reste autorisée.');
  });

  it('n’est pas évaluée quand le service du dépôt est inconnu', () => {
    const outcome = outcomeOf('R-05', { service: undefined });
    expect(outcome.status).toBe('not-evaluated');
    expect(outcome.reasons).toEqual([]);
    expect(outcome.note).toBe('Service inconnu pour ce dépôt, règle non évaluée.');
  });
});

describe('R-06 — le ticket n’est pas bloqué par un ticket ouvert', () => {
  // La cible placée du côté « outward » est celle qui bloque : PAY-100 bloque
  // PAY-123. Du côté « inward », c'est l'inverse — PAY-123 bloque PAY-100.
  const lien = { type: 'Blocks', direction: 'outward' as const, targetKey: 'PAY-100', targetStatus: 'In Progress' };

  it('passe quand c’est ce ticket qui bloque la cible', () => {
    const outcome = outcomeOf('R-06', {
      issues: [issue({ links: [{ ...lien, direction: 'inward' as const }] })],
    });
    expect(outcome.status).toBe('pass');
  });

  it('passe quand la cible du lien est livrée', () => {
    const outcome = outcomeOf('R-06', {
      issues: [issue({ links: [{ ...lien, targetStatus: 'Done' }] })],
    });
    expect(outcome.status).toBe('pass');
  });

  it('échoue en nommant le ticket bloquant et son statut', () => {
    const outcome = outcomeOf('R-06', { issues: [issue({ links: [lien] })] });
    expect(outcome.status).toBe('fail');
    expect(outcome.reasons[0]?.text).toBe('PAY-123 est bloqué par PAY-100 (In Progress).');
    expect(outcome.reasons[0]?.action).toBe('Livrez d’abord PAY-100, ou demandez une dérogation.');
  });
});

describe('R-07 — la version cible du ticket n’est pas déjà publiée', () => {
  it('passe quand la version cible n’est pas publiée', () => {
    expect(outcomeOf('R-07', { issues: [issue({ fixVersions: [{ name: '2026.12', released: false }] })] }).status).toBe('pass');
  });

  it('échoue quand la version cible est déjà publiée', () => {
    const outcome = outcomeOf('R-07', { issues: [issue({ fixVersions: [{ name: '2026.11', released: true }] })] });
    expect(outcome.status).toBe('fail');
    expect(outcome.reasons[0]?.text).toBe('La version 2026.11 de PAY-123 est déjà publiée.');
    expect(outcome.reasons[0]?.action).toBe('Déplacez le ticket sur la prochaine version.');
  });
});
