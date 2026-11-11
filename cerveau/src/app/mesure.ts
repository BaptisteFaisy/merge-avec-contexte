/**
 * Instrumentation légère du Cerveau (§58, §59).
 *
 * Deux outils, sans dépendance externe :
 * - une décomposition des durées par étape (lecture Jira, base, règles), pour
 *   diagnostiquer un dépassement du budget de cinq secondes ;
 * - des compteurs simples (évaluations, blocages, replis, erreurs Jira),
 *   exposés par un port lisible, de quoi alimenter le journal et un futur
 *   écran — pas un service de métriques.
 *
 * Comme partout dans l'app : aucune lecture de l'heure réelle dans une
 * fonction — l'horloge est reçue en millisecondes. Les compteurs, eux, sont
 * un état observable, pas une mesure du temps.
 */

/** Compteurs observables du Cerveau. */
export interface Compteurs {
  /** Évaluations produites, repli compris. */
  evaluations: number;
  /** Verdicts bloquants. */
  blocages: number;
  /** Évaluations issues d'un repli (§13.5). */
  replis: number;
  /** Lectures Jira ayant échoué après retentatives/disjoncteur. */
  erreursJira: number;
}

/** Clé d'un compteur : une seule source de vérité pour l'incrémenter. */
export type CleCompteur = keyof Compteurs;

/** Port lisible des compteurs : incrémenter, lire un instantané. */
export interface CompteurPort {
  incrementer(cle: CleCompteur, quantite?: number): void;
  lire(): Compteurs;
}

/** Valeur initiale de tout compteur. */
export const COMPTEURS_VIDES: Compteurs = {
  evaluations: 0,
  blocages: 0,
  replis: 0,
  erreursJira: 0,
};

/** Fabrique un jeu de compteurs isolé (tests, instances séparées). */
export function createCompteurs(): CompteurPort {
  const compteurs: Compteurs = { ...COMPTEURS_VIDES };
  return {
    incrementer(cle, quantite = 1) {
      compteurs[cle] += quantite;
    },
    lire() {
      return { ...compteurs };
    },
  };
}

/** Jeu de compteurs partagé par les lectures Jira et le service d'évaluation. */
let partages: CompteurPort | undefined;

/** Compteurs partagés du processus (une seule instance, réinitialisable). */
export function compteursPartages(): CompteurPort {
  partages ??= createCompteurs();
  return partages;
}

/** Réinitialise les compteurs partagés (isolation des tests). */
export function reinitialiserCompteurs(): void {
  partages = undefined;
}

/** Décomposition des durées d'une évaluation, en millisecondes. */
export interface DecompositionDurees {
  /** Lecture des tickets et des incidents (cache + Jira). */
  jiraMs: number;
  /** Lecture en base hors tickets (incidents, correspondances). */
  baseMs: number;
  /** Exécution du moteur de règles. */
  reglesMs: number;
  /** Somme des étapes : le temps de bout en bout mesuré. */
  totalMs: number;
}

/** Horloge en millisecondes, injectée pour mesurer sans lire l'heure réelle. */
export type HorlogeMs = () => number;

/** Mesure la durée d'une étape synchrone. */
export function mesurer<T>(horloge: HorlogeMs, travail: () => T): { valeur: T; ms: number } {
  const debut = horloge();
  const valeur = travail();
  return { valeur, ms: horloge() - debut };
}

/** Mesure la durée d'une étape asynchrone. */
export async function mesurerAsync<T>(
  horloge: HorlogeMs,
  travail: () => Promise<T>,
): Promise<{ valeur: T; ms: number }> {
  const debut = horloge();
  const valeur = await travail();
  return { valeur, ms: horloge() - debut };
}
