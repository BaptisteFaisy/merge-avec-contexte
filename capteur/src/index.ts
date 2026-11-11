/**
 * Point d'entrée de l'app Forge Bitbucket « Capteur ».
 *
 * Le module `bitbucket:mergeCheck` appelle `runCheck` à chacun des trois
 * déclencheurs (push, changement d'avis de relecteur, tentative de fusion).
 * La carte de PR, le panneau et la page de réglages de l'espace de travail
 * passent par les resolvers ci-dessous.
 *
 * Ces fonctions sont des adaptateurs : elles lisent Bitbucket, appellent le
 * pont signé du Cerveau et rendent le message. Toute la décision se prend
 * côté `shared/` et `cerveau/`.
 */
import type { MergeCheckResponse } from './shared';

/** Payload d'invocation du merge check (§1 de docs/FORGE-API-NOTES.md). */
export interface PullRequestCheckEvent {
  workspace: { uuid: string };
  repository: { uuid: string };
  pullrequest: { id: number };
  trigger: { type: string };
  mergeProperties?: {
    commitMessage: string;
    commitMessageTruncated: boolean;
    mergeStrategy: string;
    closeSourceBranch: boolean;
  };
}

/** Contexte d'extension reçu par les modules d'interface. */
export interface BitbucketExtensionContext {
  type: string;
  location: string;
  workspace?: { uuid: string };
  repository?: { uuid: string };
  pullRequest?: { id: number };
}

function nonImplemente(nom: string): never {
  throw new Error(`${nom} : implémenté par le lot correspondant (voir docs/CONVENTIONS.md)`);
}

/** Contrôle de fusion : renvoie toujours un résultat, jamais d'exception. */
export async function runCheck(_event: PullRequestCheckEvent): Promise<MergeCheckResponse> {
  return nonImplemente('runCheck');
}

/** Carte de PR : ticket reconnu, règles évaluées, raisons, dérogation. */
export async function resolverPrCard(_context: BitbucketExtensionContext): Promise<unknown> {
  return nonImplemente('resolverPrCard');
}

/** Panneau de l'onglet Overview : même détail, en plus large. */
export async function resolverPrPanel(_context: BitbucketExtensionContext): Promise<unknown> {
  return nonImplemente('resolverPrPanel');
}

/** Réglages de l'espace de travail : code de jumelage, état, politique de repli. */
export async function resolverWorkspaceSettings(_context: BitbucketExtensionContext): Promise<unknown> {
  return nonImplemente('resolverWorkspaceSettings');
}
