import { describe, expect, it } from 'vitest';
import type { Evaluation, Freeze, IssueContext, Reason, RuleConfig, Waiver } from '../src/shared';
import { formatEvaluation } from '../src/shared';
import type { Approver, EvaluationInput, RovoDeps, StoredEvaluation } from '../src/rovo/deps';
import { runEvaluateMerge } from '../src/rovo/evaluate-merge';
import { runExplainBlock } from '../src/rovo/explain-block';
import { horizon, runListFreezes } from '../src/rovo/list-freezes';
import { runListWaivers } from '../src/rovo/list-waivers';
import { echeance, runRequestWaiver } from '../src/rovo/request-waiver';
import { amorcesConversation, catalogueOutils, descriptionOutil, promptAgent } from '../src/rovo/agent-prompt';

const NOW = '2026-11-11T10:00:00Z';

const ticket: IssueContext = {
  key: 'PAY-123',
  id: '10001',
  exists: true,
  status: 'In Progress',
  statusCategory: 'inProgress',
  summary: 'Paiement en trois fois',
  criteria: [
    { text: 'Le paiement passe', done: true },
    { text: 'Les tests couvrent le remboursement', done: false },
    { text: 'La doc est à jour', done: false },
  ],
  links: [],
  fixVersions: [],
  labels: [],
  components: ['paiement'],
  incidentKeys: [],
};

const gel: Freeze = {
  id: 'f1',
  name: 'Black Friday',
  startsAt: '2026-11-11T08:00:00Z',
  endsAt: '2026-11-30T08:00:00Z',
  branches: ['main'],
  services: [],
  recurrence: { kind: 'none' },
  timezone: 'Europe/Paris',
};

const gelFutur: Freeze = {
  id: 'f2',
  name: 'Fin d’année',
  startsAt: '2026-11-14T00:00:00Z',
  endsAt: '2026-12-31T00:00:00Z',
  branches: ['release/*'],
  services: ['paiement'],
  recurrence: { kind: 'weekly', daysOfWeek: [5] },
  timezone: 'UTC',
};

const configR03: RuleConfig = {
  rule: 'R-03',
  level: 'blocking',
  mode: 'active',
  scope: {},
  params: {},
};

const raisonR03: Reason = {
  rule: 'R-03',
  level: 'blocking',
  text: 'PAY-123 : 2 critères d’acceptation non cochés.',
  action: 'Cochez dans le ticket les critères vraiment validés.',
};

const evaluationBloquee: Evaluation = {
  verdict: 'blocked',
  reasons: [raisonR03],
  issueKeys: ['PAY-123'],
  trigger: 'on-merge',
  evaluatedAt: NOW,
  durationMs: 12,
};

const derogation: Waiver = {
  id: 'w1',
  prId: 42,
  repositoryUuid: 'repo',
  rule: 'R-03',
  requestedBy: 'lea',
  grantedBy: 'sam',
  reason: 'Correctif attendu par le client',
  requestedAt: '2026-11-11T08:00:00Z',
  expiresAt: '2026-11-11T12:00:00Z',
  status: 'granted',
};

const approbateurs: Approver[] = [{ accountId: 'acc-1', displayName: 'Sam Martin' }];

const journal: StoredEvaluation = {
  prId: 42,
  repository: 'paiement-api',
  verdict: 'blocked',
  reasons: [raisonR03],
  issueKeys: ['PAY-123'],
  trigger: 'on-merge',
  evaluatedAt: NOW,
  durationMs: 12,
};

/** Ports mémoire complets : aucun test ne touche Forge, Jira ni l'heure réelle. */
function ports(): RovoDeps {
  return {
    evaluation: async () => evaluationBloquee,
    context: {
      load: async () => ({ issues: [ticket], incidents: [], configs: [configR03], service: 'paiement' }),
    },
    freezes: { active: async () => [gel], upcoming: async () => [gelFutur] },
    waivers: {
      listByIssue: async () => [derogation],
      createRequest: async (draft) => ({
        ...derogation,
        id: 'w9',
        rule: draft.rule,
        status: 'requested',
        grantedBy: undefined,
        expiresAt: draft.expiresAt,
      }),
    },
    evaluations: { latestByIssue: async () => [journal] },
    approvers: { list: async () => approbateurs },
    clock: { now: () => NOW },
    logger: { info: () => undefined, warn: () => undefined },
    locale: 'fr',
  };
}

/** Les ports par défaut, avec la surcharge demandée par un test. */
function depsFixes(surcharge: Partial<RovoDeps> = {}): RovoDeps {
  return { ...ports(), ...surcharge };
}

