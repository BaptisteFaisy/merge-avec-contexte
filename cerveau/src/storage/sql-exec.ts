/**
 * Briques basses de l'accès SQL : exécuter, lire, écrire, sérialiser.
 *
 * Elles sont partagées par tous les adaptateurs `sql-*.ts` : une seule
 * implémentation de la traduction d'une ligne en objet, une seule façon de
 * lier des paramètres, une seule façon de borner une période.
 *
 * Aucune décision métier ici : ce module traduit des appels en requêtes.
 */
import { sql } from '@forge/sql';
import type { UpdateQueryResponse } from '@forge/sql';

/** Valeur acceptable en paramètre lié. */
export type SqlValue = string | number | null;

/** Exécute une lecture et rend les lignes. */
export async function lignes<T>(requete: string, params: SqlValue[] = []): Promise<T[]> {
  const resultat = await sql.prepare<T>(requete).bindParams(...params).execute();
  return (resultat.rows as unknown as T[]) ?? [];
}

/** Exécute une écriture et rend le nombre de lignes touchées. */
export async function ecrire(requete: string, params: SqlValue[] = []): Promise<number> {
  const resultat = await sql.prepare<UpdateQueryResponse>(requete).bindParams(...params).execute();
  return resultat.rows?.affectedRows ?? 0;
}

/** Lit des lignes et les traduit en objets du domaine. */
export async function lire<Row, T>(
  requete: string,
  params: SqlValue[],
  mapper: (ligne: Row) => T,
): Promise<T[]> {
  return (await lignes<Row>(requete, params)).map(mapper);
}

/** Lit une ligne au plus. */
export async function lireUne<Row, T>(
  requete: string,
  params: SqlValue[],
  mapper: (ligne: Row) => T,
): Promise<T | undefined> {
  return (await lire(requete, params, mapper))[0];
}

/** Sérialise une structure en JSON (jamais `undefined`). */
export function json(valeur: unknown): string {
  return JSON.stringify(valeur ?? null);
}

/** Relit une colonne JSON, avec une valeur de repli. */
export function lireJson<T>(brut: string | null | undefined, defaut: T): T {
  if (brut === null || brut === undefined || brut === '') return defaut;
  try {
    const valeur = JSON.parse(brut) as T | null;
    return valeur === null ? defaut : valeur;
  } catch {
    return defaut;
  }
}

/** Liste de chaînes → colonne `VARCHAR` séparée par des virgules. */
export const enListe = (valeurs: string[]): string => valeurs.join(',');

/** Colonne `VARCHAR` séparée par des virgules → liste. */
export const depuisListe = (brut: string | null | undefined): string[] =>
  brut ? brut.split(',').filter((valeur) => valeur.length > 0) : [];

/**
 * Filtre de période sur une colonne de date (chaîne ISO 8601).
 *
 * La borne haute est facultative : sans elle, la période est ouverte.
 */
export function periodeSur(
  colonne: string,
  since: string,
  until?: string,
): { clause: string; params: SqlValue[] } {
  if (until === undefined) return { clause: `${colonne} >= ?`, params: [since] };
  return { clause: `${colonne} >= ? AND ${colonne} <= ?`, params: [since, until] };
}

/**
 * Fabrique l'écriture idempotente d'une table : `INSERT … ON DUPLICATE KEY
 * UPDATE` sur les colonnes qui ne font pas partie de la clé. Les paramètres
 * sont donnés dans l'ordre des colonnes ; la clé n'est jamais réécrite.
 */
export function upsert(
  table: string,
  colonnes: string[],
  cles: string[],
): (params: SqlValue[]) => Promise<void> {
  const trous = colonnes.map(() => '?').join(', ');
  const maj = colonnes.map((colonne, rang) => ({ colonne, rang })).filter(({ colonne }) => !cles.includes(colonne));
  const requete = `INSERT INTO ${table} (${colonnes.join(', ')}) VALUES (${trous})
    ON DUPLICATE KEY UPDATE ${maj.map(({ colonne }) => `${colonne} = ?`).join(', ')}`;
  return async (params) => {
    await ecrire(requete, [...params, ...maj.map(({ rang }) => params[rang] as SqlValue)]);
  };
}
