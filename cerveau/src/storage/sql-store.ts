/**
 * Implémentation Forge SQL des ports de stockage (adaptateur fin).
 *
 * Aucune décision ici : chaque méthode traduit un appel en une requête et rend
 * la ligne telle quelle. Le schéma visé est celui de `schema.ts` (§14) ; les
 * dates sont des chaînes ISO 8601 (Forge SQL ne traduit pas les types) et les
 * structures sont rangées en JSON ou en liste séparée par des virgules.
 *
 * L'API employée est celle de `@forge/sql` : `sql.prepare<T>(requête)` rend un
 * énoncé, `bindParams(...)` fixe les paramètres, `execute()` envoie la requête
 * et rend `{ rows }`. Une écriture rend `affectedRows` dans `rows`.
 */
import { sql } from '@forge/sql';
import type { UpdateQueryResponse } from '@forge/sql';
import type { FallbackPolicy, Freeze, Incident, RuleCode, RuleConfig, Waiver } from '../shared/types';
import type { PairingOffer } from '../shared/bridge/pairing';
import type {
  EvaluationRepository, EvaluationStats, FreezeRepository, IncidentRepository, IssueCacheEntry,
  IssueCacheRepository, NonceStore, ObservedBlock, PairingRecord, PairingRepository, RepoServiceMapping,
  RepoServiceRepository, RuleConfigRepository, Store, StoredEvaluation, StoredWaiver, WaiverRepository,
} from './ports';

/** Valeur acceptable en paramètre lié. */
type SqlValue = string | number | null;

/** Exécute une lecture et rend les lignes. */
async function lignes<T>(requete: string, params: SqlValue[] = []): Promise<T[]> {
  const resultat = await sql.prepare<T>(requete).bindParams(...params).execute();
  return (resultat.rows as unknown as T[]) ?? [];
}

/** Exécute une écriture et rend le nombre de lignes touchées. */
async function ecrire(requete: string, params: SqlValue[] = []): Promise<number> {
  const resultat = await sql.prepare<UpdateQueryResponse>(requete).bindParams(...params).execute();
  return resultat.rows?.affectedRows ?? 0;
}

/** Lit des lignes et les traduit en objets du domaine. */
async function lire<Row, T>(requete: string, params: SqlValue[], mapper: (ligne: Row) => T): Promise<T[]> {
  return (await lignes<Row>(requete, params)).map(mapper);
}

/** Lit une ligne au plus. */
async function lireUne<Row, T>(requete: string, params: SqlValue[], mapper: (ligne: Row) => T): Promise<T | undefined> {
  return (await lire(requete, params, mapper))[0];
}

/** Sérialise une structure en JSON (jamais `undefined`). */
function json(valeur: unknown): string {
  return JSON.stringify(valeur ?? null);
}

/** Relit une colonne JSON, avec une valeur de repli. */
function lireJson<T>(brut: string | null | undefined, defaut: T): T {
  if (brut === null || brut === undefined || brut === '') return defaut;
  try {
    const valeur = JSON.parse(brut) as T | null;
    return valeur === null ? defaut : valeur;
  } catch {
    return defaut;
  }
}

/** Liste de chaînes → colonne `VARCHAR` séparée par des virgules. */
const enListe = (valeurs: string[]): string => valeurs.join(',');

/** Colonne `VARCHAR` séparée par des virgules → liste. */
const depuisListe = (brut: string | null | undefined): string[] =>
  brut ? brut.split(',').filter((valeur) => valeur.length > 0) : [];

/** Condition de recherche d'une clé exacte dans `issue_keys` (liste séparée par des virgules). */
const CONDITION_CLE = "CONCAT(',', issue_keys, ',') LIKE ?";

/** Paramètre qui reconnaît une clé exacte dans une colonne `issue_keys`. */
const parametreCle = (cle: string): string => `%,${cle},%`;

