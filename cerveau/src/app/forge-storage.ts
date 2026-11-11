/**
 * Client de stockage Forge, en un seul endroit.
 *
 * `@forge/storage` n'expose pas d'instance toute prête : il faut brancher
 * l'adaptateur global sur l'appel « as app » (`@forge/api`). Ce module le fait
 * une fois pour le coffre à secrets et pour les réglages applicatifs, afin
 * d'éviter deux branchements identiques.
 */
import { GlobalStorage, getStorageInstanceWithQuery } from '@forge/storage';
import { __requestAtlassianAsApp } from '@forge/api';

/** Surface de stockage utilisée par le Cerveau (KVS + secrets). */
export interface ClientStockage {
  get(cle: string): Promise<unknown>;
  set(cle: string, valeur: unknown): Promise<void>;
  delete(cle: string): Promise<void>;
  getSecret(cle: string): Promise<unknown>;
  setSecret(cle: string, valeur: unknown): Promise<void>;
  deleteSecret(cle: string): Promise<void>;
}

/** Instancie le client de stockage Forge pour l'app courante. */
export function clientForgeStorage(): ClientStockage {
  const adaptateur = new GlobalStorage(__requestAtlassianAsApp, () => undefined);
  return getStorageInstanceWithQuery(adaptateur) as unknown as ClientStockage;
}
