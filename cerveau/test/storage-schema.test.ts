/**
 * Schéma Forge SQL (§14) : les huit tables du cahier des charges et les deux
 * tables de sécurité du pont, colonnes attendues, DDL idempotente.
 *
 * Il n'y a pas de base dans les tests : le DDL est lu par un analyseur
 * minimal qui tient un catalogue (table → colonnes, index). Exécuter deux fois
 * la même instruction `CREATE TABLE IF NOT EXISTS` doit laisser ce catalogue
 * inchangé — c'est exactement ce que fera `migrationRunner` au second passage.
 */
import { describe, expect, it, vi } from 'vitest';
import { migrationName, runMigrations } from '../src/storage/migrate';
import { SCHEMA_STATEMENTS, TABLE_NAMES, tableOfStatement } from '../src/storage/schema';

interface Table { colonnes: string[]; index: string[] }

/** Catalogue simulé : ce que la base contiendrait après exécution. */
type Catalogue = Map<string, Table>;

const EST_UNE_CONTRAINTE = /^(PRIMARY\s+KEY|UNIQUE\s+KEY|UNIQUE|KEY|INDEX|CONSTRAINT)\b/i;

/** Découpe le corps d'un `CREATE TABLE` sur les virgules de premier niveau. */
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

/** Nom de colonne d'une définition (`user_id INT NOT NULL` → `user_id`). */
function nomDeColonne(definition: string): string {
  return (definition.split(' ')[0] ?? '').replace(/`/g, '');
}

/** Nom d'index et colonnes couvertes (`KEY idx (a, b)` → `idx`, [`a`, `b`]). */
function indexDe(definition: string): { nom: string; colonnes: string[] } {
  const dedans = /\(([^)]*)\)/.exec(definition);
  const colonnes = dedans ? dedans[1].split(',').map((colonne) => colonne.trim().replace(/`/g, '')) : [];
  const entete = definition.replace(/\([^)]*\)/, '').trim().split(/\s+/);
  const nom = /^PRIMARY\s+KEY/i.test(definition) ? 'PRIMARY' : (entete[1] ?? entete[0] ?? '');
  return { nom, colonnes };
}

/** Exécute une instruction DDL dans le catalogue (idempotent : `IF NOT EXISTS`). */
function executer(statement: string, catalogue: Catalogue): void {
  const table = tableOfStatement(statement);
  if (table === undefined) throw new Error(`instruction hors schéma : ${statement.slice(0, 40)}`);
  const corps = statement.slice(statement.indexOf('(') + 1, statement.lastIndexOf(')'));
  const definitions = decouper(corps);
  const colonnes = definitions.filter((d) => !EST_UNE_CONTRAINTE.test(d)).map(nomDeColonne);
  const index = definitions.filter((d) => EST_UNE_CONTRAINTE.test(d)).map((d) => indexDe(d));
  if (catalogue.has(table)) return;
  catalogue.set(table, { colonnes, index: index.map((i) => `${i.nom}(${i.colonnes.join(',')})`) });
}

/** Catalogue obtenu en exécutant le schéma entier. */
function construire(): Catalogue {
  const catalogue: Catalogue = new Map();
  for (const statement of SCHEMA_STATEMENTS) executer(statement, catalogue);
  return catalogue;
}

/** Colonnes du §14 attendues, table par table. */
const COLONNES_DU_CAHIER: Record<string, string[]> = {
  pairing: ['id', 'workspace_uuid', 'secret_ref', 'paired_at', 'paired_by'],
  rule_config: ['project_id', 'rule_code', 'level', 'mode', 'scope_json', 'params_json'],
  freeze: ['id', 'name', 'starts_at', 'ends_at', 'branches', 'services', 'recurrence', 'created_by'],
  repo_service: ['workspace_uuid', 'repo_uuid', 'service', 'jira_component'],
  evaluation: ['id', 'workspace_uuid', 'repo_uuid', 'pr_id', 'issue_keys', 'trigger', 'verdict', 'reasons_json',
    'evaluated_at', 'duration_ms'],
  waiver: ['id', 'pr_id', 'repo_uuid', 'rule_code', 'requested_by', 'granted_by', 'reason', 'expires_at', 'status'],
  issue_cache: ['issue_id', 'status', 'criteria_json', 'blockers_json', 'fix_version', 'updated_at'],
  service_incident: ['service', 'incident_key', 'opened_at', 'resolved_at'],
};

/** Colonnes des deux tables hors §14 : anti-rejeu persistant et journal d'audit. */
const COLONNES_DE_SECURITE: Record<string, string[]> = {
  bridge_nonce: ['nonce', 'expires_at', 'created_at'],
  waiver_audit: ['id', 'waiver_id', 'pr_id', 'repo_uuid', 'rule_code', 'requested_by', 'decided_by',
    'decision', 'reason', 'identity_status', 'created_at'],
};