/**
 * Fabrique l'écriture idempotente d'une table : `INSERT … ON DUPLICATE KEY
 * UPDATE` sur les colonnes qui ne font pas partie de la clé. Les paramètres
 * sont donnés dans l'ordre des colonnes ; la clé n'est jamais réécrite.
 */
function upsert(table: string, colonnes: string[], cles: string[]): (params: SqlValue[]) => Promise<void> {
  const trous = colonnes.map(() => '?').join(', ');
  const maj = colonnes.map((colonne, rang) => ({ colonne, rang })).filter(({ colonne }) => !cles.includes(colonne));
  const requete = `INSERT INTO ${table} (${colonnes.join(', ')}) VALUES (${trous})
    ON DUPLICATE KEY UPDATE ${maj.map(({ colonne }) => `${colonne} = ?`).join(', ')}`;
  return async (params) => {
    await ecrire(requete, [...params, ...maj.map(({ rang }) => params[rang] as SqlValue)]);
  };
}

// --- Lignes de table, telles que rendues par Forge SQL --------------------

interface ConfigRow { project_id: string; rule_code: string; level: string; mode: string; scope_json: string | null; params_json: string | null }
interface FreezeRow { id: string; name: string; starts_at: string; ends_at: string; branches: string | null; services: string | null; recurrence: string | null; timezone: string | null; created_by: string | null }
interface WaiverRow { id: string; pr_id: number; repo_uuid: string; rule_code: string; requested_by: string; granted_by: string | null; reason: string; requested_at: string; expires_at: string | null; status: string; issue_keys: string | null }
interface EvaluationRow { id: string; workspace_uuid: string; repo_uuid: string; pr_id: number; issue_keys: string; trigger: string; verdict: string; reasons_json: string | null; evaluated_at: string; duration_ms: number; fallback: string | null; cause: string | null; observed_only: number; service: string | null; project_id: string | null }
interface RepoServiceRow { workspace_uuid: string; repo_uuid: string; service: string; jira_component: string | null }
interface CacheRow { issue_key: string; updated_at: string; snapshot_json: string | null }
interface IncidentRow { service: string; incident_key: string; opened_at: string; resolved_at: string | null }
interface StatsRow { total: number; autorisees: number | null; bloquees: number | null; non_concluantes: number | null; replis: number | null; duree_moyenne: number | null }
interface PairingRow { id: string; workspace_uuid: string | null; secret_ref: string | null; paired_at: string | null; paired_by: string | null; fallback_policy: string | null; offer_code: string | null; offer_site_url: string | null; offer_created_by: string | null; offer_issued_at: string | null; offer_expires_at: string | null; offer_used: number | null }

// --- Lignes → domaine ----------------------------------------------------

const configDepuisLigne = (l: ConfigRow): RuleConfig => ({
  rule: l.rule_code as RuleCode, level: l.level as RuleConfig['level'], mode: l.mode as RuleConfig['mode'],
  scope: lireJson(l.scope_json, {}), params: lireJson(l.params_json, {}),
});

const gelDepuisLigne = (l: FreezeRow): Freeze => ({
  id: l.id, name: l.name, startsAt: l.starts_at, endsAt: l.ends_at, branches: depuisListe(l.branches),
  services: depuisListe(l.services), recurrence: lireJson(l.recurrence, { kind: 'none' as const }),
  timezone: l.timezone ?? undefined, createdBy: l.created_by ?? undefined,
});

const derogationDepuisLigne = (l: WaiverRow): StoredWaiver => ({
  id: l.id, prId: Number(l.pr_id), repositoryUuid: l.repo_uuid, rule: l.rule_code as RuleCode,
  requestedBy: l.requested_by, grantedBy: l.granted_by ?? undefined, reason: l.reason,
  requestedAt: l.requested_at, expiresAt: l.expires_at ?? undefined, status: l.status as Waiver['status'],
  issueKeys: depuisListe(l.issue_keys),
});

