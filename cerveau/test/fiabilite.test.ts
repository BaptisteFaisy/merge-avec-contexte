/**
 * Tests de la fiabilité des lectures Jira (§53, §54, §55, §57).
 *
 * Horloge et minuterie injectées : aucun `setTimeout` réel, aucun `Date.now()`
 * lu dans une fonction testée. Les délais sont pilotés à la main.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import type { Incident, IssueContext } from '../src/shared';
import type { IssueReader } from '../src/jira/reader';
import {
  ErreurDelai,
  ErreurDisjoncteurOuvert,
  chargeEnLimite,
  createDisjoncteur,
  creerLecteurFiable,
  erreurTransitoire,
  avecDelai,
  avecRetentative,
  disjoncteurJiraPartage,
  reinitialiserDisjoncteurJira,
  type Minuterie,
} from '../src/app/fiabilite';
import { compteursPartages, reinitialiserCompteurs } from '../src/app/mesure';

/** Minuterie pilotable : les rappels ne partent que quand on le décide. */
function minuterieManuelle() {
  const file = new Map<number, () => void>();
  let id = 0;
  const minuterie: Minuterie = {
    programmer: (rappel) => {
      id += 1;
      file.set(id, rappel);
      return id;
    },
    annuler: (poignee) => {
      file.delete(poignee as number);
    },
  };
  return {
    minuterie,
    declencherTout: () => {
      for (const rappel of [...file.values()]) rappel();
      file.clear();
    },
    enAttente: () => file.size,
  };
}

/** Minuterie immédiate : le recul entre tentatives se résout sans attente réelle. */
const minuterieImmediate: Minuterie = {
  programmer: (rappel) => {
    queueMicrotask(rappel);
    return 0;
  },
  annuler: () => undefined,
};

/** Ticket minimal, suffisant pour distinguer deux lectures. */
function ticket(cle: string): IssueContext {
  return {
    key: cle, id: '1', exists: true, status: 'En cours', criteria: [], links: [],
    fixVersions: [], labels: [], components: [], incidentKeys: [],
  };
}

/** Promesse jamais résolue, pour éprouver le délai. */
function jamais<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

describe('erreurTransitoire', () => {
  it('reconnaît le délai et les 5xx/429 comme transitoires', () => {
    expect(erreurTransitoire(new ErreurDelai(100))).toBe(true);
    expect(erreurTransitoire({ status: 503 })).toBe(true);
    expect(erreurTransitoire({ status: 500 })).toBe(true);
    expect(erreurTransitoire({ status: 429 })).toBe(true);
  });

  it('refuse de retenter un 404, un 400 ou une erreur métier', () => {
    expect(erreurTransitoire({ status: 404 })).toBe(false);
    expect(erreurTransitoire({ status: 400 })).toBe(false);
    expect(erreurTransitoire(new Error('clé inconnue'))).toBe(false);
  });

  it('reconnaît une erreur réseau par son message', () => {
    expect(erreurTransitoire(new Error('fetch failed'))).toBe(true);
    expect(erreurTransitoire(new Error('ECONNRESET'))).toBe(true);
  });
});

describe('avecDelai', () => {
  it('rend le résultat quand le travail aboutit avant le délai', async () => {
    const { minuterie, enAttente } = minuterieManuelle();
    const resultat = await avecDelai(() => Promise.resolve('ok'), 100, minuterie);
    expect(resultat).toBe('ok');
    expect(enAttente()).toBe(0); // la minuterie est annulée
  });

  it('abandonne proprement quand le délai est dépassé', async () => {
    const { minuterie, declencherTout } = minuterieManuelle();
    const promesse = avecDelai(() => jamais<string>(), 100, minuterie);
    declencherTout();
    await expect(promesse).rejects.toBeInstanceOf(ErreurDelai);
  });
});