describe('evaluate-merge', () => {
  it('rend la forme stable de la carte de PR', async () => {
    const sortie = await runEvaluateMerge(depsFixes(), { issueKey: 'pay-123' });
    expect(Object.keys(sortie).sort()).toEqual(
      ['allowed', 'durationMs', 'evaluatedAt', 'message', 'reasons', 'verdict'].sort(),
    );
    expect(sortie.verdict).toBe('blocked');
    expect(sortie.allowed).toBe(false);
    expect(sortie.evaluatedAt).toBe(NOW);
    expect(sortie.durationMs).toBe(12);
  });

  it('produit exactement le message de formatEvaluation', async () => {
    const sortie = await runEvaluateMerge(depsFixes(), { issueKey: 'PAY-123' });
    expect(sortie.message).toBe(formatEvaluation(evaluationBloquee, { locale: 'fr' }));
    expect(sortie.message).toContain('2 critères');
  });

  it('met les raisons à plat, sans undefined', async () => {
    const sortie = await runEvaluateMerge(depsFixes(), { issueKey: 'PAY-123' });
    expect(sortie.reasons).toEqual([
      { rule: 'R-03', level: 'blocking', text: raisonR03.text, action: raisonR03.action },
    ]);
    expect(JSON.parse(JSON.stringify(sortie))).toEqual(sortie);
  });

  it('passe la branche cible par défaut et la branche demandée', async () => {
    const cibles: string[] = [];
    const deps = depsFixes({
      evaluation: async (input: EvaluationInput) => {
        cibles.push(input.pr.targetBranch);
        return evaluationBloquee;
      },
    });
    await runEvaluateMerge(deps, { issueKey: 'PAY-123' });
    await runEvaluateMerge(deps, { issueKey: 'PAY-123', targetBranch: 'release/1.0', repository: 'paiement-api' });
    expect(cibles).toEqual(['main', 'release/1.0']);
  });

  it('refuse une clé vide par un message lisible, sans appeler le moteur', async () => {
    let appele = false;
    const deps = depsFixes({
      evaluation: async () => {
        appele = true;
        return evaluationBloquee;
      },
    });
    const sortie = await runEvaluateMerge(deps, { issueKey: '   ' });
    expect(appele).toBe(false);
    expect(sortie.allowed).toBe(false);
    expect(sortie.verdict).toBe('inconclusive');
    expect(sortie.message).toContain('clé du ticket');
  });
});

describe('explain-block', () => {
  it('reprend la dernière évaluation réelle et la reformate', async () => {
    const sortie = await runExplainBlock(depsFixes(), { issueKey: 'PAY-123' });
    expect(sortie.issueKey).toBe('PAY-123');
    expect(sortie.evaluations).toHaveLength(1);
    expect(sortie.evaluations[0]?.prId).toBe(42);
    expect(sortie.evaluations[0]?.repository).toBe('paiement-api');
    expect(sortie.evaluations[0]?.message).toBe(formatEvaluation(evaluationBloquee, { locale: 'fr' }));
    expect(sortie.summary).toContain('1 PR');
  });

  it('dit clairement qu’il n’y a aucune évaluation', async () => {
    const deps = depsFixes({ evaluations: { latestByIssue: async () => [] } });
    const sortie = await runExplainBlock(deps, { issueKey: 'PAY-404' });
    expect(sortie.evaluations).toEqual([]);
    expect(sortie.summary).toContain('Aucune évaluation');
  });

  it('refuse une clé vide', async () => {
    await expect(runExplainBlock(depsFixes(), { issueKey: '' })).rejects.toThrow(/clé du ticket/);
  });
});

describe('list-freezes', () => {
  it('trie les gels par début et ajoute la fin lisible', async () => {
    const sortie = await runListFreezes(depsFixes(), { days: 7 });
    expect(sortie.now).toBe(NOW);
    expect(sortie.freezes.map((item) => item.name)).toEqual(['Black Friday', 'Fin d’année']);
    expect(sortie.freezes[0]?.endsLabel).toBe('30/11 à 9 h');
    expect(sortie.freezes[0]?.recurrence).toEqual({ kind: 'none' });
    expect(sortie.freezes[1]?.services).toEqual(['paiement']);
  });

  it('dédoublonne un gel à la fois actif et à venir', async () => {
    const deps = depsFixes({
      freezes: { active: async () => [gel], upcoming: async () => [gel] },
    });
    const sortie = await runListFreezes(deps, {});
    expect(sortie.freezes).toHaveLength(1);
  });

  it('rend une liste vide quand il n’y a aucun gel', async () => {
    const deps = depsFixes({ freezes: { active: async () => [], upcoming: async () => [] } });
    const sortie = await runListFreezes(deps, { days: 3 });
    expect(sortie.freezes).toEqual([]);
  });

  it('borne l’horizon et retombe sur 7 jours', () => {
    expect(horizon(undefined)).toBe(7);
    expect(horizon('abc')).toBe(7);
    expect(horizon(0)).toBe(1);
    expect(horizon(9000)).toBe(365);
    expect(horizon('14')).toBe(14);
  });
});