const evaluationDepuisLigne = (l: EvaluationRow): StoredEvaluation => ({
  id: l.id, workspaceUuid: l.workspace_uuid, repositoryUuid: l.repo_uuid, pullRequestId: Number(l.pr_id),
  issueKeys: depuisListe(l.issue_keys), trigger: l.trigger as StoredEvaluation['trigger'],
  verdict: l.verdict as StoredEvaluation['verdict'], reasons: lireJson(l.reasons_json, []),
  evaluatedAt: l.evaluated_at, durationMs: Number(l.duration_ms), observedOnly: Number(l.observed_only) === 1,
  fallback: (l.fallback ?? undefined) as FallbackPolicy | undefined,
  cause: (l.cause ?? undefined) as StoredEvaluation['cause'], service: l.service ?? undefined,
  projectId: l.project_id ?? undefined,
});

const incidentDepuisLigne = (l: IncidentRow): Incident => ({
  service: l.service, incidentKey: l.incident_key, openedAt: l.opened_at, resolvedAt: l.resolved_at ?? undefined,
});

const correspondanceDepuisLigne = (l: RepoServiceRow): RepoServiceMapping => ({
  workspaceUuid: l.workspace_uuid, repoUuid: l.repo_uuid, service: l.service,
  jiraComponent: l.jira_component ?? undefined,
});

/** Raisons bloquantes restées en observation : matière du rapport « ce qui aurait été bloqué ». */
function blocagesObservés(evaluation: StoredEvaluation): ObservedBlock[] {
  return evaluation.reasons
    .filter((raison) => raison.observed === true && raison.level === 'blocking')
    .map((raison) => ({ rule: raison.rule, repositoryUuid: evaluation.repositoryUuid,
      pullRequestId: evaluation.pullRequestId, issueKeys: evaluation.issueKeys,
      evaluatedAt: evaluation.evaluatedAt, text: raison.text }));
}

/** Filtre de période sur `evaluated_at`, avec la borne haute facultative. */
function periode(since: string, until?: string): { clause: string; params: SqlValue[] } {
  if (until === undefined) return { clause: 'evaluated_at >= ?', params: [since] };
  return { clause: 'evaluated_at >= ? AND evaluated_at <= ?', params: [since, until] };
}

/** Ligne d'agrégats → statistiques de période. */
function statistiques(ligne: StatsRow | undefined, since: string, until?: string): EvaluationStats {
  const nombre = (valeur: number | null | undefined) => Number(valeur ?? 0);
  return { since, until, total: nombre(ligne?.total), allowed: nombre(ligne?.autorisees),
    blocked: nombre(ligne?.bloquees), inconclusive: nombre(ligne?.non_concluantes),
    fallbacks: nombre(ligne?.replis), averageDurationMs: Math.round(nombre(ligne?.duree_moyenne)) };
}

// --- Réglages des règles --------------------------------------------------

const ecrireConfig = upsert('rule_config',
  ['project_id', 'rule_code', 'level', 'mode', 'scope_json', 'params_json', 'updated_at'],
  ['project_id', 'rule_code']);

/** `rule_config` : une ligne par couple (projet, règle). */
export function creerRuleConfigStore(): RuleConfigRepository {
  return {
    listByProject: (projectId) => lire('SELECT * FROM rule_config WHERE project_id = ? ORDER BY rule_code',
      [projectId], configDepuisLigne),
    find: (projectId, rule) => lireUne('SELECT * FROM rule_config WHERE project_id = ? AND rule_code = ?',
      [projectId, rule], configDepuisLigne),
    async upsert(projectId, config, now) {
      await ecrireConfig([projectId, config.rule, config.level, config.mode, json(config.scope),
        json(config.params), now]);
    },
    async remove(projectId, rule) {
      await ecrire('DELETE FROM rule_config WHERE project_id = ? AND rule_code = ?', [projectId, rule]);
    },
  };
}

// --- Gels -----------------------------------------------------------------

