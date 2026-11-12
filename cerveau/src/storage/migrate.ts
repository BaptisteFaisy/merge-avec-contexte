/**
 * Migrations de schéma Forge SQL (§14), idempotentes.
 *
 * La voie normale est la file de `migrationRunner` : chaque instruction y est
 * enqueueée sous un nom stable, `run()` n'exécute que ce qui n'a pas encore été
 * fait (la table `__migrations` fait foi), et le retour est la liste des
 * migrations réellement passées. Rejouer la migration est donc sans effet —
 * c'est ce que fait le déclencheur horaire de l'app.
 *
 * Deux replis, dans cet ordre :
 * 1. `migrationRunner` indisponible (plateforme plus ancienne) : les mêmes
 *    instructions sont exécutées directement par `sql`, une par une. Le DDL
 *    est `CREATE TABLE IF NOT EXISTS`, donc rejouable ;
 * 2. `@forge/sql` absent (hors plateforme, test local) : rien n'est exécuté, le
 *    rapport le dit (`mode: 'unavailable'`) et l'appelant décide.
 *
 * Deux familles d'instructions, dans cet ordre : la **création** des tables du
 * §14, puis l'**alignement** des tables déjà créées (colonnes déclarées après
 * leur création). Le nom d'une migration est stable : c'est lui que la file
 * compare à `__migrations`, et une instruction d'alignement porte donc un nom
 * neuf — sans quoi le DDL ne serait jamais rejoué sur une installation déjà
 * migrée.
 *
 * Aucune de ces fonctions ne lève pour un défaut de plateforme : un schéma non
 * migré est un état à signaler, pas une exception au milieu d'une requête.
 */
import { sql } from '@forge/sql';
import { migrationRunner } from '@forge/sql';
import { ALIGNEMENT_STATEMENTS, SCHEMA_STATEMENTS, tableOfStatement } from './schema';

export type MigrationMode = 'runner' | 'direct' | 'unavailable';

/** Résultat d'une migration : ce qui est passé, et par quel chemin. */
export interface MigrationReport {
  mode: MigrationMode;
  /** Noms des migrations réellement exécutées lors de ce passage. */
  applied: string[];
  /** Noms de toutes les migrations déclarées (créations, puis alignements). */
  declared: string[];
  /** Message du premier échec, s'il y en a eu un. */
  failure?: string;
}

/**
 * Instructions à enfiler, dans l'ordre : le schéma d'abord (une création par
 * table), puis l'alignement des tables déjà créées.
 *
 * L'ordre compte : un alignement qui ajoute une colonne suppose la table
 * existante. Le rang donne le numéro du nom de migration — il ne change pas
 * tant qu'on n'ajoute pas d'instruction au milieu.
 */
export function instructionsMigration(): string[] {
  return [...SCHEMA_STATEMENTS, ...ALIGNEMENT_STATEMENTS];
}

/**
 * Nom stable d'une migration : le rang donne le numéro, la table et la
 * colonne ajoutée donnent le reste.
 *
 * Le nom ne change jamais pour une instruction déjà jouée : c'est lui que
 * `migrationRunner` compare à `__migrations` pour savoir ce qu'il rejoue. Une
 * instruction d'alignement porte donc un nom neuf — c'est le seul moyen de
 * faire jouer un DDL sur une installation déjà migrée.
 */
export function migrationName(statement: string, rang: number): string {
  const numero = String(rang + 1).padStart(3, '0');
  const table = tableOfStatement(statement);
  if (table === undefined) return `v${numero}_schema`;
  const colonne = colonneAjoutee(statement);
  return colonne === undefined ? `v${numero}_${table}` : `v${numero}_${table}_${colonne}`;
}

/** Colonne ajoutée par une instruction d'alignement (`ALTER TABLE … ADD COLUMN`). */
export function colonneAjoutee(statement: string): string | undefined {
  const trouve = /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([a-z_]+)`?/i.exec(statement);
  return trouve?.[1];
}

/** Message lisible d'une erreur inconnue. */
function messageDe(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

/** Enfile les instructions du schéma dans `migrationRunner` puis exécute la file. */
async function migrerParRunner(): Promise<MigrationReport> {
  const instructions = instructionsMigration();
  const noms = instructions.map((statement, rang) => migrationName(statement, rang));
  let file = migrationRunner;
  instructions.forEach((statement, rang) => {
    file = file.enqueue(migrationName(statement, rang), statement);
  });
  const passees = await file.run();
  return { mode: 'runner', applied: passees, declared: noms };
}

/** Repli : exécute les instructions directement, une par une. */
async function migrerDirectement(): Promise<MigrationReport> {
  const instructions = instructionsMigration();
  const noms = instructions.map((statement, rang) => migrationName(statement, rang));
  const applied: string[] = [];
  for (const [rang, statement] of instructions.entries()) {
    const nom = migrationName(statement, rang);
    try {
      await sql.executeDDL(statement);
      applied.push(nom);
    } catch (erreur) {
      return { mode: 'direct', applied, declared: noms, failure: `${nom} : ${messageDe(erreur)}` };
    }
  }
  return { mode: 'direct', applied, declared: noms };
}

/**
 * Applique le schéma. Idempotent : deux appels de suite ne créent rien de plus
 * et rendent le même rapport. Ne lève jamais pour un défaut de plateforme.
 */
export async function runMigrations(): Promise<MigrationReport> {
  if (migrationRunner === undefined || sql === undefined) {
    return { mode: 'unavailable', applied: [], declared: [], failure: '@forge/sql indisponible' };
  }
  try {
    return await migrerParRunner();
  } catch (erreur) {
    // La file a échoué (migration déjà appliquée, DDL refusé, runtime absent) :
    // on tente le repli direct, qui est lui-même idempotent.
    return migrerDirectement();
  }
}
