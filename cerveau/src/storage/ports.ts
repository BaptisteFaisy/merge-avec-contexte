/**
 * Ports de stockage du Cerveau (§13.4, §14).
 *
 * Une interface par agrégat : la logique métier (règles, pont, pages Jira) ne
 * connaît que ces contrats, jamais `@forge/sql`. Deux implémentations les
 * honorent — `memory-store.ts` (tests, déploiement sans base) et `sql-store.ts`
 * (Forge SQL) — et les tests de comportement tournent sur la première.
 *
 * Règles communes à tous les ports :
 * - tout est asynchrone (une base, même mémoire, ne répond pas en un tick) ;
 * - l'heure est toujours reçue en paramètre (`now`, chaîne ISO 8601) : aucun
 *   port ne lit l'horloge, un test peut donc fixer le temps ;
 * - aucun identifiant n'est inventé par le stockage : il vient de l'appelant ;
 * - aucun contrôle métier : une dérogation expirée reste `granted` tant que
 *   `expire` n'a pas été appelé, un jumelage consommé reste consommé.
 */
import type { PairingOffer } from '../shared/bridge/pairing';
import type { WaiverAuditEntry } from '../shared/bridge/payload';
import type { NonceStore } from '../shared/bridge/verify';
import type {
  Evaluation,
  FallbackPolicy,
  Freeze,
  Incident,
  IssueContext,
  RuleCode,
  RuleConfig,
  Waiver,
} from '../shared/types';

/** Mémoire des nonces du pont signé : même contrat que `shared/src/bridge/verify`. */
export type { NonceStore };

// ---------------------------------------------------------------------------
// Réglages des règles
// ---------------------------------------------------------------------------

/** Réglages des règles, par projet Jira (table `rule_config`). */
export interface RuleConfigRepository {
  /** Toutes les règles configurées d'un projet. */
  listByProject(projectId: string): Promise<RuleConfig[]>;
  /** Une règle du projet, ou `undefined` si le projet ne l'a pas réglée. */
  find(projectId: string, rule: RuleCode): Promise<RuleConfig | undefined>;
  /** Écrit le réglage d'une règle : création ou remplacement, jamais deux lignes. */
  upsert(projectId: string, config: RuleConfig, now: string): Promise<void>;
  /** Retire un réglage : la règle reprend alors ses valeurs par défaut. */
  remove(projectId: string, rule: RuleCode): Promise<void>;
}

// ---------------------------------------------------------------------------
// Gels
// ---------------------------------------------------------------------------