const ecrireGel = upsert('freeze',
  ['id', 'name', 'starts_at', 'ends_at', 'branches', 'services', 'recurrence', 'timezone', 'created_by'],
  ['id']);

/** `freeze` : gels ponctuels et récurrents. */
export function creerFreezeStore(): FreezeRepository {
  const depuis = (clause: string) => (now: string) =>
    lire(`SELECT * FROM freeze WHERE ${clause} ORDER BY starts_at`, [now], gelDepuisLigne);
  return {
    async save(freeze) {
      await ecrireGel([freeze.id, freeze.name, freeze.startsAt, freeze.endsAt, enListe(freeze.branches),
        enListe(freeze.services), json(freeze.recurrence), freeze.timezone ?? null, freeze.createdBy ?? null]);
    },
    find: (id) => lireUne('SELECT * FROM freeze WHERE id = ?', [id], gelDepuisLigne),
    list: () => lire('SELECT * FROM freeze ORDER BY starts_at', [], gelDepuisLigne),
    listActive: depuis('starts_at <= ? AND ends_at > ?'),
    listUpcoming: depuis('starts_at > ?'),
    async remove(id) { await ecrire('DELETE FROM freeze WHERE id = ?', [id]); },
  };
}

// --- Dérogations ----------------------------------------------------------

const ecrireDerogation = upsert('waiver',
  ['id', 'pr_id', 'repo_uuid', 'rule_code', 'requested_by', 'granted_by', 'reason', 'requested_at',
    'expires_at', 'status', 'issue_keys'],
  ['id']);

/** Paramètres d'une dérogation, dans l'ordre des colonnes de `waiver`. */
const paramsDerogation = (w: StoredWaiver): SqlValue[] => [w.id, w.prId, w.repositoryUuid, w.rule,
  w.requestedBy, w.grantedBy ?? null, w.reason, w.requestedAt, w.expiresAt ?? null, w.status,
  enListe(w.issueKeys)];

/** `waiver` : demandes, accords, refus, expirations. */
export function creerWaiverStore(): WaiverRepository {
  const find = (id: string) => lireUne('SELECT * FROM waiver WHERE id = ?', [id], derogationDepuisLigne);
  return {
    async create(waiver) { await ecrireDerogation(paramsDerogation(waiver)); },
    find,
    async grant(id, grantedBy, expiresAt) {
      await ecrire("UPDATE waiver SET status = 'granted', granted_by = ?, expires_at = COALESCE(?, expires_at) WHERE id = ?",
        [grantedBy, expiresAt ?? null, id]);
      return find(id);
    },
    async refuse(id, decidedBy) {
      await ecrire("UPDATE waiver SET status = 'refused', granted_by = ? WHERE id = ?", [decidedBy, id]);
      return find(id);
    },
    listByPullRequest: (repositoryUuid, prId) => lire(
      'SELECT * FROM waiver WHERE repo_uuid = ? AND pr_id = ? ORDER BY requested_at DESC',
      [repositoryUuid, prId], derogationDepuisLigne),
    listByIssue: (issueKey) => lire(`SELECT * FROM waiver WHERE ${CONDITION_CLE} ORDER BY requested_at DESC`,
      [parametreCle(issueKey)], derogationDepuisLigne),
    expire: (now) => ecrire(
      "UPDATE waiver SET status = 'expired' WHERE status = 'granted' AND expires_at IS NOT NULL AND expires_at <= ?",
      [now]),
  };
}

// --- Journal des évaluations ----------------------------------------------

const ecrireEvaluation = upsert('evaluation',
  ['id', 'workspace_uuid', 'repo_uuid', 'pr_id', 'issue_keys', '`trigger`', 'verdict', 'reasons_json',
    'evaluated_at', 'duration_ms', 'fallback', 'cause', 'observed_only', 'service', 'project_id'],
  ['id']);