describe('avecRetentative', () => {
  it('retente une erreur transitoire puis réussit', async () => {
    let appels = 0;
    const travail = async () => {
      appels += 1;
      if (appels === 1) throw new ErreurDelai(50);
      return 'ok';
    };
    const resultat = await avecRetentative(travail, { tentatives: 2, reculMs: 10, minuterie: minuterieImmediate });
    expect(resultat).toBe('ok');
    expect(appels).toBe(2);
  });

  it('ne retente jamais une erreur définitive (404)', async () => {
    let appels = 0;
    const travail = async () => {
      appels += 1;
      throw { status: 404 };
    };
    await expect(
      avecRetentative(travail, { tentatives: 3, reculMs: 10, minuterie: minuterieImmediate }),
    ).rejects.toMatchObject({ status: 404 });
    expect(appels).toBe(1);
  });

  it('épuise les tentatives sur une panne persistante', async () => {
    let appels = 0;
    const travail = async () => {
      appels += 1;
      throw new Error('fetch failed');
    };
    await expect(
      avecRetentative(travail, { tentatives: 2, reculMs: 10, minuterie: minuterieImmediate }),
    ).rejects.toThrow('fetch failed');
    expect(appels).toBe(2);
  });
});

describe('createDisjoncteur', () => {
  let instant = 0;
  const now = () => instant;

  beforeEach(() => {
    instant = 0;
  });

  it('ouvre après le seuil d’échecs transitoires et refuse d’appeler Jira', async () => {
    const disjoncteur = createDisjoncteur({ now, seuil: 2, fenetreMs: 1000 });
    const panne = async () => {
      throw new Error('fetch failed');
    };
    await expect(disjoncteur.executer(panne)).rejects.toThrow();
    expect(disjoncteur.etat()).toBe('ferme');
    await expect(disjoncteur.executer(panne)).rejects.toThrow();
    expect(disjoncteur.etat()).toBe('ouvert');
    await expect(disjoncteur.executer(panne)).rejects.toBeInstanceOf(ErreurDisjoncteurOuvert);
  });

  it('ignore un échec définitif (404) pour l’ouverture', async () => {
    const disjoncteur = createDisjoncteur({ now, seuil: 1, fenetreMs: 1000 });
    await expect(disjoncteur.executer(async () => {
      throw { status: 404 };
    })).rejects.toBeTruthy();
    expect(disjoncteur.etat()).toBe('ferme');
  });

  it('passe en demi-ouverture après la fenêtre et se referme sur un succès', async () => {
    const disjoncteur = createDisjoncteur({ now, seuil: 1, fenetreMs: 1000 });
    await expect(disjoncteur.executer(async () => {
      throw new Error('fetch failed');
    })).rejects.toThrow();
    expect(disjoncteur.etat()).toBe('ouvert');
    instant = 1500;
    expect(disjoncteur.etat()).toBe('demi-ouvert');
    const resultat = await disjoncteur.executer(() => Promise.resolve('ok'));
    expect(resultat).toBe('ok');
    expect(disjoncteur.etat()).toBe('ferme');
  });

  it('rouvre le circuit quand l’essai de demi-ouverture échoue', async () => {
    const disjoncteur = createDisjoncteur({ now, seuil: 1, fenetreMs: 1000 });
    await expect(disjoncteur.executer(async () => {
      throw new Error('fetch failed');
    })).rejects.toThrow();
    instant = 1500;
    await expect(disjoncteur.executer(async () => {
      throw new Error('fetch failed');
    })).rejects.toThrow();
    expect(disjoncteur.etat()).toBe('ouvert');
  });

  it('le disjoncteur partagé est réinitialisable', () => {
    const a = disjoncteurJiraPartage(now);
    const b = disjoncteurJiraPartage(now);
    expect(a).toBe(b);
    reinitialiserDisjoncteurJira();
    expect(disjoncteurJiraPartage(now)).not.toBe(a);
  });
});

