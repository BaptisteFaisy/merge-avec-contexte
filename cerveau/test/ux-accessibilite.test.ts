/**
 * Accessibilité et expérience utilisateur des écrans Jira (items 98 à 103).
 *
 * Ce fichier regroupe les vérifications **sans rendu jsdom** : les modèles de
 * vue et les resolvers qui alimentent les composants testés par ailleurs dans
 * `rendu-ecrans.test.tsx`. On y couvre :
 * - item 101 : le drapeau `onboarding` (aucune évaluation → écran d'accueil) ;
 * - item 102 : un stockage qui ne répond pas produit une erreur lisible
 *   (« base indisponible ») avec la marche à suivre, jamais un écran blanc ;
 * - item 103 : le calcul des règles qui bloquent le plus et de leur taux de
 *   dérogation, sur la fenêtre courante.
 */
import { describe, expect, it } from 'vitest';

import { assemblerCerveau, resolversUi } from '../src/app/compose';
import { horlogeFixe } from '../src/app/horloge';
import { loggerSilencieux } from '../src/app/logger';
import { createMemoryReglagesStore } from '../src/app/reglages';
import { messageErreurEncart } from '../src/app/resolvers-encart';
import { createMemoryStore } from '../src/storage/memory-store';
import type { Store } from '../src/storage/ports';
import type { Evaluation, Waiver } from '../src/shared/types';
import { vmEncart } from '../src/ui/view-model-encart';
import { vmReglages } from '../src/ui/view-model-reglages';

const NOW = '2026-11-27T16:00:00.000Z';

/** Tranche d'une évaluation utile au bloc « ce qui bloque le plus ». */
type EvalBloc = Pick<Evaluation, 'verdict' | 'reasons'>;
/** Tranche d'une dérogation utile au taux de dérogation. */
type WaiverBloc = Pick<Waiver, 'rule' | 'status'>;

describe('item 101 — drapeau d’onboarding de l’encart', () => {
  it('vrai tant qu’aucune évaluation n’a eu lieu, faux ensuite', () => {
    expect(vmEncart({ locale: 'fr', premierUsage: true }).onboarding).toBe(true);
    expect(vmEncart({ locale: 'fr' }).onboarding).toBe(false);
    expect(vmEncart({ locale: 'fr', premierUsage: false }).onboarding).toBe(false);
  });
});

describe('item 102 — messages d’erreur lisibles du Cerveau', () => {
  it('nomme la base indisponible, en français et en anglais, avec la marche à suivre', () => {
    const fr = messageErreurEncart('base-indisponible', 'fr');
    const en = messageErreurEncart('base-indisponible', 'en');
    expect(fr).toContain('Base indisponible');
    expect(fr).toContain('Réessayez');
    expect(en).toContain('Storage unavailable');
    expect(en).toContain('Retry');
  });

  it('un stockage qui échoue produit « base indisponible », pas une erreur brute', async () => {
    const store = createMemoryStore();
    const stats: Store['evaluations']['stats'] = async () => {
      throw new Error('ForgeSQLError: connection refused');
    };
    const storeHs: Store = { ...store, evaluations: { ...store.evaluations, stats } };
    const c = assemblerCerveau({
      store: storeHs,
      reglages: createMemoryReglagesStore({ approbateurs: ['tech-lead'] }),
      clock: horlogeFixe(NOW),
      logger: loggerSilencieux(),
    });

    await expect(resolversUi(c).encart({ method: 'charger' }, 'PAY-123')).rejects.toThrow(/Base indisponible/);
    // L'erreur brute du stockage ne fuite pas : la marche à suivre est donnée.
    await expect(resolversUi(c).encart({ method: 'charger' }, 'PAY-123')).rejects.not.toThrow(/ForgeSQLError/);
  });
});

describe('item 103 — ce qui bloque le plus (calcul)', () => {
  /** Trois évaluations bloquées R-04, deux R-03, une R-01 ; une seule dérogation R-04. */
  const evaluations: EvalBloc[] = [
    { verdict: 'blocked', reasons: [{ rule: 'R-04', level: 'blocking', text: 'gel' }] },
    { verdict: 'blocked', reasons: [{ rule: 'R-04', level: 'blocking', text: 'gel' }] },
    { verdict: 'blocked', reasons: [{ rule: 'R-04', level: 'blocking', text: 'gel' }] },
    { verdict: 'blocked', reasons: [{ rule: 'R-03', level: 'blocking', text: 'critères' }] },
    { verdict: 'blocked', reasons: [{ rule: 'R-03', level: 'blocking', text: 'critères' }] },
    { verdict: 'blocked', reasons: [{ rule: 'R-01', level: 'blocking', text: 'clé' }] },
  ];
  const waivers: WaiverBloc[] = [{ rule: 'R-04', status: 'granted' }];

  it('classe les trois règles les plus bloquantes, taux de dérogation inclus', () => {
    const { blocages } = vmReglages({ locale: 'fr', evaluations, waivers });
    expect(blocages.map((ligne) => ligne.code)).toEqual(['R-04', 'R-03', 'R-01']);
    expect(blocages[0]).toMatchObject({ code: 'R-04', blocages: 3, derogations: 1, tauxDerogation: 33 });
    expect(blocages[1]).toMatchObject({ code: 'R-03', blocages: 2, derogations: 0, tauxDerogation: 0 });
    expect(blocages[2]).toMatchObject({ code: 'R-01', blocages: 1, derogations: 0, tauxDerogation: 0 });
  });

  it('ne compte ni les verdicts autorisés, ni les raisons observées ou déjà dérogées', () => {
    const { blocages } = vmReglages({
      locale: 'fr',
      evaluations: [
        { verdict: 'allowed', reasons: [{ rule: 'R-05', level: 'blocking', text: 'pas bloquant' }] },
        { verdict: 'blocked', reasons: [{ rule: 'R-06', level: 'blocking', text: 'observé', observed: true }] },
        { verdict: 'blocked', reasons: [{ rule: 'R-07', level: 'blocking', text: 'dérogé', waived: true }] },
        { verdict: 'blocked', reasons: [{ rule: 'R-08', level: 'warning', text: 'avertissement' }] },
      ],
    });
    expect(blocages).toEqual([]);
  });

  it('compte une fois par règle une évaluation qui cite deux fois la même règle', () => {
    const { blocages } = vmReglages({
      locale: 'fr',
      evaluations: [
        {
          verdict: 'blocked',
          reasons: [
            { rule: 'R-04', level: 'blocking', text: 'gel A' },
            { rule: 'R-04', level: 'blocking', text: 'gel B' },
          ],
        },
      ],
    });
    expect(blocages[0]).toMatchObject({ code: 'R-04', blocages: 1 });
  });

  it('rend un titre de règle lisible et une liste vide sans blocage', () => {
    const { blocages } = vmReglages({ locale: 'fr', evaluations: [...evaluations], waivers: [...waivers] });
    expect(blocages[0]?.titre.length).toBeGreaterThan(0);
    expect(vmReglages({ locale: 'fr' }).blocages).toEqual([]);
  });
});