const REQUETE_STATS = `SELECT COUNT(*) AS total,
  SUM(CASE WHEN verdict = 'allowed' THEN 1 ELSE 0 END) AS autorisees,
  SUM(CASE WHEN verdict = 'blocked' THEN 1 ELSE 0 END) AS bloquees,
  SUM(CASE WHEN verdict = 'inconclusive' THEN 1 ELSE 0 END) AS non_concluantes,
  SUM(CASE WHEN fallback IS NULL THEN 0 ELSE 1 END) AS replis,
  AVG(duration_ms) AS duree_moyenne FROM evaluation WHERE `;

/** `evaluation` : une ligne par contrôle, et les comptages de la console. */
export function creerEvaluationStore(): EvaluationRepository {
  const derniere = (clause: string, params: SqlValue[]) => lireUne(
    `SELECT * FROM evaluation WHERE ${clause} ORDER BY evaluated_at DESC LIMIT 1`, params, evaluationDepuisLigne);
  return {
    async record(evaluation) {
      await ecrireEvaluation([evaluation.id, evaluation.workspaceUuid, evaluation.repositoryUuid,
        evaluation.pullRequestId, enListe(evaluation.issueKeys), evaluation.trigger, evaluation.verdict,
        json(evaluation.reasons), evaluation.evaluatedAt, evaluation.durationMs, evaluation.fallback ?? null,
        evaluation.cause ?? null, evaluation.observedOnly === true ? 1 : 0, evaluation.service ?? null,
        evaluation.projectId ?? null]);
    },
    find: (id) => lireUne('SELECT * FROM evaluation WHERE id = ?', [id], evaluationDepuisLigne),
    latestByPullRequest: (repositoryUuid, prId) => derniere('repo_uuid = ? AND pr_id = ?', [repositoryUuid, prId]),
    latestByIssue: (issueKey) => derniere(CONDITION_CLE, [parametreCle(issueKey)]),
    listSince: (since, until) => {
      const filtre = periode(since, until);
      return lire(`SELECT * FROM evaluation WHERE ${filtre.clause} ORDER BY evaluated_at DESC`,
        filtre.params, evaluationDepuisLigne);
    },
    async stats(since, until) {
      const filtre = periode(since, until);
      const ligne = (await lignes<StatsRow>(REQUETE_STATS + filtre.clause, filtre.params))[0];
      return statistiques(ligne, since, until);
    },
    async observedBlocks(since, until) {
      const filtre = periode(since, until);
      const trouve = await lire(`SELECT * FROM evaluation WHERE observed_only = 1 AND ${filtre.clause}
        ORDER BY evaluated_at DESC`, filtre.params, evaluationDepuisLigne);
      return trouve.flatMap(blocagesObservés);
    },
  };
}

// --- Jumelage et politique de repli ---------------------------------------

/**
 * Trois lignes fixes dans `pairing`, distinguées par `id` : `pairing` (le
 * jumelage en vigueur), `offer` (l'offre en cours) et `settings` (la politique
 * de repli). Le secret ne va jamais en base : `secret_ref` pointe vers le
 * stockage de secrets de Forge.
 */
