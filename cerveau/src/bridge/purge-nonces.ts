/**
 * Purge périodique des nonces expirés (item 26).
 *
 * L'anti-rejeu écrit un nonce par requête signée : sans purge, la table
 * `bridge_nonce` grossit indéfiniment. La purge est opportuniste — déclenchée
 * par le handler, au plus une fois par intervalle — parce qu'un web trigger
 * Forge n'a pas de tâche de fond qui lui appartienne, et qu'un déclencheur
 * horaire ne doit pas être la seule condition de propreté de la table.
 *
 * Un échec de purge n'est jamais un échec de requête : la protection contre le
 * rejeu reste en place, seule la table garde des lignes périmées.
 */
import type { NonceStore } from '../shared';

/** Intervalle par défaut entre deux purges : la fenêtre de validité d'une requête. */
export const INTERVALLE_PURGE_MS = 5 * 60 * 1000;

/** Purge opportuniste des nonces. */
export interface PurgeurNonces {
  /** Purge si l'intervalle est écoulé ; rend le nombre de nonces effacés. */
  purgerSiBesoin(now: string): Promise<number>;
}

/** Fabrique un purgeur : l'état (dernière purge) vit dans la closure. */
export function creerPurgeurNonces(
  nonces: NonceStore,
  intervalleMs: number = INTERVALLE_PURGE_MS,
): PurgeurNonces {
  let derniere = Number.NEGATIVE_INFINITY;
  return {
    async purgerSiBesoin(now) {
      const instant = Date.parse(now);
      if (!Number.isFinite(instant) || instant - derniere < intervalleMs) return 0;
      derniere = instant;
      if (nonces.purge === undefined) return 0;
      try {
        return await nonces.purge(now);
      } catch {
        return 0;
      }
    },
  };
}
