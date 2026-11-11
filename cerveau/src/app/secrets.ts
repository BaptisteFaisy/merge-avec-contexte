/**
 * Coffre à secrets (§13.3, §16) : le secret partagé du pont n'est jamais en
 * base, seulement dans le stockage de secrets de Forge. La base ne garde qu'une
 * référence (`pairing.secret_ref`) ; un nouveau jumelage remplace le secret.
 */
import { clientForgeStorage, type ClientStockage } from './forge-storage';

/** Port d'accès au secret partagé. */
export interface SecretVault {
  /** Enregistre un secret et rend la référence à conserver en base. */
  write(valeur: string): Promise<string>;
  /** Lit un secret par sa référence ; `undefined` s'il a disparu. */
  read(reference: string): Promise<string | undefined>;
  /** Remplace un secret existant (rotation) ; rend la référence. */
  rotate(reference: string, valeur: string): Promise<string>;
}

/** Préfixe des références, pour les reconnaître dans la base. */
export const PREFIXE_REFERENCE = 'secret-pont';

/** Coffre en mémoire : tests et démonstrations sans plateforme. */
export function createMemorySecretVault(): SecretVault {
  const secrets = new Map<string, string>();
  let compteur = 0;
  return {
    async write(valeur) {
      compteur += 1;
      const reference = `${PREFIXE_REFERENCE}-${compteur}`;
      secrets.set(reference, valeur);
      return reference;
    },
    async read(reference) {
      return secrets.get(reference);
    },
    async rotate(reference, valeur) {
      secrets.set(reference, valeur);
      return reference;
    },
  };
}

/** Coffre adossé au stockage de secrets Forge. */
export function createForgeSecretVault(client: ClientStockage = clientForgeStorage()): SecretVault {
  let compteur = 0;
  return {
    async write(valeur) {
      compteur += 1;
      const reference = `${PREFIXE_REFERENCE}-${compteur}`;
      await client.setSecret(reference, valeur);
      return reference;
    },
    async read(reference) {
      const valeur = await client.getSecret(reference);
      return typeof valeur === 'string' && valeur.length > 0 ? valeur : undefined;
    },
    async rotate(reference, valeur) {
      await client.setSecret(reference, valeur);
      return reference;
    },
  };
}
