/**
 * Réglages de l'espace de travail Bitbucket (§13.3, §13.5).
 *
 * Deux réglages par espace de travail :
 * - `fallbackPolicy` : 'open' (défaut) ou 'closed' ;
 * - `envoiDesChemins` : vrai (défaut) si la liste des fichiers modifiés est
 *   transmise au Cerveau (désactivable pour sobriété / secret des chemins).
 */
import type { FallbackPolicy } from '../shared';
import { unwrapUuid } from '../bitbucket/types';
import type { ForgeStorageClient } from '../pairing/store';

/** Valeurs par défaut du produit : ouvert, chemins envoyés (§13.3, §13.5). */
export const DEFAUT_REPLI: FallbackPolicy = 'open';
export const DEFAUT_ENVOI_CHEMINS = true;

export interface WorkspaceSettings {
  fallbackPolicy: FallbackPolicy;
  envoiDesChemins: boolean;
}

/** Port d'accès aux réglages par espace de travail. */
export interface SettingsStore {
  getSettings(workspaceUuid: string): Promise<WorkspaceSettings>;
  setFallbackPolicy(workspaceUuid: string, policy: FallbackPolicy): Promise<void>;
  setEnvoiDesChemins(workspaceUuid: string, actif: boolean): Promise<void>;
}

const cleSettings = (ws: string) => `mac:settings:${unwrapUuid(ws)}`;

/**
 * Implémentation adossée au KVS de Forge Storage.
 *
 * Le client est injecté (`defaultForgeStorage()` côté app) pour que ce module
 * reste sans import de valeur `@forge/*` : la logique par défaut et la version
 * mémoire sont testables hors plateforme.
 */
export class ForgeSettingsStore implements SettingsStore {
  constructor(private readonly client: ForgeStorageClient) {}

  async getSettings(workspaceUuid: string): Promise<WorkspaceSettings> {
    const valeur = await this.client.get(cleSettings(workspaceUuid));
    if (!valeur || typeof valeur !== 'object') {
      return { fallbackPolicy: DEFAUT_REPLI, envoiDesChemins: DEFAUT_ENVOI_CHEMINS };
    }
    const rec = valeur as Record<string, unknown>;
    return {
      fallbackPolicy: rec.fallbackPolicy === 'closed' ? 'closed' : DEFAUT_REPLI,
      envoiDesChemins: typeof rec.envoiDesChemins === 'boolean' ? rec.envoiDesChemins : DEFAUT_ENVOI_CHEMINS,
    };
  }

  async setFallbackPolicy(workspaceUuid: string, policy: FallbackPolicy): Promise<void> {
    const actuels = await this.getSettings(workspaceUuid);
    await this.client.set(cleSettings(workspaceUuid), { ...actuels, fallbackPolicy: policy });
  }

  async setEnvoiDesChemins(workspaceUuid: string, actif: boolean): Promise<void> {
    const actuels = await this.getSettings(workspaceUuid);
    await this.client.set(cleSettings(workspaceUuid), { ...actuels, envoiDesChemins: actif });
  }
}

/** Implémentation mémoire pour les tests. */
export class MemorySettingsStore implements SettingsStore {
  private donnees = new Map<string, WorkspaceSettings>();

  async getSettings(workspaceUuid: string): Promise<WorkspaceSettings> {
    const trouve = this.donnees.get(unwrapUuid(workspaceUuid));
    return trouve ?? { fallbackPolicy: DEFAUT_REPLI, envoiDesChemins: DEFAUT_ENVOI_CHEMINS };
  }

  async setFallbackPolicy(workspaceUuid: string, policy: FallbackPolicy): Promise<void> {
    const actuels = await this.getSettings(workspaceUuid);
    this.donnees.set(unwrapUuid(workspaceUuid), { ...actuels, fallbackPolicy: policy });
  }

  async setEnvoiDesChemins(workspaceUuid: string, actif: boolean): Promise<void> {
    const actuels = await this.getSettings(workspaceUuid);
    this.donnees.set(unwrapUuid(workspaceUuid), { ...actuels, envoiDesChemins: actif });
  }
}
