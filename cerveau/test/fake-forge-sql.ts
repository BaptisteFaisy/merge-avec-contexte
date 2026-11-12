/**
 * Faux moteur Forge SQL — la base en mémoire que `@forge/sql` n'a pas.
 *
 * Il reproduit ce qui compte pour le journal des évaluations :
 * - une installation garde les tables créées et les migrations déjà jouées ;
 * - `migrationRunner` ne rejoue que les opérations dont le nom est absent de
 *   `__migrations` (comme la plateforme) : un `CREATE TABLE IF NOT EXISTS`
 *   dont le nom est déjà joué ne modifie jamais la table ;
 * - une écriture qui cite une colonne absente échoue — c'est le défaut
 *   rencontré en production, où Forge SQL remonte « ForgeSQLError: Unknown
 *   SQL execution error » sans dire quelle colonne manque.
 *
 * Le dialecte supporté est volontairement minimal : `CREATE TABLE IF NOT
 * EXISTS`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, `INSERT … ON DUPLICATE
 * KEY UPDATE` et `SELECT * … WHERE … ORDER BY … LIMIT …`. Toute autre
 * instruction est refusée : mieux vaut un test rouge qu'un faux vert.
 */

/** Valeur acceptable en paramètre lié. */
type Valeur = string | number | null;

/** Une table de la fausse base. */
export interface TableFake {
  colonnes: string[];
  clePrimaire: string[];
  lignes: Map<string, Record<string, unknown>>;
}

/** L'installation simulée : les tables, les migrations jouées, les requêtes vues. */
export interface InstallationFake {
  tables: Map<string, TableFake>;
  migrations: Set<string>;
  requetes: string[];
}

/**
 * Erreur de la fausse base : un SQL en échec, sans détail — comme Forge SQL,
 * qui masque la cause derrière « Unknown SQL execution error ».
 */
export class ErreurSqlFake extends Error {
  /** Cause réelle, visible seulement dans les tests. */
  readonly detail: string;

  constructor(detail: string) {
    super('ForgeSQLError: Unknown SQL execution error');
    this.name = 'ErreurSqlFake';
    this.detail = detail;
  }
}

/** Installation courante : une seule à la fois, les tests se succèdent. */
export const installation: InstallationFake = {
  tables: new Map(),
  migrations: new Set(),
  requetes: [],
};

/** Remet l'installation à zéro : tables, migrations et journal des requêtes. */
export function demarrerInstallation(): InstallationFake {
  installation.tables.clear();
  installation.migrations.clear();
  installation.requetes.length = 0;
  return installation;
}

/** Colonnes d'une table, dans l'ordre de création. */
export function colonnesDe(table: string): string[] {
  return installation.tables.get(table)?.colonnes ?? [];
}

/** Lignes d'une table, dans l'ordre d'insertion. */
export function lignesDe(table: string): Record<string, unknown>[] {
  return [...(installation.tables.get(table)?.lignes.values() ?? [])];
}

// --- DDL ------------------------------------------------------------------

/** Découpe un corps SQL sur les virgules de premier niveau (hors parenthèses). */
function decouper(corps: string): string[] {
  const morceaux: string[] = [];
  let courant = '';
  let profondeur = 0;
  for (const caractere of corps) {
    if (caractere === '(') profondeur += 1;
    if (caractere === ')') profondeur -= 1;
    if (caractere === ',' && profondeur === 0) {
      morceaux.push(courant);
      courant = '';
      continue;
    }
    courant += caractere;
  }
  morceaux.push(courant);
  return morceaux.map((morceau) => morceau.trim().replace(/\s+/g, ' ')).filter((morceau) => morceau.length > 0);
}

