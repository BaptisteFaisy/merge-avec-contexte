/**
 * Types communs des trois resolvers des écrans Jira (§12) — aucun import Forge.
 *
 * La logique de chaque écran vit dans son propre module (règle « moins de 500
 * lignes par fichier », `docs/CONVENTIONS.md` §3). Celui-ci garde ce que les
 * trois partagent — les dépendances, le projet effectif, la lecture de la charge
 * utile et l'annuaire des approbateurs — et réexporte la surface publique
 * attendue par `app/compose.ts`.
 *
 * - `resolvers-reglages` : écran 4, les treize règles, le jumelage, la
 *   correspondance dépôt → service et les approbateurs ;
 * - `resolvers-encart` : écran 5, les PR du ticket, la dernière évaluation, les
 *   dérogations (demande et décision) ;
 * - `resolvers-console` : écrans 6 et 7, la simulation à blanc (même moteur,
 *   même message que le contrôle réel, §18 scénario 7) et le journal.
 */
import type { EvaluateService } from '../bridge/deps';
import type { Store } from '../storage/ports';
import type { AppConfig } from './config';
import type { DepsEvaluate } from './evaluate';
import type { HorlogeIso } from './horloge';
import type { LoggerCommun } from './logger';
import type { ReglagesStore } from './reglages';

/** Tout ce dont les resolvers ont besoin : stockage, réglages, moteur, horloge. */
export interface UiDeps {
  store: Store;
  reglages: ReglagesStore;
  config: AppConfig;
  clock: HorlogeIso;
  evaluate: EvaluateService;
  depsEval: DepsEvaluate;
  logger: LoggerCommun;
}

/**
 * Projet concerné par l'appel.
 *
 * Les écrans Jira sont ouverts dans un projet : c'est son identifiant qui
 * range les réglages, pas la valeur par défaut de la configuration. Sans cela,
 * tous les projets d'un site partageraient le même jeu de règles.
 */
export function projetEffectif(deps: UiDeps, projet?: string): string {
  return projet && projet.trim() !== '' ? projet.trim() : deps.config.projectId;
}

/** Champ texte d'une charge utile, ou `undefined`. Commun aux trois écrans. */
export function texte(payload: Record<string, unknown> | undefined, champ: string): string | undefined {
  const valeur = payload?.[champ];
  return typeof valeur === 'string' && valeur.trim() !== '' ? valeur.trim() : undefined;
}

/**
 * Approbateurs effectifs : ceux des réglages, sinon ceux de la configuration.
 *
 * C'est l'annuaire qui dit qui peut accorder ou refuser une dérogation
 * (§12, écran 4 ; décision depuis l'encart, écran 5).
 */
export async function approbateurs(deps: UiDeps): Promise<string[]> {
  const lus = await deps.reglages.lire();
  return lus.approbateurs.length > 0 ? lus.approbateurs : deps.config.approbateurs;
}

export { handleResolverReglages } from './resolvers-reglages';
export { handleResolverEncart } from './resolvers-encart';
export { handleResolverConsole } from './resolvers-console';
