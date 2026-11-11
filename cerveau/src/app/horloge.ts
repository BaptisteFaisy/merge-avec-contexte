/**
 * Horloges injectées.
 *
 * Deux formes coexistent dans le Cerveau : le pont attend une fonction
 * `() => string` (`bridge/deps.ts`), les actions Rovo attendent un objet
 * `{ now(): string }` (`rovo/deps.ts`). Ce module fournit l'une et l'autre à
 * partir d'une seule source : aucun autre module ne lit l'heure du système.
 */

/** Horloge du pont : horodatage ISO 8601. */
export type HorlogeIso = () => string;

/** Horloge des actions Rovo. */
export interface HorlogeObjet {
  now(): string;
}

/** Horloge réelle : le seul endroit du dépôt qui lit la date du système. */
export function horlogeReelle(): HorlogeIso {
  return () => new Date().toISOString();
}

/** Horloge figée, pour les tests et les démonstrations. */
export function horlogeFixe(instant: string): HorlogeIso {
  return () => instant;
}

/** Adapte une horloge fonction à la forme objet attendue par Rovo. */
export function enHorlogeObjet(horloge: HorlogeIso): HorlogeObjet {
  return { now: horloge };
}
