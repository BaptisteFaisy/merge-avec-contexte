/**
 * Schéma Forge SQL du Cerveau (§14) : huit tables du cahier des charges, deux
 * tables de sécurité du pont, DDL MySQL idempotente.
 *
 * Chaque entrée de `SCHEMA_STATEMENTS` est **une seule** instruction : la file
 * de `migrationRunner` n'exécute qu'une instruction par `enqueue`, et la
 * « query policy » de Forge SQL refuse un lot de plusieurs instructions.
 *
 * Trois choix imposés par la plateforme :
 * - pas de `AUTO_INCREMENT` (recommandation Forge SQL) : les clés primaires
 *   sont des `VARCHAR(64)` fournies par l'appelant, donc rejouables telles
 *   quelles sans dépendre d'une séquence locale ;
 * - les dates sont des chaînes ISO 8601 en `VARCHAR(40)` : Forge SQL ne
 *   traduit pas les types et rend les dates sous forme de chaînes ;
 * - pas de clé étrangère (non supportée) : l'intégrité est celle du code.
 *
 * Les deux tables qui ne viennent pas du §14 portent la sécurité du pont :
 * `bridge_nonce` loge l'anti-rejeu hors de la mémoire du conteneur (un
 * redémarrage ou un second conteneur n'annule plus la protection), et
 * `waiver_audit` journalise les décisions de dérogation sans limite de durée
 * (§16). Les nonces expirés sont purgés ; les lignes d'audit ne le sont
 * jamais.
 *
 * Les colonnes marquées d'un commentaire `-- §14` sont celles du cahier des
 * charges ; les autres sont les compléments que le domaine réclame (fuseau
 * d'un gel récurrent, `issue_keys` d'une dérogation, `fallback` d'une
 * évaluation, `correlation_id` qui relie une ligne du journal aux lignes de
 * `forge logs` du même contrôle).
 */

