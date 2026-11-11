/**
 * Adaptateur : le stockage du Cerveau (`storage/ports.ts`) vu comme le dépôt de
 * jumelage du pont (`bridge/deps.ts`).
 *
 * Deux écarts sont absorbés ici, sans toucher aux modules déjà mergés :
 * - le pont raisonne par espace de travail Bitbucket, le stockage garde UN
 *   jumelage par installation (une app Jira = un site) ;
 * - le pont manipule le secret en clair, la base ne garde qu'une référence :
 *   le coffre (`app/secrets.ts`) fait la traduction.
 */
import { normalizePairingCode } from '../shared';
import type { PairingRecord, PairingRepository } from '../bridge/deps';
import type { Store } from '../storage/ports';
import type { AppConfig } from './config';
import type { SecretVault } from './secrets';

/** Lit le jumelage courant et résout son secret dans le coffre. */
async function recordCourant(store: Store, vault: SecretVault, config: AppConfig): Promise<PairingRecord | undefined> {
  const enregistre = await store.pairing.current();
  if (!enregistre) return undefined;
  const secret = await vault.read(enregistre.secretRef);
  if (!secret) return undefined;
  return {
    workspaceUuid: enregistre.workspaceUuid,
    secret,
    siteUrl: config.siteUrl,
    pairedAt: enregistre.pairedAt,
  };
}

/** Fabrique le `PairingRepository` attendu par le pont. */
export function createPairingRepository(store: Store, vault: SecretVault, config: AppConfig): PairingRepository {
  return {
    async saveOffer(offer) {
      await store.pairing.saveOffer(offer);
    },
    async findOffer(code) {
      const offre = await store.pairing.currentOffer();
      if (!offre) return undefined;
      return normalizePairingCode(offre.code) === normalizePairingCode(code) ? offre : undefined;
    },
    async markOfferUsed(code) {
      await store.pairing.markOfferUsed(normalizePairingCode(code));
    },
    async savePairing(pairing) {
      const reference = await vault.write(pairing.secret);
      await store.pairing.recordPairing({
        workspaceUuid: pairing.workspaceUuid,
        secretRef: reference,
        pairedAt: pairing.pairedAt,
        pairedBy: config.adminAccountId,
      });
    },
    async pairingForWorkspace(workspaceUuid) {
      const record = await recordCourant(store, vault, config);
      return record && record.workspaceUuid === workspaceUuid ? record : undefined;
    },
    async pairings() {
      const record = await recordCourant(store, vault, config);
      return record ? [record] : [];
    },
    async fallbackPolicy() {
      return store.pairing.fallbackPolicy();
    },
  };
}
