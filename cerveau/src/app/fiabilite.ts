/**
 * Fiabilité des lectures Jira du Cerveau (§53, §54, §55, §57).
 *
 * Quatre mécanismes, tous purs et injectés (aucun `setTimeout` réel ni
 * `Date.now()` dans une fonction de ce module : l'horloge et la minuterie sont
 * reçues en paramètre) :
 *
 * - un délai maximal par lecture Jira, avec abandon propre (§53) ;
 * - une retentative bornée sur les seules erreurs transitoires (§54) ;
 * - un disjoncteur partagé par les lectures Jira (§55) ;
 * - une concurrence bornée pour ne pas saturer Jira (§57).
 *
 * Le décorateur `creerLecteurFiable` assemble les trois premiers autour d'un
 * `IssueReader` : il est branché à l'assemblage (`compose.ts`) pour que toutes
 * les lectures Jira de l'app en profitent, sans toucher à la logique pure.
 */
import type { IssueReader } from '../jira/reader';
import { compteursPartages } from './mesure';

// ---------------------------------------------------------------------------
// Horloge et minuterie injectées
// ---------------------------------------------------------------------------

/** Minuterie injectable : d'abord pour rendre le délai testable sans horloge réelle. */
export interface Minuterie {
  /** Programme un rappel dans `ms` millisecondes et rend une poignée. */
  programmer(rappel: () => void, ms: number): unknown;
  /** Annule un rappel programmé. */
  annuler(poignee: unknown): void;
}

/** Minuterie réelle : le seul rapport de ce module au `setTimeout` du runtime. */
export const minuterieReelle: Minuterie = {
  programmer: (rappel, ms) => setTimeout(rappel, ms),
  annuler: (poignee) => clearTimeout(poignee as ReturnType<typeof setTimeout>),
};

/** Délai maximal par défaut d'une lecture Jira : bien sous le budget de cinq secondes. */
export const DELAI_JIRA_MS = 2_500;

/** Récupère un délai en millisecondes, horloge injectée (jamais `Date.now()` ici). */
export type HorlogeMs = () => number;

// ---------------------------------------------------------------------------
// Erreurs de fiabilité
// ---------------------------------------------------------------------------

/** Signale qu'une lecture a été abandonnée parce qu'elle dépassait son délai. */
export class ErreurDelai extends Error {
  constructor(readonly delaiMs: number) {
    super(`lecture Jira abandonnée après ${delaiMs} ms`);
    this.name = 'ErreurDelai';
  }
}

/** Signale un appel refusé parce que le disjoncteur est ouvert. */
export class ErreurDisjoncteurOuvert extends Error {
  constructor() {
    super('disjoncteur Jira ouvert : lecture refusée sans appel distant');
    this.name = 'ErreurDisjoncteurOuvert';
  }
}

// ---------------------------------------------------------------------------
// Délai (§53)
// ---------------------------------------------------------------------------

/**
 * Abandonne `travail` s'il n'a pas abouti en `delaiMs`.
 *
 * L'abandon est « propre » : on cesse d'attendre et on annule la minuterie ;
 * le travail sous-jacent continue en arrière-plan mais son résultat est ignoré
 * (l'API Forge ne permet pas d'annuler une requête REST en vol).
 */
export async function avecDelai<T>(
  travail: () => Promise<T>,
  delaiMs: number,
  minuterie: Minuterie = minuterieReelle,
): Promise<T> {
  let poignee: unknown;
  const lenteur = new Promise<never>((_, rejeter) => {
    poignee = minuterie.programmer(() => rejeter(new ErreurDelai(delaiMs)), delaiMs);
  });
  try {
    return await Promise.race([travail(), lenteur]);
  } finally {
    minuterie.annuler(poignee);
  }
}

/** Attente bornée entre deux tentatives, via la minuterie injectée. */
export function dormir(ms: number, minuterie: Minuterie = minuterieReelle): Promise<void> {
  return new Promise((resoudre) => {
    minuterie.programmer(resoudre, ms);
  });
}

// ---------------------------------------------------------------------------
// Retentative (§54)
// ---------------------------------------------------------------------------

/**
 * Vrai si l'erreur est transitoire (mérite une retentative) — jamais un 404
 * ni un 400, qui sont des réponses définitives de Jira.
 */
export function erreurTransitoire(erreur: unknown): boolean {
  if (erreur instanceof ErreurDelai) return true;
  const statut = (erreur as { status?: unknown } | null | undefined)?.status;
  if (typeof statut === 'number') return statut >= 500 || statut === 429;
  const message = erreur instanceof Error ? erreur.message : String(erreur);
  return /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|EPIPE|socket hang up|fetch failed|network|unreachable|réseau|injoignable/i.test(message);
}

