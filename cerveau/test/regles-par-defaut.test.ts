/**
 * Une installation neuve n'a aucun réglage en base : sans fusion avec le
 * catalogue, aucune règle ne serait évaluée et tout passerait. Ces tests
 * verrouillent le comportement « le catalogue fournit les défauts ».
 */
import { describe, expect, it } from 'vitest';
import { reglesAvecDefauts, reglesEffectives } from '../src/app/context-repo';
import { assemblerCerveau } from '../src/app/compose';
import { horlogeFixe } from '../src/app/horloge';
import { loggerSilencieux } from '../src/app/logger';
import { createMemoryStore } from '../src/storage/memory-store';
import { createDemoDataset, issueOf, prOf } from '../src/seed/dataset';
import { evaluateAll } from '../src/rules/engine';
import { formatEvaluation, RULE_CODES } from '../src/shared';

const NOW = '2026-11-27T16:30:00Z';
const jeu = createDemoDataset(NOW);

describe('règles par défaut (§8)', () => {
  it('fournit les treize règles du catalogue quand rien n’est réglé', () => {
    const configs = reglesAvecDefauts([]);
    expect(configs).toHaveLength(RULE_CODES.length);
    expect(configs.map((c) => c.rule)).toEqual(RULE_CODES);
    expect(configs.find((c) => c.rule === 'R-03')?.level).toBe('blocking');
    expect(configs.find((c) => c.rule === 'R-01')?.level).toBe('warning');
  });

  it('laisse l’administrateur écraser une règle sans perdre les autres', () => {
    const configs = reglesAvecDefauts([
      { rule: 'R-03', level: 'information', mode: 'observe', scope: { branches: ['main'] }, params: {} },
    ]);
    expect(configs.find((c) => c.rule === 'R-03')?.mode).toBe('observe');
    expect(configs.find((c) => c.rule === 'R-04')?.level).toBe('blocking');
  });

  it('lit les réglages effectifs depuis le store', async () => {
    const store = createMemoryStore();
    expect(await reglesEffectives(store, 'DEMO')).toHaveLength(RULE_CODES.length);
    await store.ruleConfig.upsert('DEMO', { rule: 'R-02', level: 'warning', mode: 'active', scope: {}, params: {} }, NOW);
    const configs = await reglesEffectives(store, 'DEMO');
    expect(configs.find((c) => c.rule === 'R-02')?.level).toBe('warning');
  });

  it('bloque PAY-123 sur une installation neuve, sans aucun réglage saisi', async () => {
    const configs = await reglesEffectives(createMemoryStore(), 'DEMO');
    const evaluation = evaluateAll({
      pr: prOf(jeu, 42)!,
      issues: [issueOf(jeu, 'PAY-123')!],
      freezes: jeu.freezes,
      incidents: jeu.incidents,
      waivers: [],
      service: 'checkout-api',
      configs,
      now: NOW,
      locale: 'fr',
    });
    expect(evaluation.verdict).toBe('blocked');
    expect(formatEvaluation(evaluation)).toContain('critère');
  });

  it('garde la composition cohérente : le pont utilise les mêmes réglages', () => {
    const cerveau = assemblerCerveau({
      store: createMemoryStore(),
      clock: horlogeFixe(NOW),
      logger: loggerSilencieux(),
      config: { projectId: 'DEMO' },
    });
    expect(cerveau.config.projectId).toBe('DEMO');
  });
});
