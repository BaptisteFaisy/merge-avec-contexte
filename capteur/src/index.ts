/**
 * Point d'entrée de l'app Forge Bitbucket « Capteur ».
 *
 * Branche les quatre fonctions déclarées dans `capteur/manifest.yml` :
 * `runCheck` (module `bitbucket:mergeCheck`) et les trois resolvers des écrans
 * (`resolverPrCard`, `resolverPrPanel`, `resolverWorkspaceSettings`).
 *
 * Les trois resolvers partagent un seul gestionnaire, et c'est le comportement
 * documenté du paquet `@forge/resolver` (vérifié dans `out/index.d.ts` et
 * `out/index.js` du paquet installé) : `getDefinitions()` renvoie un unique
 * `DefinitionsHandler` qui lit `call.functionKey` — la clé de fonction portée
 * par chaque requête `invoke` — et aiguille via `getFunction(functionKey)`
 * (exception si la clé n'a pas de `define`). L'aiguillage se fait donc sur la
 * clé de la requête, jamais sur le nom de l'export : le README du paquet
 * montre d'ailleurs plusieurs `define` pour un seul gestionnaire exporté.
 * Exporter le même gestionnaire sous les trois clés du manifeste est bien le
 * câblage attendu. La logique est dans `app/resolvers.ts` (pure, testée).
 */
import Resolver from '@forge/resolver';
import { lirePr } from './bitbucket/api';
import { executerControle } from './check/run';
import type { PRCheckEvent } from './bitbucket/types';
import { defaultForgeStorage, ForgePairingStore } from './pairing/store';
import { ForgeSettingsStore } from './policy/settings';
import { avecRepliEnvironnement, lireEnvPairing, reglagesAvecRepliEnvironnement } from './app/env-pairing';
import {
  handlePrCard,
  handlePrPanel,
  handleWorkspaceSettings,
  type BitbucketUiContext,
} from './app/resolvers';
import type { MergeCheckResponse } from './shared';

export type PullRequestCheckEvent = PRCheckEvent;
export type BitbucketExtensionContext = BitbucketUiContext;

/**
 * Le jumelage saisi dans l'écran de réglages a toujours priorité ; les
 * variables d'environnement ne servent que de repli, pour une installation
 * sans navigateur (démo, recette, espace de travail créé pour l'occasion).
 */
const env = lireEnvPairing();
const pairingStore = avecRepliEnvironnement(new ForgePairingStore(), env);
const settingsStore = reglagesAvecRepliEnvironnement(new ForgeSettingsStore(defaultForgeStorage()), env);
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

/**
 * Gestionnaire unique exporté sous les trois clés du manifeste : Forge invoque
 * la fonction déclarée par chaque module, et `@forge/resolver` aiguille sur le
 * `call.functionKey` de la requête vers le bon `define` (voir l'en-tête).
 */
const definitions = resolver.getDefinitions();

export const resolverPrCard = definitions;
export const resolverPrPanel = definitions;
export const resolverWorkspaceSettings = definitions;
