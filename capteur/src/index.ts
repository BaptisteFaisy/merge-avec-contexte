/**
 * Point d'entrée de l'app Forge Bitbucket « Capteur ».
 *
 * Branche les quatre fonctions déclarées dans `capteur/manifest.yml` :
 * `runCheck` (module `bitbucket:mergeCheck`) et les trois resolvers des écrans
 * (`resolverPrCard`, `resolverPrPanel`, `resolverWorkspaceSettings`).
 *
 * Les resolvers partagent un seul gestionnaire : `@forge/resolver` aiguille sur
 * la clé de fonction portée par la requête, ce qui évite trois câblages
 * identiques. La logique elle-même est dans `app/resolvers.ts` (pure, testée).
 */
import Resolver from '@forge/resolver';
import { lirePr } from './bitbucket/api';
import { executerControle } from './check/run';
import type { PRCheckEvent } from './bitbucket/types';
import { defaultForgeStorage, ForgePairingStore } from './pairing/store';
import { ForgeSettingsStore } from './policy/settings';
import {
  handlePrCard,
  handlePrPanel,
  handleWorkspaceSettings,
  type BitbucketUiContext,
} from './app/resolvers';
import type { MergeCheckResponse } from './shared';

export type PullRequestCheckEvent = PRCheckEvent;
export type BitbucketExtensionContext = BitbucketUiContext;

const pairingStore = new ForgePairingStore();
const settingsStore = new ForgeSettingsStore(defaultForgeStorage());
const deps = { pairingStore, settingsStore, lirePr };

/** Contrôle de fusion : `executerControle` applique lui-même la politique de repli. */
export async function runCheck(event: PullRequestCheckEvent): Promise<MergeCheckResponse> {
  return executerControle(event, deps);
}

const resolver = new Resolver();

resolver.define('resolverPrCard', async (requete) => {
  const payload = (requete.payload ?? {}) as Record<string, unknown>;
  const contexte = (requete.context ?? {}) as BitbucketUiContext;
  return handlePrCard(contexte, payload, deps);
});

resolver.define('resolverPrPanel', async (requete) => {
  const contexte = (requete.context ?? {}) as BitbucketUiContext;
  return handlePrPanel(contexte, deps);
});

resolver.define('resolverWorkspaceSettings', async (requete) => {
  const payload = (requete.payload ?? {}) as Record<string, unknown>;
  const contexte = (requete.context ?? {}) as BitbucketUiContext;
  return handleWorkspaceSettings(contexte, payload, deps);
});

/** Gestionnaire unique : le resolver aiguille sur la clé demandée par l'écran. */
const definitions = resolver.getDefinitions();

export const resolverPrCard = definitions;
export const resolverPrPanel = definitions;
export const resolverWorkspaceSettings = definitions;
