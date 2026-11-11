/**
 * Port du stockage de jumelage côté Bitbucket (§13.3, MC-01).
 *
 * Le secret partagé est protégé par `setSecret`/`getSecret` de Forge Storage.
 * L'adresse du pont, la date et le site jumelé vivent dans le KVS ordinaire.
 * Les deux implémentations (Forge et mémoire) partagent la même interface.
 */
import { getStorageInstanceWithQuery, GlobalStorage } from '@forge/storage';
import { __requestAtlassianAsApp } from '@forge/api';
import type { FallbackPolicy } from '../shared';
import { unwrapUuid } from '../bitbucket/types';

/** État complet du jumelage d'un espace de travail Bitbucket. */
export interface PairingRecord {
  bridgeUrl: string;
  siteUrl: string;
  pairedAt: string;
  pairedBy?: string;
}

/** Port d'accès au secret, à l'adresse du pont et au repli. */
export interface PairingStore {
  getSecret(workspaceUuid: string): Promise<string | undefined>;
  setSecret(workspaceUuid: string, secret: string): Promise<void>;
  getBridgeUrl(workspaceUuid: string): Promise<string | undefined>;
  getPairing(workspaceUuid: string): Promise<PairingRecord | undefined>;
  savePairing(workspaceUuid: string, record: PairingRecord, secret: string): Promise<void>;
  clearPairing(workspaceUuid: string): Promise<void>;
  getFallbackPolicy(workspaceUuid: string): Promise<FallbackPolicy>;
  setFallbackPolicy(workspaceUuid: string, policy: FallbackPolicy): Promise<void>;
}

/** Clés de stockage par espace de travail. */
const cleSecret = (ws: string) => `mac:secret:${unwrapUuid(ws)}`;
const cleInfo = (ws: string) => `mac:pairing:${unwrapUuid(ws)}`;
const cleRepli = (ws: string) => `mac:fallback:${unwrapUuid(ws)}`;

/** Accès brut Forge Storage (KVS + secrets chiffrés). */
export interface ForgeStorageClient {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  getSecret(key: string): Promise<unknown>;
  setSecret(key: string, value: unknown): Promise<void>;
  deleteSecret(key: string): Promise<void>;
}

/** Crée le client Forge Storage par défaut pour le runtime de l'app. */
export function defaultForgeStorage(): ForgeStorageClient {
  const adapter = new GlobalStorage(__requestAtlassianAsApp, () => undefined);
  return getStorageInstanceWithQuery(adapter);
}

/** Implémentation adossée à `@forge/storage`. */
export class ForgePairingStore implements PairingStore {
  constructor(private readonly client: ForgeStorageClient = defaultForgeStorage()) {}

  async getSecret(workspaceUuid: string): Promise<string | undefined> {
    const valeur = await this.client.getSecret(cleSecret(workspaceUuid));
    return typeof valeur === 'string' && valeur.length > 0 ? valeur : undefined;
  }

  async setSecret(workspaceUuid: string, secret: string): Promise<void> {
    await this.client.setSecret(cleSecret(workspaceUuid), secret);
  }

  async getBridgeUrl(workspaceUuid: string): Promise<string | undefined> {
    const record = await this.getPairing(workspaceUuid);
    return record?.bridgeUrl;
  }

  async getPairing(workspaceUuid: string): Promise<PairingRecord | undefined> {
    const brut = await this.client.get(cleInfo(workspaceUuid));
    if (!brut || typeof brut !== 'object') return undefined;
    const rec = brut as Record<string, unknown>;
    if (typeof rec.bridgeUrl !== 'string' || typeof rec.siteUrl !== 'string') return undefined;
    return {
      bridgeUrl: rec.bridgeUrl,
      siteUrl: rec.siteUrl,
      pairedAt: typeof rec.pairedAt === 'string' ? rec.pairedAt : '',
      pairedBy: typeof rec.pairedBy === 'string' ? rec.pairedBy : undefined,
    };
  }

  async savePairing(workspaceUuid: string, record: PairingRecord, secret: string): Promise<void> {
    await this.client.setSecret(cleSecret(workspaceUuid), secret);
    await this.client.set(cleInfo(workspaceUuid), record);
  }

  async clearPairing(workspaceUuid: string): Promise<void> {
    await this.client.deleteSecret(cleSecret(workspaceUuid));
    await this.client.delete(cleInfo(workspaceUuid));
  }

  async getFallbackPolicy(workspaceUuid: string): Promise<FallbackPolicy> {
    const valeur = await this.client.get(cleRepli(workspaceUuid));
    return valeur === 'closed' ? 'closed' : 'open';
  }

  async setFallbackPolicy(workspaceUuid: string, policy: FallbackPolicy): Promise<void> {
    await this.client.set(cleRepli(workspaceUuid), policy);
  }
}

/** Implémentation mémoire pour les tests et le développement local. */
export class MemoryPairingStore implements PairingStore {
  private secrets = new Map<string, string>();
  private pairings = new Map<string, PairingRecord>();
  private fallbacks = new Map<string, FallbackPolicy>();

  async getSecret(workspaceUuid: string): Promise<string | undefined> {
    return this.secrets.get(unwrapUuid(workspaceUuid));
  }

  async setSecret(workspaceUuid: string, secret: string): Promise<void> {
    this.secrets.set(unwrapUuid(workspaceUuid), secret);
  }

  async getBridgeUrl(workspaceUuid: string): Promise<string | undefined> {
    return this.pairings.get(unwrapUuid(workspaceUuid))?.bridgeUrl;
  }

  async getPairing(workspaceUuid: string): Promise<PairingRecord | undefined> {
    return this.pairings.get(unwrapUuid(workspaceUuid));
  }

  async savePairing(workspaceUuid: string, record: PairingRecord, secret: string): Promise<void> {
    const id = unwrapUuid(workspaceUuid);
    this.secrets.set(id, secret);
    this.pairings.set(id, record);
  }

  async clearPairing(workspaceUuid: string): Promise<void> {
    const id = unwrapUuid(workspaceUuid);
    this.secrets.delete(id);
    this.pairings.delete(id);
  }

  async getFallbackPolicy(workspaceUuid: string): Promise<FallbackPolicy> {
    return this.fallbacks.get(unwrapUuid(workspaceUuid)) ?? 'open';
  }

  async setFallbackPolicy(workspaceUuid: string, policy: FallbackPolicy): Promise<void> {
    this.fallbacks.set(unwrapUuid(workspaceUuid), policy);
  }
}