describe('chargeEnLimite', () => {
  it('préserve l’ordre des résultats', async () => {
    const resultats = await chargeEnLimite([1, 2, 3, 4], 2, async (n) => n * 10);
    expect(resultats).toEqual([10, 20, 30, 40]);
  });

  it('ne dépasse jamais la concurrence demandée', async () => {
    let enVol = 0;
    let pic = 0;
    const travail = async (n: number) => {
      enVol += 1;
      pic = Math.max(pic, enVol);
      await Promise.resolve();
      enVol -= 1;
      return n;
    };
    await chargeEnLimite([1, 2, 3, 4, 5, 6], 2, travail);
    expect(pic).toBeLessThanOrEqual(2);
  });

  it('rend une liste vide pour une entrée vide', async () => {
    await expect(chargeEnLimite([], 4, async (n: number) => n)).resolves.toEqual([]);
  });
});

/** Lecteur Jira de test : panne pilotable, compteur d’appels. */
class LecteurPilotable implements IssueReader {
  appels = 0;
  constructor(private readonly comportement: () => Promise<IssueContext>) {}
  async lire(): Promise<IssueContext> {
    this.appels += 1;
    return this.comportement();
  }
  async incidentsOuverts(): Promise<Incident[]> {
    return [];
  }
}

describe('creerLecteurFiable', () => {
  let instant = 0;
  const now = () => instant;

  beforeEach(() => {
    instant = 0;
    reinitialiserCompteurs();
    reinitialiserDisjoncteurJira();
  });

  it('applique le délai : un lecteur lent est abandonné', async () => {
    const { minuterie, declencherTout } = minuterieManuelle();
    const lent = new LecteurPilotable(() => jamais<IssueContext>());
    const fiable = creerLecteurFiable(lent, {
      delaiMs: 100, tentatives: 1, minuterie,
      disjoncteur: createDisjoncteur({ now, seuil: 99 }),
    });
    const promesse = fiable.lire('ABC-1');
    declencherTout();
    await expect(promesse).rejects.toBeInstanceOf(ErreurDelai);
  });

  it('retente une panne transitoire puis réussit', async () => {
    const { minuterie } = minuterieManuelle(); // délai inerte : jamais déclenché
    let tentatives = 0;
    const lecteur = new LecteurPilotable(async () => {
      tentatives += 1;
      if (tentatives === 1) throw new Error('fetch failed');
      return ticket('ABC-1');
    });
    const fiable = creerLecteurFiable(lecteur, {
      tentatives: 2, reculMs: 5, minuterie, minuterieRecul: minuterieImmediate,
      disjoncteur: createDisjoncteur({ now, seuil: 99 }),
    });
    const resultat = await fiable.lire('ABC-1');
    expect(resultat.key).toBe('ABC-1');
    expect(lecteur.appels).toBe(2);
  });

  it('compte une erreur Jira survivante dans les compteurs partagés', async () => {
    const { minuterie } = minuterieManuelle();
    const lecteur = new LecteurPilotable(async () => {
      throw { status: 503 };
    });
    const fiable = creerLecteurFiable(lecteur, {
      tentatives: 1, minuterie, minuterieRecul: minuterieImmediate,
      disjoncteur: createDisjoncteur({ now, seuil: 99 }),
    });
    await expect(fiable.lire('ABC-1')).rejects.toBeTruthy();
    expect(compteursPartages().lire().erreursJira).toBe(1);
  });

  it('le disjoncteur ouvert coupe l’appel sans toucher le lecteur', async () => {
    const { minuterie } = minuterieManuelle();
    const lecteur = new LecteurPilotable(async () => {
      throw new Error('fetch failed');
    });
    const disjoncteur = createDisjoncteur({ now, seuil: 1, fenetreMs: 1000 });
    const fiable = creerLecteurFiable(lecteur, {
      tentatives: 1, minuterie, minuterieRecul: minuterieImmediate, disjoncteur,
    });
    await expect(fiable.lire('ABC-1')).rejects.toThrow();
    expect(disjoncteur.etat()).toBe('ouvert');
    const avant = lecteur.appels;
    await expect(fiable.lire('ABC-2')).rejects.toBeInstanceOf(ErreurDisjoncteurOuvert);
    expect(lecteur.appels).toBe(avant); // aucun appel supplémentaire
  });
});
