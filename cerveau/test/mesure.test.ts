/**
 * Tests de l'instrumentation (§58, §59) : compteurs et mesure des durées.
 *
 * L'horloge de mesure est injectée et pilotée à la main : aucun `Date.now()`
 * lu dans une fonction testée, aucune attente réelle.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  COMPTEURS_VIDES,
  compteursPartages,
  createCompteurs,
  mesurer,
  mesurerAsync,
  reinitialiserCompteurs,
  type HorlogeMs,
} from '../src/app/mesure';

/** Horloge milliseconde pilotable : on avance le temps à la main. */
function horlogeTest(): { now: HorlogeMs; avancer: (ms: number) => void } {
  let instant = 0;
  return {
    now: () => instant,
    avancer: (ms) => {
      instant += ms;
    },
  };
}

describe('createCompteurs', () => {
  it('part de zéro et rend un instantané lisible', () => {
    const compteurs = createCompteurs();
    expect(compteurs.lire()).toEqual(COMPTEURS_VIDES);
  });

  it('incrémente un compteur, par défaut d’une unité', () => {
    const compteurs = createCompteurs();
    compteurs.incrementer('evaluations');
    compteurs.incrementer('blocages', 3);
    expect(compteurs.lire()).toEqual({ evaluations: 1, blocages: 3, replis: 0, erreursJira: 0 });
  });

  it('rend une copie : muter le résultat ne corrompt pas l’état', () => {
    const compteurs = createCompteurs();
    compteurs.incrementer('replis');
    const copie = compteurs.lire();
    copie.replis = 999;
    expect(compteurs.lire().replis).toBe(1);
  });

  it('isole deux jeux de compteurs', () => {
    const a = createCompteurs();
    const b = createCompteurs();
    a.incrementer('evaluations', 5);
    expect(a.lire().evaluations).toBe(5);
    expect(b.lire().evaluations).toBe(0);
  });
});

describe('compteursPartages', () => {
  beforeEach(() => {
    reinitialiserCompteurs();
  });

  it('rend la même instance tant qu’il n’est pas réinitialisé', () => {
    const a = compteursPartages();
    a.incrementer('erreursJira');
    expect(compteursPartages().lire().erreursJira).toBe(1);
    expect(compteursPartages()).toBe(a);
  });

  it('repart de zéro après réinitialisation', () => {
    compteursPartages().incrementer('blocages', 7);
    reinitialiserCompteurs();
    expect(compteursPartages().lire()).toEqual(COMPTEURS_VIDES);
  });
});

describe('mesurer', () => {
  it('chronomètre une étape synchrone via l’horloge injectée', () => {
    const { now, avancer } = horlogeTest();
    const { valeur, ms } = mesurer(now, () => {
      avancer(42);
      return 'résultat';
    });
    expect(valeur).toBe('résultat');
    expect(ms).toBe(42);
  });

  it('rend une durée nulle pour une étape instantanée', () => {
    const { now } = horlogeTest();
    expect(mesurer(now, () => 1).ms).toBe(0);
  });
});

describe('mesurerAsync', () => {
  it('chronomètre une étape asynchrone via l’horloge injectée', async () => {
    const { now, avancer } = horlogeTest();
    const { valeur, ms } = await mesurerAsync(now, async () => {
      avancer(120);
      return 'ok';
    });
    expect(valeur).toBe('ok');
    expect(ms).toBe(120);
  });

  it('propage une erreur sans perdre la mesure', async () => {
    const { now } = horlogeTest();
    await expect(
      mesurerAsync(now, async () => {
        throw new Error('panne');
      }),
    ).rejects.toThrow('panne');
  });
});