/** Réglages de la retentative : tentatives, recul, classes d'erreur. */
export interface DepsRetentative {
  /** Nombre total de tentatives (1 = aucun retry). Défaut 2. */
  tentatives?: number;
  /** Recul entre deux tentatives, en millisecondes. Défaut 250. */
  reculMs?: number;
  minuterie?: Minuterie;
  /** Classifieur d'erreur transitoire ; défaut `erreurTransitoire`. */
  transitoire?: (erreur: unknown) => boolean;
}

/** Exécute `travail` avec au plus `tentatives` essais, sur erreurs transitoires seulement. */
export async function avecRetentative<T>(travail: () => Promise<T>, deps: DepsRetentative = {}): Promise<T> {
  const tentatives = deps.tentatives ?? 2;
  const recul = deps.reculMs ?? 250;
  const minuterie = deps.minuterie ?? minuterieReelle;
  const transitoire = deps.transitoire ?? erreurTransitoire;
  let dernier: unknown;
  for (let essai = 1; essai <= tentatives; essai += 1) {
    try {
      return await travail();
    } catch (erreur) {
      dernier = erreur;
      if (essai === tentatives || !transitoire(erreur)) throw erreur;
      await dormir(recul, minuterie);
    }
  }
  throw dernier;
}

// ---------------------------------------------------------------------------
// Disjoncteur (§55)
// ---------------------------------------------------------------------------

/** État observable d'un disjoncteur. */
export type EtatDisjoncteur = 'ferme' | 'ouvert' | 'demi-ouvert';

/** Réglages du disjoncteur : seuil, fenêtre d'ouverture, horloge injectée. */
export interface DepsDisjoncteur {
  now: HorlogeMs;
  /** Échecs transitoires consécutifs qui ouvrent le circuit. Défaut 5. */
  seuil?: number;
  /** Durée d'ouverture avant un essai de demi-ouverture. Défaut 30 s. */
  fenetreMs?: number;
  journal?: (message: string) => void;
}

/** Disjoncteur : refuse d'appeler la dépendance tant que le circuit est ouvert. */
export interface Disjoncteur {
  etat(): EtatDisjoncteur;
  executer<T>(travail: () => Promise<T>): Promise<T>;
  reinitialiser(): void;
}

/** État interne mutable d'un disjoncteur. */
interface EtatDisjoncteurInterne {
  echecs: number;
  ouverteDepuis: number | undefined;
  essaiEnCours: boolean;
}

/** État observable déduit de l'état interne, de l'horloge et de la fenêtre. */
function etatDu(
  interne: EtatDisjoncteurInterne,
  now: HorlogeMs,
  fenetre: number,
): EtatDisjoncteur {
  if (interne.essaiEnCours) return 'demi-ouvert';
  if (interne.ouverteDepuis === undefined) return 'ferme';
  return now() - interne.ouverteDepuis >= fenetre ? 'demi-ouvert' : 'ouvert';
}

/** Fabrique un disjoncteur ; seuls les échecs transitoires comptent. */
export function createDisjoncteur(deps: DepsDisjoncteur): Disjoncteur {
  const seuil = deps.seuil ?? 5;
  const fenetre = deps.fenetreMs ?? 30_000;
  const interne: EtatDisjoncteurInterne = { echecs: 0, ouverteDepuis: undefined, essaiEnCours: false };
  const signaler = (message: string) => deps.journal?.(message);

  async function executer<T>(travail: () => Promise<T>): Promise<T> {
    const maintenant = deps.now();
    if (interne.ouverteDepuis !== undefined && maintenant - interne.ouverteDepuis < fenetre) {
      throw new ErreurDisjoncteurOuvert();
    }
    if (interne.essaiEnCours) throw new ErreurDisjoncteurOuvert();
    const depuisOuvert = interne.ouverteDepuis !== undefined;
    if (depuisOuvert) interne.essaiEnCours = true;
    try {
      const resultat = await travail();
      interne.echecs = 0;
      interne.ouverteDepuis = undefined;
      return resultat;
    } catch (erreur) {
      if (erreurTransitoire(erreur)) {
        interne.echecs += 1;
        if (interne.echecs >= seuil || depuisOuvert) {
          interne.ouverteDepuis = deps.now();
          signaler(`disjoncteur Jira ouvert (${interne.echecs} échecs transitoires)`);
        }
      }
      throw erreur;
    } finally {
      interne.essaiEnCours = false;
    }
  }

  return {
    etat: () => etatDu(interne, deps.now, fenetre),
    executer,
    reinitialiser() {
      interne.echecs = 0;
      interne.ouverteDepuis = undefined;
      interne.essaiEnCours = false;
    },
  };
}