export function creerPairingStore(): PairingRepository {
  const une = (id: string) => lireUne('SELECT * FROM pairing WHERE id = ?', [id], (ligne: PairingRow) => ligne);
  const ecrireOffre = upsert('pairing',
    ['id', 'offer_code', 'offer_site_url', 'offer_created_by', 'offer_issued_at', 'offer_expires_at',
      'offer_used', 'updated_at'], ['id']);
  const ecrireJumelage = upsert('pairing',
    ['id', 'workspace_uuid', 'secret_ref', 'paired_at', 'paired_by', 'updated_at'], ['id']);
  const ecrireRepli = upsert('pairing', ['id', 'fallback_policy', 'updated_at'], ['id']);
  return {
    async saveOffer(offer) {
      await ecrireOffre(['offer', offer.code, offer.siteUrl, offer.createdBy, offer.issuedAt,
        offer.expiresAt, offer.used ? 1 : 0, offer.issuedAt]);
    },
    async currentOffer() {
      const ligne = await une('offer');
      if (ligne === undefined || ligne.offer_code === null) return undefined;
      const offre: PairingOffer = { code: String(ligne.offer_code), siteUrl: String(ligne.offer_site_url ?? ''),
        createdBy: String(ligne.offer_created_by ?? ''), issuedAt: String(ligne.offer_issued_at ?? ''),
        expiresAt: String(ligne.offer_expires_at ?? ''), used: Number(ligne.offer_used ?? 0) === 1 };
      return offre;
    },
    markOfferUsed: (code) => ecrire(
      "UPDATE pairing SET offer_used = 1 WHERE id = 'offer' AND offer_code = ? AND offer_used = 0", [code])
      .then((touchees) => touchees > 0),
    async recordPairing(record) {
      await ecrireJumelage(['pairing', record.workspaceUuid, record.secretRef, record.pairedAt,
        record.pairedBy, record.pairedAt]);
    },
    async current() {
      const ligne = await une('pairing');
      if (ligne === undefined || ligne.secret_ref === null) return undefined;
      const jumelage: PairingRecord = { workspaceUuid: String(ligne.workspace_uuid ?? ''),
        secretRef: String(ligne.secret_ref), pairedAt: String(ligne.paired_at ?? ''),
        pairedBy: String(ligne.paired_by ?? '') };
      return jumelage;
    },
    fallbackPolicy: () => une('settings')
      .then((ligne) => (ligne?.fallback_policy === 'closed' ? 'closed' : 'open')),
    async setFallbackPolicy(policy, now) { await ecrireRepli(['settings', policy, now]); },
    async unpair() { await ecrire("DELETE FROM pairing WHERE id = 'pairing'", []); },
  };
}

// --- Correspondance dépôt → service ---------------------------------------

const ecrireCorrespondance = upsert('repo_service',
  ['workspace_uuid', 'repo_uuid', 'service', 'jira_component', 'updated_at'], ['workspace_uuid', 'repo_uuid']);

/** `repo_service` : quel service un dépôt alimente, et son composant Jira. */
export function creerRepoServiceStore(): RepoServiceRepository {
  return {
    async upsert(mapping, now) {
      await ecrireCorrespondance([mapping.workspaceUuid, mapping.repoUuid, mapping.service,
        mapping.jiraComponent ?? null, now]);
    },
    find: (workspaceUuid, repoUuid) => lireUne(
      'SELECT * FROM repo_service WHERE workspace_uuid = ? AND repo_uuid = ?', [workspaceUuid, repoUuid],
      correspondanceDepuisLigne),
    listByWorkspace: (workspaceUuid) => lire(
      'SELECT * FROM repo_service WHERE workspace_uuid = ? ORDER BY repo_uuid', [workspaceUuid],
      correspondanceDepuisLigne),
    listByService: (service) => lire(
      'SELECT * FROM repo_service WHERE service = ? ORDER BY repo_uuid', [service], correspondanceDepuisLigne),
    async remove(workspaceUuid, repoUuid) {
      await ecrire('DELETE FROM repo_service WHERE workspace_uuid = ? AND repo_uuid = ?', [workspaceUuid, repoUuid]);
    },
  };
}

// --- Cache des tickets ----------------------------------------------------

const ecrireCache = upsert('issue_cache',
  ['issue_key', 'issue_id', 'status', 'criteria_json', 'blockers_json', 'fix_version', 'updated_at',
    'snapshot_json'], ['issue_key']);

/**
 * `issue_cache` : l'instantané complet d'un ticket (colonne `snapshot_json`,
 * seule vérité relue) plus les colonnes du §14 (`status`, `criteria_json`,
 * `blockers_json`, `fix_version`, `updated_at`), tenues à jour pour les
 * requêtes de diagnostic.
 */
