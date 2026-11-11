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
 * Aucune de ces fonctions ne lève pour un défaut de plateforme : un schéma non
 * migré est un état à signaler, pas une exception au milieu d'une requête.
 */
import { sql } from '@forge/sql';
import { migrationRunner } from '@forge/sql';
import { SCHEMA_STATEMENTS, tableOfStatement } from './schema';

export type MigrationMode = 'runner' | 'direct' | 'unavailable';

/** Résultat d'une migration : ce qui est passé, et par quel chemin. */
export interface MigrationReport {
  mode: MigrationMode;
  /** Noms des migrations traitées (une par table du schéma, ou rien). */
  applied: string[];
  /** Message du premier échec, s'il y en a eu un. */
  failure?: string;
}

/** Nom stable d'une migration, dérivé de la table visée. */
export function migrationName(statement: string, rang: number): string {
  const table = tableOfStatement(statement);
  const numero = String(rang + 1).padStart(3, '0');
  return table === undefined ? `v${numero}_schema` : `v${numero}_${table}`;
}

/** Message lisible d'une erreur inconnue. */
function messageDe(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

/** Enfile les instructions du schéma dans `migrationRunner` puis exécute la file. */
async function migrerParRunner(): Promise<MigrationReport> {
  const noms = SCHEMA_STATEMENTS.map((statement, rang) => migrationName(statement, rang));
  let file = migrationRunner;
  SCHEMA_STATEMENTS.forEach((statement, rang) => {
    file = file.enqueue(migrationName(statement, rang), statement);
  });
  const passees = await file.run();
  return { mode: 'runner', applied: passees.length > 0 ? passees : noms };
}

/** Repli : exécute les instructions directement, une par une. */
async function migrerDirectement(): Promise<MigrationReport> {
  const applied: string[] = [];
  for (const [rang, statement] of SCHEMA_STATEMENTS.entries()) {
    const nom = migrationName(statement, rang);
    try {
      await sql.executeDDL(statement);
      applied.push(nom);
    } catch (erreur) {
      return { mode: 'direct', applied, failure: `${nom} : ${messageDe(erreur)}` };
    }
  }
  return { mode: 'direct', applied };
}

/**
 * Applique le schéma. Idempotent : deux appels de suite ne créent rien de plus
 * et rendent le même rapport. Ne lève jamais pour un défaut de plateforme.
 */
export async function runMigrations(): Promise<MigrationReport> {
  if (migrationRunner === undefined || sql === undefined) {
    return { mode: 'unavailable', applied: [], failure: '@forge/sql indisponible' };
  }
  try {
    return await migrerParRunner();
  } catch (erreur) {
    // La file a échoué (migration déjà appliquée, DDL refusé, runtime absent) :
    // on tente le repli direct, qui est lui-même idempotent.
    return migrerDirectement();
  }
}
