/**
 * Réglages applicatifs persistants sans table dédiée dans le modèle du §14 :
 * la liste des approbateurs de dérogations, éditée depuis la page de réglages
 * du projet (§12, écran 4).
 */
import { clientForgeStorage, type ClientStockage } from './forge-storage';

export interface ReglagesApp {
  approbateurs: string[];
}

export interface ReglagesStore {
  lire(): Promise<ReglagesApp>;
  ecrire(reglages: ReglagesApp): Promise<void>;
}

const CLE = 'mac:reglages-app';

/** Réglages en mémoire : tests et démonstrations. */
export function createMemoryReglagesStore(initial: ReglagesApp = { approbateurs: [] }): ReglagesStore {
  let valeur: ReglagesApp = { approbateurs: [...initial.approbateurs] };
  return {
    async lire() {
      return { approbateurs: [...valeur.approbateurs] };
    },
    async ecrire(reglages) {
      valeur = { approbateurs: [...reglages.approbateurs] };
    },
  };
}

/** Réglages dans le KVS Forge. */
export function createForgeReglagesStore(client: ClientStockage = clientForgeStorage()): ReglagesStore {
  return {
    async lire() {
      const brut = await client.get(CLE);
      if (!brut || typeof brut !== 'object') return { approbateurs: [] };
      const liste = (brut as { approbateurs?: unknown }).approbateurs;
      return { approbateurs: Array.isArray(liste) ? liste.filter((x): x is string => typeof x === 'string') : [] };
    },
    async ecrire(reglages) {
      await client.set(CLE, { approbateurs: reglages.approbateurs });
    },
  };
}