export function creerIssueCacheStore(): IssueCacheRepository {
  const ecrireEntree = async (entree: IssueCacheEntry): Promise<void> => {
    const issue = entree.issue;
    await ecrireCache([entree.issueKey, issue.id, issue.status, json(issue.criteria), json(issue.links),
      enListe(issue.fixVersions.map((version) => version.name)), entree.updatedAt, json(issue)]);
  };
  const cacheDepuisLigne = (ligne: CacheRow): IssueCacheEntry => ({
    issueKey: ligne.issue_key,
    issue: lireJson(ligne.snapshot_json, undefined as unknown as IssueCacheEntry['issue']),
    updatedAt: ligne.updated_at,
  });
  const trous = (valeurs: string[]) => valeurs.map(() => '?').join(', ');
  return {
    read: (issueKey) => lireUne('SELECT * FROM issue_cache WHERE issue_key = ?', [issueKey], cacheDepuisLigne),
    readMany: (issueKeys) => (issueKeys.length === 0 ? Promise.resolve([]) : lire(
      `SELECT * FROM issue_cache WHERE issue_key IN (${trous(issueKeys)})`, issueKeys, cacheDepuisLigne)),
    write: ecrireEntree,
    async writeMany(entries) {
      for (const entree of entries) await ecrireEntree(entree);
    },
    async remove(issueKey) { await ecrire('DELETE FROM issue_cache WHERE issue_key = ?', [issueKey]); },
  };
}

// --- Incidents JSM --------------------------------------------------------

const ecrireIncident = upsert('service_incident',
  ['service', 'incident_key', 'opened_at', 'resolved_at'], ['service', 'incident_key']);

/** `service_incident` : les incidents ouverts, par service (R-05). */
export function creerIncidentStore(): IncidentRepository {
  const lireOuverts = (clause: string, params: SqlValue[]) => lire(
    `SELECT * FROM service_incident WHERE ${clause} AND resolved_at IS NULL ORDER BY opened_at`,
    params, incidentDepuisLigne);
  return {
    async open(incident) {
      await ecrireIncident([incident.service, incident.incidentKey, incident.openedAt, incident.resolvedAt ?? null]);
    },
    async resolve(service, incidentKey, resolvedAt) {
      await ecrire('UPDATE service_incident SET resolved_at = ? WHERE service = ? AND incident_key = ?',
        [resolvedAt, service, incidentKey]);
    },
    listOpen: (service) => lireOuverts('service = ?', [service]),
    listOpenMany: (services) => (services.length === 0 ? Promise.resolve([]) : lireOuverts(
      `service IN (${services.map(() => '?').join(', ')})`, services)),
    listOpenAll: () => lireOuverts('1 = 1', []),
  };
}

// --- Nonces du pont signé -------------------------------------------------

/**
 * Mémoire des nonces du pont (§13.3). Le §14 ne prévoit pas de table pour eux :
 * ils vivent en mémoire du runtime, ce qui suffit à refuser un rejeu pendant la
 * vie de l'invocation. Une table dédiée serait le bon logement d'une protection
 * entre invocations — hors des huit tables du §14.
 */
export function creerNonceStore(): NonceStore {
  const vus = new Map<string, number>();
  return {
    async seen(nonce) {
      const expiration = vus.get(nonce);
      return expiration !== undefined && expiration > Date.now();
    },
    async remember(nonce, expiresAt) { vus.set(nonce, Date.parse(expiresAt)); },
  };
}

/** Tout le stockage Forge SQL, assemblé : ce que reçoit l'app Jira. */
export function createSqlStore(): Store {
  return {
    pairing: creerPairingStore(),
    ruleConfig: creerRuleConfigStore(),
    freezes: creerFreezeStore(),
    waivers: creerWaiverStore(),
    evaluations: creerEvaluationStore(),
    repoService: creerRepoServiceStore(),
    issueCache: creerIssueCacheStore(),
    incidents: creerIncidentStore(),
    nonces: creerNonceStore(),
  };
}
