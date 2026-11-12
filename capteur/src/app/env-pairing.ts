/**
 * Jumelage du Capteur par variables d'environnement.
 *
 * Le chemin produit reste l'écran de réglages de l'espace de travail : un code
 * à usage unique saisi côté Bitbucket (§13.3, MC-01). Mais une installation
 * automatisée — déploiement d'une démo, recette en CI, espace de travail créé
 * pour l'occasion — n'a pas de navigateur sous la main. Ces variables posées
 * par `forge variables set` tiennent alors lieu de jumelage, **en repli
 * seulement** : un jumelage établi par l'écran a toujours priorité.
 *
 * Le secret posé par variable doit l'être en chiffré
 * (`forge variables set MAC_SHARED_SECRET … --encrypt`).
 */
import type { FallbackPolicy } from '../shared';
import type { PairingRecord, PairingStore } from '../pairing/store';
import type { SettingsStore, WorkspaceSettings } from '../policy/settings';
import { DEFAUT_ENVOI_CHEMINS, DEFAUT_REPLI } from '../policy/settings';

/** Ce que l'environnement fournit pour le jumelage. */
export interface EnvPairing {
  bridgeUrl?: string;
  secret?: string;
  siteUrl?: string;
  /** Restreint le repli à un espace précis ; absent = tout espace. */
  workspaceUuid?: string;
  fallbackPolicy?: FallbackPolicy;
  envoiDesChemins?: boolean;
}

/** Variable posée et non vide, sinon `undefined`. */
function variable(env: Record<string, string | undefined>, nom: string): string | undefined {
  const valeur = env[nom];
  return typeof valeur === 'string' && valeur.trim() !== '' ? valeur.trim() : undefined;
}

/** Lit le jumelage demandé par l'environnement. */
export function lireEnvPairing(env: Record<string, string | undefined> = process.env): EnvPairing {
  const politique = variable(env, 'MAC_FALLBACK_POLICY');
  const chemins = variable(env, 'MAC_ENVOI_CHEMINS');
  return {
    bridgeUrl: variable(env, 'MAC_BRIDGE_URL'),
    secret: variable(env, 'MAC_SHARED_SECRET'),
    siteUrl: variable(env, 'MAC_SITE_URL'),
    workspaceUuid: variable(env, 'MAC_WORKSPACE'),
    fallbackPolicy: politique === 'closed' || politique === 'open' ? politique : undefined,
    envoiDesChemins: chemins === undefined ? undefined : chemins !== '0' && chemins.toLowerCase() !== 'false',
  };
}

/** Vrai si l'environnement fournit de quoi jumeler. */
export function envPret(env: EnvPairing): boolean {
  return env.bridgeUrl !== undefined && env.secret !== undefined;
}

/** L'espace demandé correspond-il au repli configuré ? */
function concerne(env: EnvPairing, workspaceUuid: string): boolean {
  return env.workspaceUuid === undefined || env.workspaceUuid === workspaceUuid;
}

/** Enrobe le store de jumelage : l'écran d'abord, l'environnement en repli. */
export function avecRepliEnvironnement(store: PairingStore, env: EnvPairing): PairingStore {
  return {
    async getSecret(workspaceUuid) {
      return (await store.getSecret(workspaceUuid)) ?? (envPret(env) && concerne(env, workspaceUuid) ? env.secret : undefined);
    },
    setSecret: (workspaceUuid, secret) => store.setSecret(workspaceUuid, secret),
    async getBridgeUrl(workspaceUuid) {
      return (await store.getBridgeUrl(workspaceUuid)) ?? (envPret(env) && concerne(env, workspaceUuid) ? env.bridgeUrl : undefined);
    },
    async getPairing(workspaceUuid): Promise<PairingRecord | undefined> {
      const existant = await store.getPairing(workspaceUuid);
      if (existant) return existant;
      if (!envPret(env) || !concerne(env, workspaceUuid) || !env.bridgeUrl) return undefined;
      return { bridgeUrl: env.bridgeUrl, siteUrl: env.siteUrl ?? '', pairedAt: '', pairedBy: 'environnement' };
    },
    savePairing: (workspaceUuid, record, secret) => store.savePairing(workspaceUuid, record, secret),
    clearPairing: (workspaceUuid) => store.clearPairing(workspaceUuid),
    getFallbackPolicy: (workspaceUuid) => store.getFallbackPolicy(workspaceUuid),
    setFallbackPolicy: (workspaceUuid, policy) => store.setFallbackPolicy(workspaceUuid, policy),
  };
}

/**
 * L'administrateur a-t-il déjà réglé cet espace ?
 *
 * Sans `hasSettings`, on retombe sur la comparaison aux valeurs par défaut :
 * un espace volontairement laissé aux défauts ressemble alors à un espace
 * jamais réglé, et la variable d'environnement l'emporte — moindre mal, le
 * réglage explicite reste possible et reprend aussitôt la priorité.
 */
async function aDesReglages(store: SettingsStore, workspaceUuid: string): Promise<boolean> {
  if (store.hasSettings) return store.hasSettings(workspaceUuid);
  const reglages = await store.getSettings(workspaceUuid);
  return reglages.fallbackPolicy !== DEFAUT_REPLI || reglages.envoiDesChemins !== DEFAUT_ENVOI_CHEMINS;
}

/** Enrobe les réglages : valeur posée par variable si rien n'est enregistré. */
export function reglagesAvecRepliEnvironnement(store: SettingsStore, env: EnvPairing): SettingsStore {
  return {
    async getSettings(workspaceUuid): Promise<WorkspaceSettings> {
      const enregistres = await store.getSettings(workspaceUuid);
      if (await aDesReglages(store, workspaceUuid)) return enregistres;
      return {
        fallbackPolicy: env.fallbackPolicy ?? enregistres.fallbackPolicy,
        envoiDesChemins: env.envoiDesChemins ?? enregistres.envoiDesChemins,
      };
    },
    setFallbackPolicy: (workspaceUuid, policy) => store.setFallbackPolicy(workspaceUuid, policy),
    setEnvoiDesChemins: (workspaceUuid, actif) => store.setEnvoiDesChemins(workspaceUuid, actif),
  };
}
