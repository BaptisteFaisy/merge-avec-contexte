/**
 * Teamwork Graph — point d'entrée du module.
 *
 * Le port (`ports.ts`), la logique pure de résolution des deux sources
 * (`resolution.ts`), la doublure mémoire (`memoire.ts`) et la normalisation des
 * réponses (`graph-normalisation.ts`) sont purs et testables ; l'adaptateur
 * Forge (`forge-graph.ts`) est le seul à importer `@forge/*` et n'est chargé
 * qu'à la demande — un test ne charge donc jamais la plateforme.
 */
import { lecteurTeamworkVide } from './ports';
import type { TeamworkGraphReader } from './ports';

export * from './ports';
export * from './resolution';
export { createMemoryTeamworkReader, memeDepot, relationsDe } from './memoire';
export type { RelationTeamwork } from './memoire';
export { normaliserRelations } from './graph-normalisation';

/** Lecteur mémoïsé : une seule instance par conteneur Forge. */
let lecteur: TeamworkGraphReader | undefined;

/**
 * Lecteur du Teamwork Graph de l'installation, ou un lecteur vide.
 *
 * Hors plateforme (tests, CLI), l'import de l'adaptateur échoue ou la
 * plateforme n'est pas disponible : le repli est un lecteur qui ne trouve
 * rien, jamais une exception. La source 1 du §8 — la table de réglages —
 * reste alors la seule utilisée, comme avant ce module.
 */
export async function lecteurTeamwork(): Promise<TeamworkGraphReader> {
  if (lecteur) return lecteur;
  try {
    const adaptateur = await import('./forge-graph');
    lecteur = adaptateur.createForgeTeamworkReader();
  } catch {
    lecteur = lecteurTeamworkVide();
  }
  return lecteur;
}

/** Oublie le lecteur mémoïsé (tests d'intégration). */
export function reinitialiserTeamwork(): void {
  lecteur = undefined;
}