/** Nom de colonne d'une définition (`id VARCHAR(64) NOT NULL` → `id`). */
function nomDeColonne(definition: string): string {
  return (definition.split(' ')[0] ?? '').replace(/`/g, '');
}

/** Clé primaire d'un corps `CREATE TABLE` (`PRIMARY KEY (id)` → `[id]`). */
function clePrimaire(corps: string): string[] {
  const trouve = /PRIMARY\s+KEY\s*\(([^)]*)\)/i.exec(corps);
  if (!trouve) return [];
  return trouve[1].split(',').map((colonne) => colonne.trim().replace(/`/g, ''));
}

/** Crée la table si elle n'existe pas — comme `CREATE TABLE IF NOT EXISTS`. */
function creerTable(nom: string, corps: string): void {
  if (installation.tables.has(nom)) return;
  const colonnes = decouper(corps)
    .filter((definition) => !/^(PRIMARY\s+KEY|UNIQUE|KEY|INDEX|CONSTRAINT)\b/i.test(definition))
    .map(nomDeColonne);
  installation.tables.set(nom, { colonnes, clePrimaire: clePrimaire(corps), lignes: new Map() });
}

/** Ajoute une colonne si elle manque — comme `ADD COLUMN IF NOT EXISTS`. */
function ajouterColonne(nom: string, colonne: string): void {
  const table = installation.tables.get(nom);
  if (table === undefined) throw new ErreurSqlFake(`table inconnue : ${nom}`);
  if (!table.colonnes.includes(colonne)) table.colonnes.push(colonne);
}

/** Exécute une instruction DDL : création de table ou ajout de colonne. */
export function executerDdl(instruction: string): void {
  installation.requetes.push(instruction);
  const creation = /^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+`?([a-z_]+)`?\s*\((.*)\)\s*$/is.exec(instruction);
  if (creation) {
    creerTable(creation[1], creation[2]);
    return;
  }
  const alteration = /^ALTER\s+TABLE\s+`?([a-z_]+)`?\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([a-z_]+)`?/i
    .exec(instruction);
  if (alteration) {
    ajouterColonne(alteration[1], alteration[2]);
    return;
  }
  throw new ErreurSqlFake(`instruction DDL non supportée : ${instruction.slice(0, 60)}`);
}

// --- DML ------------------------------------------------------------------

/** Table visée par une instruction. */
function tableDe(requete: string): string {
  const trouve = /(?:INTO|FROM)\s+`?([a-z_]+)`?/i.exec(requete);
  if (!trouve) throw new ErreurSqlFake(`table illisible : ${requete.slice(0, 60)}`);
  return trouve[1];
}

/** Colonnes citées par un `INSERT INTO t (a, b) VALUES (?, ?)`. */
function colonnesInserees(requete: string): string[] {
  const trouve = /INSERT\s+INTO\s+`?[a-z_]+`?\s*\(([^)]*)\)/i.exec(requete);
  if (!trouve) throw new ErreurSqlFake(`INSERT illisible : ${requete.slice(0, 60)}`);
  return trouve[1].split(',').map((colonne) => colonne.trim().replace(/`/g, ''));
}