/** Disjoncteur partagé par les lectures Jira du processus. */
let disjoncteurPartage: Disjoncteur | undefined;

/** Récupère (et initialise) le disjoncteur partagé des lectures Jira. */
export function disjoncteurJiraPartage(now: HorlogeMs): Disjoncteur {
  disjoncteurPartage ??= createDisjoncteur({ now });
  return disjoncteurPartage;
}

/** Réinitialise le disjoncteur partagé (isolation des tests). */
export function reinitialiserDisjoncteurJira(): void {
  disjoncteurPartage = undefined;
}

// ---------------------------------------------------------------------------
// Concurrence bornée (§57)
// ---------------------------------------------------------------------------

/**
 * Exécute `travail` sur chaque élément avec au plus `limite` opérations en
 * vol, en préservant l'ordre des résultats (comme `Promise.all`).
 */
export async function chargeEnLimite<T, R>(
  elements: readonly T[],
  limite: number,
  travail: (element: T, index: number) => Promise<R>,
): Promise<R[]> {
  const resultats = new Array<R>(elements.length);
  let prochain = 0;
  const ouvrier = async (): Promise<void> => {
    while (prochain < elements.length) {
      const index = prochain;
      prochain += 1;
      resultats[index] = await travail(elements[index], index);
    }
  };
  const effectif = Math.max(1, Math.min(limite, elements.length));
  await Promise.all(Array.from({ length: effectif }, () => ouvrier()));
  return resultats;
}

// ---------------------------------------------------------------------------
// Décorateur de lecteur (§53, §54, §55 réunis)
// ---------------------------------------------------------------------------

/** Réglages du lecteur Jira fiabilisé. */
export interface DepsLecteurFiable {
  /** Délai maximal par lecture ; défaut `DELAI_JIRA_MS`. */
  delaiMs?: number;
  /** Essais par lecture ; défaut 2. */
  tentatives?: number;
  /** Recul entre essais ; défaut 250 ms. */
  reculMs?: number;
  /** Minuterie du délai d'abandon ; défaut la minuterie réelle. */
  minuterie?: Minuterie;
  /** Minuterie du recul entre tentatives ; défaut `minuterie`. */
  minuterieRecul?: Minuterie;
  disjoncteur?: Disjoncteur;
  /** Horloge du disjoncteur, si celui-ci n'est pas fourni. */
  nowMs?: HorlogeMs;
  /** Comptabilise une lecture Jira réellement échouée (défaut : compteur partagé). */
  surErreurJira?: (erreur: unknown) => void;
}

/**
 * Enveloppe un `IssueReader` de délai, de retentative et de disjoncteur.
 *
 * Fonction de câblage : à appliquer une fois à l'assemblage (`compose.ts`),
 * pas dans la logique pure. Les lectures d'incidents héritent des mêmes
 * protections ; une erreur Jira survivante est comptée (item 59).
 */
export function creerLecteurFiable(lecteur: IssueReader, deps: DepsLecteurFiable = {}): IssueReader {
  const delaiMs = deps.delaiMs ?? DELAI_JIRA_MS;
  const minuterie = deps.minuterie ?? minuterieReelle;
  const tentative = {
    tentatives: deps.tentatives,
    reculMs: deps.reculMs,
    minuterie: deps.minuterieRecul ?? minuterie,
  };
  const disjoncteur = deps.disjoncteur ?? disjoncteurJiraPartage(deps.nowMs ?? Date.now);
  const surErreur = deps.surErreurJira ?? ((_erreur) => compteursPartages().incrementer('erreursJira'));

  const protege = <T>(travail: () => Promise<T>): Promise<T> =>
    disjoncteur.executer(() => avecRetentative(() => avecDelai(travail, delaiMs, minuterie), tentative));

  const proteger = <T>(travail: () => Promise<T>): Promise<T> =>
    protege(travail).catch((erreur) => {
      surErreur(erreur);
      throw erreur;
    });

  return {
    lire: (cle) => proteger(() => lecteur.lire(cle)),
    incidentsOuverts: (service) => proteger(() => lecteur.incidentsOuverts(service)),
  };
}