describe('list-waivers', () => {
  it('liste les dérogations en cours avec échéance lisible', async () => {
    const sortie = await runListWaivers(depsFixes(), { issueKey: 'PAY-123' });
    expect(sortie.waivers).toHaveLength(1);
    expect(sortie.waivers[0]).toEqual({
      rule: 'R-03',
      status: 'granted',
      grantedBy: 'sam',
      reason: 'Correctif attendu par le client',
      expiresAt: '2026-11-11T12:00:00Z',
      expiresLabel: '11/11 à 12 h',
    });
  });

  it('écarte une dérogation expirée', async () => {
    const perimee: Waiver = { ...derogation, expiresAt: '2026-11-11T09:00:00Z' };
    const deps = depsFixes({
      waivers: { listByIssue: async () => [perimee], createRequest: async () => perimee },
    });
    const sortie = await runListWaivers(deps, { issueKey: 'PAY-123' });
    expect(sortie.waivers).toEqual([]);
  });

  it('rend une liste vide sans dérogation', async () => {
    const deps = depsFixes({
      waivers: { listByIssue: async () => [], createRequest: async () => derogation },
    });
    const sortie = await runListWaivers(deps, { issueKey: 'PAY-1' });
    expect(sortie).toEqual({ issueKey: 'PAY-1', waivers: [] });
  });
});

describe('request-waiver', () => {
  it('enregistre une demande valide et rend les approbateurs', async () => {
    const sortie = await runRequestWaiver(depsFixes(), {
      issueKey: 'pay-123',
      ruleCode: 'r-03',
      reason: 'Correctif client',
      hours: 2,
    });
    expect(sortie.ok).toBe(true);
    if (!sortie.ok) return;
    expect(sortie.waiverId).toBe('w9');
    expect(sortie.status).toBe('requested');
    expect(sortie.expiresAt).toBe('2026-11-11T12:00:00.000Z');
    expect(sortie.approvers).toEqual([{ accountId: 'acc-1', displayName: 'Sam Martin' }]);
  });

  it('refuse un code de règle inconnu', async () => {
    const sortie = await runRequestWaiver(depsFixes(), {
      issueKey: 'PAY-123',
      ruleCode: 'R-99',
      reason: 'Motif',
      hours: 2,
    });
    expect(sortie).toEqual({ ok: false, field: 'ruleCode', error: expect.stringContaining('R-01 à R-13') });
  });

  it('refuse une durée hors bornes', async () => {
    for (const heures of [0, 73, 1.5, 'x']) {
      const sortie = await runRequestWaiver(depsFixes(), {
        issueKey: 'PAY-123',
        ruleCode: 'R-04',
        reason: 'Motif',
        hours: heures,
      });
      expect(sortie.ok).toBe(false);
      if (!sortie.ok) expect(sortie.field).toBe('hours');
    }
  });

  it('refuse un motif vide et une clé absente', async () => {
    const motifVide = await runRequestWaiver(depsFixes(), {
      issueKey: 'PAY-123', ruleCode: 'R-04', reason: '  ', hours: 1,
    });
    expect(motifVide.ok).toBe(false);
    if (!motifVide.ok) expect(motifVide.field).toBe('reason');
    const sansCle = await runRequestWaiver(depsFixes(), { ruleCode: 'R-04', reason: 'Motif', hours: 1 });
    expect(sansCle.ok).toBe(false);
    if (!sansCle.ok) expect(sansCle.field).toBe('issueKey');
  });

  it('calcule l’échéance depuis l’horloge injectée', () => {
    expect(echeance(NOW, 1)).toBe('2026-11-11T11:00:00.000Z');
    expect(echeance(NOW, 72)).toBe('2026-11-14T10:00:00.000Z');
  });
});

describe('agent-prompt', () => {
  it('nomme les cinq actions dans le prompt et dans le catalogue', () => {
    const prompt = promptAgent('fr');
    for (const cle of ['evaluate-merge', 'explain-block', 'list-freezes', 'list-waivers', 'request-waiver']) {
      expect(prompt).toContain(cle);
    }
    expect(catalogueOutils('fr')).toHaveLength(5);
  });

  it('rend une description par outil, en français et en anglais', () => {
    expect(descriptionOutil('evaluate-merge', 'fr')).toContain('règles');
    expect(descriptionOutil('evaluate-merge', 'en')).toContain('rules');
    expect(descriptionOutil('request-waiver', 'en')).toContain('waiver');
  });

  it('donne les amorces de conversation de la langue demandée', () => {
    expect(amorcesConversation('fr')[0]).toContain('PAY-123');
    expect(amorcesConversation('en')[0]).toContain('blocked');
    expect(amorcesConversation('en')).toHaveLength(4);
  });
});