/** Gels de déploiement (table `freeze`). */
export interface FreezeRepository {
  /** Crée ou remplace un gel, à l'identique de son identifiant. */
  save(freeze: Freeze): Promise<void>;
  find(id: string): Promise<Freeze | undefined>;
  /** Tous les gels, récurrents compris. */
  list(): Promise<Freeze[]>;
  /** Gels en cours à cet instant : commencés, pas terminés. */
  listActive(now: string): Promise<Freeze[]>;
  /** Gels à venir : pas encore commencés. */
  listUpcoming(now: string): Promise<Freeze[]>;
  remove(id: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Dérogations
// ---------------------------------------------------------------------------

/**
 * Une dérogation telle que stockée : le type partagé, plus les tickets qui
 * l'ont motivée (c'est par eux que la page du ticket la retrouve).
 */
export interface StoredWaiver extends Waiver {
  /** Clés des tickets de la PR ; vide = dérogation valable pour la PR seule. */
  issueKeys: string[];
}

/** Dérogations tracées (table `waiver`). */
export interface WaiverRepository {
  /** Enregistre une demande (statut `requested`). */
  create(waiver: StoredWaiver): Promise<void>;
  find(id: string): Promise<StoredWaiver | undefined>;
  /** Accorde une dérogation : qui, et jusqu'à quand. */
  grant(id: string, grantedBy: string, expiresAt?: string): Promise<StoredWaiver | undefined>;
  /** Refuse une dérogation : qui a tranché, la trace reste. */
  refuse(id: string, decidedBy: string): Promise<StoredWaiver | undefined>;
  /** Dérogations d'une PR. */
  listByPullRequest(repositoryUuid: string, prId: number): Promise<StoredWaiver[]>;
  /** Dérogations rattachées à un ticket, toutes PR confondues. */
  listByIssue(issueKey: string): Promise<StoredWaiver[]>;
  /**
   * Dérogations demandées dans une période, les plus récentes d'abord : c'est
   * ce que le journal affiche (item 12) et ce qui nourrit les comptages
   * demandées / accordées / refusées du §10 MC-16 (item 13).
   */
  listSince(since: string, until?: string): Promise<StoredWaiver[]>;
  /** Passe en `expired` les dérogations accordées dont la date est passée. */
  expire(now: string): Promise<number>;
}

// ---------------------------------------------------------------------------
// Journal d'audit des dérogations
// ---------------------------------------------------------------------------

/**
 * Journal d'audit des décisions de dérogation (table `waiver_audit`).
 *
 * Une ligne par événement — demande, accord, refus — avec les identités
 * déclarées et leur statut (vérifiée ou déclarée). Contrairement aux nonces du
 * pont, ce journal n'est **jamais purgé** : le §16 exige une traçabilité sans
 * limite de durée. C'est aussi le port par lequel les écrans lisent la trace
 * (l'écran lui-même est un autre lot).
 */
export interface WaiverAuditRepository {
  /** Enregistre un événement ; l'identifiant vient de l'appelant. */
  record(entry: WaiverAuditEntry): Promise<void>;
  find(id: string): Promise<WaiverAuditEntry | undefined>;
  /** Toute la trace d'une dérogation, la demande d'abord. */
  listByWaiver(waiverId: string): Promise<WaiverAuditEntry[]>;
  /** Trace d'une PR : ce que l'écran de la carte et le journal affichent. */
  listByPullRequest(repositoryUuid: string, prId: number): Promise<WaiverAuditEntry[]>;
  /** Événements d'une période, les plus récents d'abord. */
  listSince(since: string, until?: string): Promise<WaiverAuditEntry[]>;
}

// ---------------------------------------------------------------------------
// Évaluations
// ---------------------------------------------------------------------------

/** Une évaluation journalisée, rattachée à sa PR et à son contexte (§14). */
export interface StoredEvaluation extends Evaluation {
  /** Identifiant fourni par l'appelant (pas d'`AUTO_INCREMENT`). */
  id: string;
  workspaceUuid: string;
  repositoryUuid: string;
  pullRequestId: number;
  /**
   * Identifiant de corrélation (item 60) : porté par chaque ligne de
   * `forge logs` de ce contrôle, il relie la trace applicative à la PR et à
   * cette ligne du journal. Fourni par l'appelant, comme `id`.
   */
  correlationId?: string;
  /** Service alimenté par le dépôt, quand la correspondance est connue. */
  service?: string;
  /** Projet Jira dont les réglages ont servi. */
  projectId?: string;
}

/**
 * Percentile « rang le plus proche » : la plus petite durée de la liste dont au
 * moins `pourcentage` % des valeurs lui sont inférieures ou égales. C'est la
 * définition qui donne un sens mesurable au §16 — « 95 % des évaluations en
 * moins de 5 s » (item 8).
 *
 * Fonction pure du contrat : les deux implémentations de `stats` et le modèle de
 * vue du journal l'appellent, pour qu'un même chiffre sorte partout. Liste vide
 * → `0`.
 */
export function percentileDurees(durees: readonly number[], pourcentage: number): number {
  if (durees.length === 0) return 0;
  const triees = [...durees].sort((a, b) => a - b);
  const rang = Math.ceil((pourcentage / 100) * triees.length);
  const indice = Math.min(triees.length, Math.max(1, rang)) - 1;
  return Math.round(triees[indice] as number);
}

/** Durée la plus longue de la liste, arrondie ; `0` si la liste est vide. */
export function dureeMaximale(durees: readonly number[]): number {
  return Math.round(durees.reduce((max, duree) => (duree > max ? duree : max), 0));
}

/** Chiffres d'une période, pour la console et le rapport d'observation. */
export interface EvaluationStats {
  since: string;
  until?: string;
  total: number;
  allowed: number;
  blocked: number;
  inconclusive: number;
  /** Évaluations issues d'un repli : Cerveau injoignable ou trop lent (§13.5). */
  fallbacks: number;
  /** Durée moyenne de bout en bout, en millisecondes. */
  averageDurationMs: number;
  /**
   * 95e percentile des durées, en millisecondes : le chiffre que le §16 exige
   * de mesurer et d'afficher (« 95 % des évaluations en moins de 5 s »).
   */
  p95DurationMs: number;
  /** Durée la plus longue de la période, en millisecondes : le pire cas vu. */
  maxDurationMs: number;
}

/**
 * Une règle bloquante qui n'a pas bloqué parce qu'elle était en observation :
 * c'est la matière du rapport « ce qui aurait été bloqué » (§10).
 */
export interface ObservedBlock {
  rule: RuleCode;
  repositoryUuid: string;
  pullRequestId: number;
  issueKeys: string[];
  evaluatedAt: string;
  /** Texte déjà rédigé, repris de la raison journalisée. */
  text: string;
}

/** Une page du journal : limite et décalage facultatifs (item 56). */
export interface PageEvaluation {
  /** Nombre maximal d'évaluations rendues ; sans borne si omis. */
  limit?: number;
  /** Nombre d'évaluations sautées avant la page courante ; défaut 0. */
  offset?: number;
}

/** Journal des évaluations (table `evaluation`). */
export interface EvaluationRepository {
  /** Enregistre une évaluation : une ligne par contrôle. */
  record(evaluation: StoredEvaluation): Promise<void>;
  find(id: string): Promise<StoredEvaluation | undefined>;
  /** Dernière évaluation d'une PR. */
  latestByPullRequest(repositoryUuid: string, prId: number): Promise<StoredEvaluation | undefined>;
  /** Dernière évaluation qui a reconnu ce ticket. */
  latestByIssue(issueKey: string): Promise<StoredEvaluation | undefined>;
  /** Évaluations d'une période, les plus récentes d'abord. */
  listSince(since: string, until?: string, page?: PageEvaluation): Promise<StoredEvaluation[]>;
  /** Comptages et durée moyenne d'une période. */
  stats(since: string, until?: string): Promise<EvaluationStats>;
  /** Ce qui aurait été bloqué : raisons bloquantes en mode observation. */
  observedBlocks(since: string, until?: string): Promise<ObservedBlock[]>;
}

// ---------------------------------------------------------------------------
// Jumelage
// ---------------------------------------------------------------------------

/** Le jumelage en vigueur : un espace Bitbucket, un secret, une date. */
export interface PairingRecord {
  workspaceUuid: string;
  /** Référence au secret Forge : le secret lui-même ne va jamais en base. */
  secretRef: string;
  pairedAt: string;
  pairedBy: string;
}

/** Jumelage et politique de repli (table `pairing`). */
export interface PairingRepository {
  /** Enregistre l'offre de jumelage en cours (code à usage unique). */
  saveOffer(offer: PairingOffer): Promise<void>;
  /** Offre en cours, qu'elle soit consommée ou non. */
  currentOffer(): Promise<PairingOffer | undefined>;
  /** Marque une offre comme consommée : un code ne jumelle qu'une fois. */
  markOfferUsed(code: string): Promise<boolean>;
  /** Enregistre un jumelage : il remplace le précédent (rotation du secret). */
  recordPairing(record: PairingRecord): Promise<void>;
  /** Jumelage actif, ou `undefined` si l'installation n'est pas jumelée. */
  current(): Promise<PairingRecord | undefined>;
  /** Politique de repli (§13.5) : lue même sans jumelage, défaut `open`. */
  fallbackPolicy(): Promise<FallbackPolicy>;
  setFallbackPolicy(policy: FallbackPolicy, now: string): Promise<void>;
  /** Défait le jumelage : le secret n'est plus utilisable. */
  unpair(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Correspondance dépôt → service
// ---------------------------------------------------------------------------

/** Un dépôt Bitbucket et ce qu'il alimente côté Jira (table `repo_service`). */
export interface RepoServiceMapping {
  workspaceUuid: string;
  repoUuid: string;
  /** Nom du service, tel qu'il apparaît dans les gels et les incidents. */
  service: string;
  /** Composant Jira correspondant, quand il existe. */
  jiraComponent?: string;
}

/** Correspondance dépôt → service et composant Jira. */
export interface RepoServiceRepository {
  upsert(mapping: RepoServiceMapping, now: string): Promise<void>;
  find(workspaceUuid: string, repoUuid: string): Promise<RepoServiceMapping | undefined>;
  listByWorkspace(workspaceUuid: string): Promise<RepoServiceMapping[]>;
  listByService(service: string): Promise<RepoServiceMapping[]>;
  remove(workspaceUuid: string, repoUuid: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Cache des tickets
// ---------------------------------------------------------------------------

/** Instantané d'un ticket et sa fraîcheur (§13.4 : périmé au-delà de 60 s). */
export interface IssueCacheEntry {
  /** Clé reconnue dans la PR (R-02) ; c'est la clé de lecture. */
  issueKey: string;
  /** Instantané complet, prêt à nourrir les règles. */
  issue: IssueContext;
  /** Date du dernier rafraîchissement, décidée par l'appelant. */
  updatedAt: string;
}

/** Cache par ticket (table `issue_cache`). */
export interface IssueCacheRepository {
  read(issueKey: string): Promise<IssueCacheEntry | undefined>;
  /** Lecture en lot : une requête, pas N. */
  readMany(issueKeys: string[]): Promise<IssueCacheEntry[]>;
  write(entry: IssueCacheEntry): Promise<void>;
  /** Écriture en lot, pour les événements Jira qui touchent plusieurs tickets. */
  writeMany(entries: IssueCacheEntry[]): Promise<void>;
  remove(issueKey: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Incidents JSM
// ---------------------------------------------------------------------------

/** Incidents ouverts par service (table `service_incident`). */
export interface IncidentRepository {
  /** Ouvre un incident ; le rouvrir met simplement `resolved_at` à vide. */
  open(incident: Incident): Promise<void>;
  /** Clôt un incident à la date reçue. */
  resolve(service: string, incidentKey: string, resolvedAt: string): Promise<void>;
  /** Incidents encore ouverts d'un service (R-05). */
  listOpen(service: string): Promise<Incident[]>;
  /** Incidents ouverts de plusieurs services, en une requête. */
  listOpenMany(services: string[]): Promise<Incident[]>;
  /** Tous les incidents ouverts, pour la console. */
  listOpenAll(): Promise<Incident[]>;
}

// ---------------------------------------------------------------------------
// Le paquet complet
// ---------------------------------------------------------------------------

/** Tout le stockage du Cerveau, assemblé : ce que reçoit un consommateur. */
export interface Store {
  pairing: PairingRepository;
  ruleConfig: RuleConfigRepository;
  freezes: FreezeRepository;
  waivers: WaiverRepository;
  waiverAudit: WaiverAuditRepository;
  evaluations: EvaluationRepository;
  repoService: RepoServiceRepository;
  issueCache: IssueCacheRepository;
  incidents: IncidentRepository;
  nonces: NonceStore;
}
