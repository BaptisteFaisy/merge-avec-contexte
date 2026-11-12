/**
 * Réglages applicatifs persistants sans table dédiée dans le modèle du §14 :
 * l'annuaire des approbateurs de dérogations, édité depuis la page de réglages
 * du projet (§12, écran 4).
 *
 * L'annuaire est rangé **par projet** (item 23) : la page de réglages est une
 * page de projet, un approbateur n'habilite que les dérogations de son projet.
 * Trois données cohabitent :
 * - `parProjet` : l'annuaire propre à chaque projet ;
 * - `defaut` : l'annuaire hérité par les projets qui n'ont pas encore le leur
 *   (l'annuaire global des installations existantes) ;
 * - `approbateurs` : l'union de tous les annuaires, que lisent les écrans qui
 *   ignorent encore le projet — encart de dérogation, actions Rovo, pont.
 */
import { clientForgeStorage, type ClientStockage } from './forge-storage';

export interface ReglagesApp {
  /** Union des annuaires par projet (et annuaire historique, avant l'item 23). */
  approbateurs: string[];
  /** Annuaire par projet : la clé est la clé du projet Jira. */
  parProjet?: Record<string, string[]>;
  /** Annuaire hérité par les projets sans annuaire propre. */
  defaut?: string[];
}

export interface ReglagesStore {
  lire(): Promise<ReglagesApp>;
  ecrire(reglages: ReglagesApp): Promise<void>;
}

const CLE = 'mac:reglages-app';

/** Annuaire effectif d'un projet : le sien, sinon l'annuaire hérité. */
export function approbateursProjet(reglages: ReglagesApp, projet: string): string[] {
  const duProjet = reglages.parProjet?.[projet];
  if (duProjet !== undefined) return [...duProjet];
  return [...(reglages.defaut ?? reglages.approbateurs)];
}

/**
 * Réglages après ajout d'un approbateur à un projet : l'annuaire du projet
 * reçoit le nom (sans doublon), l'annuaire hérité reste figé, et l'union
 * globale couvre tous les annuaires. Fonction pure : rend un nouvel objet.
 */
export function avecApprobateur(reglages: ReglagesApp, projet: string, nom: string): ReglagesApp {
  const duProjet = approbateursProjet(reglages, projet);
  if (duProjet.includes(nom)) return reglages;
  const defaut = [...(reglages.defaut ?? reglages.approbateurs)];
  const parProjet = { ...(reglages.parProjet ?? {}), [projet]: [...duProjet, nom] };
  const union = [...new Set([...defaut, ...Object.values(parProjet).flat()])];
  return { approbateurs: union, parProjet, defaut };
}

/** Copie défensive des réglages : aucune référence partagée avec l'appelant. */
function copier(reglages: ReglagesApp): ReglagesApp {
  return {
    approbateurs: [...reglages.approbateurs],
    parProjet: { ...(reglages.parProjet ?? {}) },
    ...(reglages.defaut === undefined ? {} : { defaut: [...reglages.defaut] }),
  };
}

/** Réglages en mémoire : tests et démonstrations. */
export function createMemoryReglagesStore(initial: ReglagesApp = { approbateurs: [] }): ReglagesStore {
  let valeur: ReglagesApp = copier(initial);
  return {
    async lire() {
      return copier(valeur);
    },
    async ecrire(reglages) {
      valeur = copier(reglages);
    },
  };
}

/** Annuaire par projet lu du KVS : seules les listes de noms sont retenues. */
function parProjetValide(brut: unknown): Record<string, string[]> {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return {};
  const resultat: Record<string, string[]> = {};
  for (const [projet, liste] of Object.entries(brut as Record<string, unknown>)) {
    if (Array.isArray(liste)) {
      resultat[projet] = liste.filter((x): x is string => typeof x === 'string');
    }
  }
  return resultat;
}

/** Liste de noms lue du KVS : un tableau de chaînes, ou `undefined`. */
function listeValide(brut: unknown): string[] | undefined {
  if (!Array.isArray(brut)) return undefined;
  return brut.filter((x): x is string => typeof x === 'string');
}

/** Réglages dans le KVS Forge. */
export function createForgeReglagesStore(client: ClientStockage = clientForgeStorage()): ReglagesStore {
  return {
    async lire() {
      const brut = await client.get(CLE);
      if (!brut || typeof brut !== 'object') return { approbateurs: [], parProjet: {} };
      const objet = brut as { approbateurs?: unknown; parProjet?: unknown; defaut?: unknown };
      const defaut = listeValide(objet.defaut);
      return {
        approbateurs: listeValide(objet.approbateurs) ?? [],
        parProjet: parProjetValide(objet.parProjet),
        ...(defaut === undefined ? {} : { defaut }),
      };
    },
    async ecrire(reglages) {
      await client.set(CLE, {
        approbateurs: reglages.approbateurs,
        parProjet: reglages.parProjet ?? {},
        ...(reglages.defaut === undefined ? {} : { defaut: reglages.defaut }),
      });
    },
  };
}