/** Colonnes mises à jour par un `ON DUPLICATE KEY UPDATE a = ?, b = ?`. */
function colonnesMisesAJour(requete: string): string[] {
  const trouve = /ON\s+DUPLICATE\s+KEY\s+UPDATE\s+(.*)$/is.exec(requete);
  if (!trouve) return [];
  return trouve[1].split(',').map((affectation) => (affectation.split('=')[0] ?? '').trim().replace(/`/g, ''));
}

/** Insère une ligne, ou met à jour celle de même clé primaire. */
function inserer(requete: string, params: Valeur[]): { affectedRows: number } {
  const colonnes = colonnesInserees(requete);
  const schema = installation.tables.get(tableDe(requete));
  if (schema === undefined) throw new ErreurSqlFake(`table inconnue : ${tableDe(requete)}`);
  for (const colonne of colonnes) {
    if (!schema.colonnes.includes(colonne)) {
      throw new ErreurSqlFake(`Unknown column '${colonne}' in 'field list'`);
    }
  }
  const ligne: Record<string, unknown> = {};
  colonnes.forEach((colonne, rang) => { ligne[colonne] = params[rang]; });
  const cle = schema.clePrimaire.map((colonne) => String(ligne[colonne])).join('\u0000');
  const existante = schema.lignes.get(cle);
  if (existante === undefined) {
    schema.lignes.set(cle, ligne);
    return { affectedRows: 1 };
  }
  colonnesMisesAJour(requete).forEach((colonne, rang) => {
    existante[colonne] = params[colonnes.length + rang];
  });
  return { affectedRows: 2 };
}

/** Une condition de filtrage : colonne, opérateur, et les bouts concaténés. */
interface Condition {
  colonne: string;
  operateur: '=' | '>=' | '<=' | 'LIKE';
  prefixe: string;
  suffixe: string;
}

/** Analyse la clause `WHERE` : une liste de conditions. */
function analyserConditions(where: string): Condition[] {
  if (where.trim() === '') return [];
  return where.split(/\s+AND\s+/i).map((morceau) => {
    const brut = morceau.trim();
    if (/^1\s*=\s*1$/.test(brut)) return { colonne: '', operateur: '=' as const, prefixe: '', suffixe: '' };
    const concatene = /^CONCAT\('([^']*)',\s*([a-z_]+),\s*'([^']*)'\)\s+LIKE\s*\?$/i.exec(brut);
    if (concatene) {
      return { colonne: concatene[2], operateur: 'LIKE' as const, prefixe: concatene[1], suffixe: concatene[3] };
    }
    const simple = /^([a-z_]+)\s*(=|>=|<=)\s*\?$/i.exec(brut);
    if (!simple) throw new ErreurSqlFake(`condition non supportée : ${brut}`);
    return { colonne: simple[1], operateur: simple[2] as '=' | '>=' | '<=', prefixe: '', suffixe: '' };
  });
}

/** Compare une valeur à un motif `LIKE` (`%` = n'importe quelle suite). */
function like(valeur: string, motif: string): boolean {
  const echappement = motif.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*');
  return new RegExp(`^${echappement}$`).test(valeur);
}

/** Compare deux valeurs : numériquement si possible, lexicographiquement sinon. */
function compare(reel: unknown, attendu: unknown): number {
  if (typeof reel === 'number' && typeof attendu === 'number') return reel - attendu;
  return String(reel).localeCompare(String(attendu));
}

/** Une ligne satisfait-elle les conditions ? Les paramètres sont consommés dans l'ordre. */
function ligneSatisfait(ligne: Record<string, unknown>, conditions: Condition[], params: Valeur[]): boolean {
  let rang = 0;
  for (const condition of conditions) {
    if (condition.colonne === '') continue;
    const attendu = params[rang];
    rang += 1;
    const brut = ligne[condition.colonne] ?? null;
    const concatene = condition.prefixe !== '' || condition.suffixe !== '';
    const reel = concatene ? `${condition.prefixe}${brut ?? ''}${condition.suffixe}` : brut;
    if (condition.operateur === '=' && reel !== attendu) return false;
    if (condition.operateur === '>=' && compare(reel, attendu) < 0) return false;
    if (condition.operateur === '<=' && compare(reel, attendu) > 0) return false;
    if (condition.operateur === 'LIKE' && !like(String(reel), String(attendu))) return false;
  }
  return true;
}

/** Découpe un `SELECT` : table, filtre, tri, limite et décalage. */
interface Selection {
  table: string;
  where: string;
  colonneTri: string;
  sens: 'ASC' | 'DESC';
  limite?: number;
  decalage: number;
}

/** Analyse un `SELECT * FROM t WHERE … ORDER BY … LIMIT … OFFSET …`. */
function analyserSelection(requete: string): Selection {
  const where = /WHERE\s+(.*?)(?=\s+ORDER\s+BY|\s+LIMIT|$)/is.exec(requete)?.[1] ?? '';
  const tri = /ORDER\s+BY\s+([a-z_]+)(?:\s+(ASC|DESC))?/i.exec(requete);
  const limite = /LIMIT\s+(\d+)/i.exec(requete)?.[1];
  const decalage = /OFFSET\s+(\d+)/i.exec(requete)?.[1];
  return {
    table: tableDe(requete),
    where,
    colonneTri: tri?.[1] ?? '',
    sens: (tri?.[2] ?? 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC',
    limite: limite === undefined ? undefined : Number(limite),
    decalage: decalage === undefined ? 0 : Number(decalage),
  };
}

/** Trie les lignes selon une colonne, dans l'ordre demandé. */
function trier(lignes: Record<string, unknown>[], colonne: string, sens: 'ASC' | 'DESC'): Record<string, unknown>[] {
  const facteur = sens === 'DESC' ? -1 : 1;
  return [...lignes].sort((a, b) => facteur * String(a[colonne] ?? '').localeCompare(String(b[colonne] ?? '')));
}

/** Sélectionne les lignes qui satisfont le filtre, puis trie et pagine. */
function selectionner(requete: string, params: Valeur[]): Record<string, unknown>[] {
  const analyse = analyserSelection(requete);
  const schema = installation.tables.get(analyse.table);
  if (schema === undefined) throw new ErreurSqlFake(`table inconnue : ${analyse.table}`);
  const conditions = analyserConditions(analyse.where);
  const retenues = [...schema.lignes.values()].filter((ligne) => ligneSatisfait(ligne, conditions, params));
  const triees = analyse.colonneTri === '' ? retenues : trier(retenues, analyse.colonneTri, analyse.sens);
  const debut = analyse.decalage;
  const fin = analyse.limite === undefined ? undefined : debut + analyse.limite;
  return triees.slice(debut, fin);
}

/** Exécute une instruction DML et rend le résultat au format de l'API Forge. */
function executer(requete: string, params: Valeur[]): { rows: unknown } {
  installation.requetes.push(requete);
  if (/^INSERT\s+INTO/i.test(requete)) return { rows: inserer(requete, params) };
  if (/^SELECT\s/i.test(requete)) return { rows: selectionner(requete, params) };
  throw new ErreurSqlFake(`instruction DML non supportée : ${requete.slice(0, 60)}`);
}

// --- Module `@forge/sql` ----------------------------------------------------

/** Le client SQL de la fausse base. */
interface ClientSqlFake {
  prepare(requete: string): {
    bindParams(...params: Valeur[]): { execute(): Promise<{ rows: unknown }> };
    execute(): Promise<{ rows: unknown }>;
  };
  executeDDL(instruction: string): Promise<{ rows: unknown[] }>;
}

/** La file de migrations de la fausse base. */
interface FileMigrationFake {
  migrations: { nom: string; instruction: string }[];
  enqueue(nom: string, instruction: string): FileMigrationFake;
  run(): Promise<string[]>;
}

const clientSql: ClientSqlFake = {
  prepare(requete: string) {
    return {
      bindParams(...params: Valeur[]) {
        return { execute: async () => executer(requete, params) };
      },
      execute: async () => executer(requete, []),
    };
  },
  async executeDDL(instruction: string) {
    executerDdl(instruction);
    return { rows: [] };
  },
};

const fileMigration: FileMigrationFake = {
  migrations: [],
  enqueue(nom: string, instruction: string) {
    if (!this.migrations.some((migration) => migration.nom === nom)) {
      this.migrations.push({ nom, instruction });
    }
    return this;
  },
  async run() {
    const aJouer = this.migrations.filter((migration) => !installation.migrations.has(migration.nom));
    const passees: string[] = [];
    for (const migration of aJouer) {
      executerDdl(migration.instruction);
      installation.migrations.add(migration.nom);
      passees.push(migration.nom);
    }
    return passees;
  },
};

/** Le faux module `@forge/sql` : un client et une file de migrations. */
export function moduleForgeSql(): { sql: ClientSqlFake; migrationRunner: FileMigrationFake } {
  return { sql: clientSql, migrationRunner: fileMigration };
}