/** Une instruction DDL par table, dans l'ordre des dépendances de lecture. */
export const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS pairing (
    id VARCHAR(64) NOT NULL,
    workspace_uuid VARCHAR(64) NULL,
    secret_ref VARCHAR(255) NULL,
    paired_at VARCHAR(40) NULL,
    paired_by VARCHAR(255) NULL,
    fallback_policy VARCHAR(16) NULL,
    offer_code VARCHAR(32) NULL,
    offer_site_url VARCHAR(255) NULL,
    offer_created_by VARCHAR(255) NULL,
    offer_issued_at VARCHAR(40) NULL,
    offer_expires_at VARCHAR(40) NULL,
    offer_used TINYINT NOT NULL DEFAULT 0,
    updated_at VARCHAR(40) NOT NULL,
    PRIMARY KEY (id),
    KEY idx_pairing_paired_at (paired_at)
  )`,

  `CREATE TABLE IF NOT EXISTS rule_config (
    project_id VARCHAR(64) NOT NULL,
    rule_code VARCHAR(8) NOT NULL,
    level VARCHAR(16) NOT NULL,
    mode VARCHAR(16) NOT NULL,
    scope_json TEXT NULL,
    params_json TEXT NULL,
    updated_at VARCHAR(40) NOT NULL,
    PRIMARY KEY (project_id, rule_code)
  )`,

  `CREATE TABLE IF NOT EXISTS freeze (
    id VARCHAR(64) NOT NULL,
    name VARCHAR(200) NOT NULL,
    starts_at VARCHAR(40) NOT NULL,
    ends_at VARCHAR(40) NOT NULL,
    branches TEXT NULL,
    services TEXT NULL,
    recurrence TEXT NULL,
    timezone VARCHAR(64) NULL,
    created_by VARCHAR(255) NULL,
    PRIMARY KEY (id),
    KEY idx_freeze_ends_at (ends_at)
  )`,

  `CREATE TABLE IF NOT EXISTS repo_service (
    workspace_uuid VARCHAR(64) NOT NULL,
    repo_uuid VARCHAR(64) NOT NULL,
    service VARCHAR(128) NOT NULL,
    jira_component VARCHAR(128) NULL,
    updated_at VARCHAR(40) NOT NULL,
    PRIMARY KEY (workspace_uuid, repo_uuid),
    KEY idx_repo_service_service (service)
  )`,

  `CREATE TABLE IF NOT EXISTS evaluation (
    id VARCHAR(64) NOT NULL,
    workspace_uuid VARCHAR(64) NOT NULL,
    repo_uuid VARCHAR(64) NOT NULL,
    pr_id INT NOT NULL,
    issue_keys VARCHAR(255) NOT NULL,
    \`trigger\` VARCHAR(48) NOT NULL,
    verdict VARCHAR(16) NOT NULL,
    reasons_json MEDIUMTEXT NULL,
    evaluated_at VARCHAR(40) NOT NULL,
    duration_ms INT NOT NULL,
    fallback VARCHAR(16) NULL,
    cause VARCHAR(16) NULL,
    observed_only TINYINT NOT NULL DEFAULT 0,
    service VARCHAR(128) NULL,
    project_id VARCHAR(64) NULL,
    correlation_id VARCHAR(64) NULL,
    PRIMARY KEY (id),
    KEY idx_evaluation_issue_keys (issue_keys, evaluated_at),
    KEY idx_evaluation_pr (repo_uuid, pr_id, evaluated_at)
  )`,

  `CREATE TABLE IF NOT EXISTS waiver (
    id VARCHAR(64) NOT NULL,
    pr_id INT NOT NULL,
    repo_uuid VARCHAR(64) NOT NULL,
    rule_code VARCHAR(8) NOT NULL,
    requested_by VARCHAR(255) NOT NULL,
    granted_by VARCHAR(255) NULL,
    reason TEXT NOT NULL,
    requested_at VARCHAR(40) NOT NULL,
    expires_at VARCHAR(40) NULL,
    status VARCHAR(16) NOT NULL,
    issue_keys VARCHAR(255) NULL,
    PRIMARY KEY (id),
    KEY idx_waiver_pr_id (pr_id),
    KEY idx_waiver_status (status)
  )`,

  `CREATE TABLE IF NOT EXISTS issue_cache (
    issue_key VARCHAR(64) NOT NULL,
    issue_id VARCHAR(64) NOT NULL,
    status VARCHAR(64) NOT NULL,
    criteria_json TEXT NULL,
    blockers_json TEXT NULL,
    fix_version VARCHAR(128) NULL,
    updated_at VARCHAR(40) NOT NULL,
    snapshot_json MEDIUMTEXT NULL,
    PRIMARY KEY (issue_key),
    KEY idx_issue_cache_updated_at (updated_at)
  )`,

  `CREATE TABLE IF NOT EXISTS service_incident (
    service VARCHAR(128) NOT NULL,
    incident_key VARCHAR(64) NOT NULL,
    opened_at VARCHAR(40) NOT NULL,
    resolved_at VARCHAR(40) NULL,
    PRIMARY KEY (service, incident_key),
    KEY idx_service_incident_open (service, resolved_at)
  )`,

  `CREATE TABLE IF NOT EXISTS bridge_nonce (
    nonce VARCHAR(128) NOT NULL,
    expires_at VARCHAR(40) NOT NULL,
    created_at VARCHAR(40) NOT NULL,
    PRIMARY KEY (nonce),
    KEY idx_bridge_nonce_expires_at (expires_at)
  )`,

  `CREATE TABLE IF NOT EXISTS waiver_audit (
    id VARCHAR(64) NOT NULL,
    waiver_id VARCHAR(64) NOT NULL,
    pr_id INT NOT NULL,
    repo_uuid VARCHAR(64) NOT NULL,
    rule_code VARCHAR(8) NOT NULL,
    workspace_uuid VARCHAR(64) NULL,
    requested_by VARCHAR(255) NOT NULL,
    decided_by VARCHAR(255) NULL,
    decision VARCHAR(16) NOT NULL,
    reason TEXT NOT NULL,
    identity_status VARCHAR(16) NOT NULL,
    created_at VARCHAR(40) NOT NULL,
    PRIMARY KEY (id),
    KEY idx_waiver_audit_waiver (waiver_id),
    KEY idx_waiver_audit_pr (repo_uuid, pr_id),
    KEY idx_waiver_audit_created_at (created_at)
  )`,
];

/** Les huit tables du §14, puis les deux tables de sécurité du pont. */
export const TABLE_NAMES = [
  'pairing',
  'rule_config',
  'freeze',
  'repo_service',
  'evaluation',
  'waiver',
  'issue_cache',
  'service_incident',
  'bridge_nonce',
  'waiver_audit',
] as const;

export type TableName = (typeof TABLE_NAMES)[number];

/** Nom de la table visée par une instruction DDL de ce schéma. */
export function tableOfStatement(statement: string): TableName | undefined {
  const trouve = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+`?([a-z_]+)`?/i.exec(statement);
  if (!trouve) return undefined;
  const nom = trouve[1] as TableName;
  return TABLE_NAMES.includes(nom) ? nom : undefined;
}
