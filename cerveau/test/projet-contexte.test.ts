/**
 * Les écrans Jira s'ouvrent dans un projet : ses réglages doivent rester dans
 * son propre espace de stockage, pas dans celui du projet par défaut.
 */
import { describe, expect, it } from 'vitest';
import { assemblerCerveau, resolversUi } from '../src/app/compose';
import { projetEffectif } from '../src/app/resolvers-ui';
import { horlogeFixe } from '../src/app/horloge';
import { loggerSilencieux } from '../src/app/logger';
import { createMemoryStore } from '../src/storage/memory-store';
import type { UiDeps } from '../src/app/resolvers-ui';

const NOW = '2026-11-27T16:30:00Z';

function cerveau(projet = 'DEFAUT') {
  return assemblerCerveau({
    store: createMemoryStore(),
    clock: horlogeFixe(NOW),
    logger: loggerSilencieux(),
    config: { projectId: projet },
  });
}

describe('projet porté par le contexte', () => {
  it('retombe sur le projet de la configuration quand le contexte n’en donne pas', () => {
    const deps = cerveau('DEFAUT').uiDeps as UiDeps;
    expect(projetEffectif(deps, undefined)).toBe('DEFAUT');
    expect(projetEffectif(deps, '   ')).toBe('DEFAUT');
  });

  it('utilise le projet du contexte, espaces compris', () => {
    const deps = cerveau('DEFAUT').uiDeps as UiDeps;
    expect(projetEffectif(deps, ' PAY ')).toBe('PAY');
  });

  it('isole les réglages d’un projet à l’autre', async () => {
    const c = cerveau('DEFAUT');
    const ui = resolversUi(c);
    await ui.reglages({ method: 'enregistrerRegles', regles: { 'R-03': { niveau: 'information', mode: 'observe' } } }, 'PROJA');

    const dansA = await c.store.ruleConfig.find('PROJA', 'R-03');
    const dansB = await c.store.ruleConfig.find('PROJB', 'R-03');
    expect(dansA?.mode).toBe('observe');
    expect(dansB).toBeUndefined();

    const vueB = await ui.reglages({ method: 'charger' }, 'PROJB');
    const regleB = vueB.vue.regles.find((ligne) => ligne.code === 'R-03');
    expect(regleB?.niveau).toBe('blocking');
  });
});