describe('schéma §14', () => {
  it('déclare les huit tables du cahier des charges et les deux tables de sécurité', () => {
    const catalogue = construire();
    expect([...catalogue.keys()].sort()).toEqual([...TABLE_NAMES].sort());
    expect(catalogue.size).toBe(10);
    expect([...catalogue.keys()]).toEqual(expect.arrayContaining(Object.keys(COLONNES_DU_CAHIER)));
  });

  it('n’envoie qu’une instruction par table (la file n’en accepte qu’une)', () => {
    expect(SCHEMA_STATEMENTS).toHaveLength(TABLE_NAMES.length);
    for (const statement of SCHEMA_STATEMENTS) {
      expect(statement).not.toContain(';');
      expect(statement.trim().startsWith('CREATE TABLE IF NOT EXISTS')).toBe(true);
    }
  });

  it('porte les colonnes du §14, table par table', () => {
    const catalogue = construire();
    for (const [table, attendues] of Object.entries(COLONNES_DU_CAHIER)) {
      const trouvee = catalogue.get(table);
      expect(trouvee, `table ${table}`).toBeDefined();
      for (const colonne of attendues) {
        expect(trouvee?.colonnes, `${table}.${colonne}`).toContain(colonne);
      }
    }
  });

  it('loge les nonces et le journal d’audit dans leurs propres tables', () => {
    const catalogue = construire();
    for (const [table, attendues] of Object.entries(COLONNES_DE_SECURITE)) {
      const trouvee = catalogue.get(table);
      expect(trouvee, `table ${table}`).toBeDefined();
      for (const colonne of attendues) {
        expect(trouvee?.colonnes, `${table}.${colonne}`).toContain(colonne);
      }
    }
    expect(catalogue.get('bridge_nonce')?.index).toContain('idx_bridge_nonce_expires_at(expires_at)');
    expect(catalogue.get('waiver_audit')?.index).toContain('idx_waiver_audit_waiver(waiver_id)');
  });

  it('est idempotente : deux exécutions laissent le catalogue identique', () => {
    const catalogue = construire();
    const avant = JSON.stringify([...catalogue.entries()]);
    expect(() => construire().forEach((table, nom) => catalogue.set(nom, table))).not.toThrow();
    expect(JSON.stringify([...catalogue.entries()])).toBe(avant);
    for (const statement of SCHEMA_STATEMENTS) {
      expect(() => executer(statement, catalogue)).not.toThrow();
    }
    expect(JSON.stringify([...catalogue.entries()])).toBe(avant);
  });

  it('donne une clé primaire explicite à chaque table, sans AUTO_INCREMENT', () => {
    const catalogue = construire();
    for (const [table, contenu] of catalogue) {
      expect(contenu.index.some((index) => index.startsWith('PRIMARY')), `clé de ${table}`).toBe(true);
    }
    for (const statement of SCHEMA_STATEMENTS) expect(statement).not.toMatch(/AUTO_INCREMENT/i);
  });

  it('indexe les colonnes interrogées', () => {
    const catalogue = construire();
    expect(catalogue.get('evaluation')?.index).toContain('idx_evaluation_issue_keys(issue_keys,evaluated_at)');
    expect(catalogue.get('waiver')?.index).toContain('idx_waiver_pr_id(pr_id)');
    expect(catalogue.get('service_incident')?.index).toContain('idx_service_incident_open(service,resolved_at)');
  });

  it('nomme chaque migration d’après sa table', () => {
    expect(SCHEMA_STATEMENTS.map((statement, rang) => migrationName(statement, rang))).toEqual([
      'v001_pairing', 'v002_rule_config', 'v003_freeze', 'v004_repo_service',
      'v005_evaluation', 'v006_waiver', 'v007_issue_cache', 'v008_service_incident',
      'v009_bridge_nonce', 'v010_waiver_audit',
    ]);
  });

  it('reconnaît la table d’une instruction, et rien d’autre', () => {
    expect(tableOfStatement(SCHEMA_STATEMENTS[0] ?? '')).toBe('pairing');
    expect(tableOfStatement('CREATE TABLE IF NOT EXISTS autre (id INT)')).toBeUndefined();
    expect(tableOfStatement('SELECT 1')).toBeUndefined();
  });
});

describe('migrations hors plateforme', () => {
  it('ne lève jamais, et dit ce qu’il a pu faire', async () => {
    const rapport = await runMigrations();
    expect(['runner', 'direct', 'unavailable']).toContain(rapport.mode);
    expect(Array.isArray(rapport.applied)).toBe(true);
  });

  it('signale l’absence de @forge/sql quand le module manque', async () => {
    vi.resetModules();
    vi.doMock('@forge/sql', () => ({ sql: undefined, migrationRunner: undefined }));
    const { runMigrations: sansForge } = await import('../src/storage/migrate');
    const rapport = await sansForge();
    expect(rapport.mode).toBe('unavailable');
    expect(rapport.applied).toEqual([]);
    expect(rapport.failure).toBeDefined();
    vi.doUnmock('@forge/sql');
    vi.resetModules();
  });
});
