/**
 * Enveloppe du pont : une route, une charge utile, et des gardes de forme.
 *
 * Le Capteur et le Cerveau s'écrivent toujours la même enveloppe JSON ; la
 * route dit ce qui est demandé. Les gardes rendent `{ok:false}` au lieu de
 * lever : un web trigger qui lève renvoie une erreur opaque à Bitbucket.
 */
import type { RuleCode, Trigger } from '../types';
import { isRuleCode } from '../rules/catalog';
import type { DepotRule } from '../rules/depot';

export type BridgeRoute =
  | 'health'
  | 'diagnostic'
  | 'pair'
  | 'evaluate'
  | 'card'
  | 'waiver.request'
  | 'waiver.decide';

export const BRIDGE_ROUTES: BridgeRoute[] = [
  'health', 'diagnostic', 'pair', 'evaluate', 'card', 'waiver.request', 'waiver.decide',
];

export const TRIGGERS: Trigger[] = ['on-code-pushed', 'on-reviewer-status-changed', 'on-merge'];

export interface BridgeEnvelope {
  route: BridgeRoute;
  payload: unknown;
}

/** Demande d'évaluation : uniquement des métadonnées de PR (§13.3, sobriété). */
export interface EvaluatePayload {
  workspaceUuid: string;
  repositoryUuid: string;
  repositorySlug?: string;
  pullRequestId: number;
  trigger: Trigger;
  issueKeys: string[];
  sourceBranch: string;
  targetBranch: string;
  /** Chemins modifiés — absent si l'administrateur a désactivé leur envoi. */
  changedPaths?: string[];
  reviewers?: { accountId: string; state: string }[];
  mergeCommitMessage?: string;
  /**
   * Règles durcies lues dans `.merge-context.yml` du dépôt (MC-17, §23).
   * Absent si le dépôt n'en versionne pas ; le Cerveau les compose avec les
   * réglages de l'espace sans jamais s'affaiblir (voir `rules/depot.ts`).
   */
  depotRules?: DepotRule[];
}

/** Demande de jumelage par code à usage unique. */
export interface PairPayload {
  code: string;
  workspaceUuid: string;
}

/** Réponse de jumelage : le secret partagé et l'adresse du pont. */
export interface PairResult {
  secret: string;
  bridgeUrl: string;
  siteUrl: string;
  pairedAt: string;
}

/** Demande de dérogation depuis la carte de PR. */
export interface WaiverRequestPayload {
  prId: number;
  repositoryUuid: string;
  rule: RuleCode;
  reason: string;
  hours: number;
  requestedBy: string;
  issueKey?: string;
  /**
   * Espace de travail Bitbucket qui demande : il lie la requête au jumelage
   * dont le secret l'a signée. Facultatif pour rester compatible avec les
   * Capteurs déjà déployés ; sans lui, seule une installation à un unique
   * jumelage peut valider la requête.
   */
  workspaceUuid?: string;
}

/** Décision d'une dérogation (accord ou refus) par une personne habilitée. */
export interface WaiverDecisionPayload {
  waiverId: string;
  decision: 'granted' | 'refused';
  decidedBy: string;
  hours?: number;
  /** Espace de travail concerné : même rôle que dans la demande. */
  workspaceUuid?: string;
}

/**
 * Statut d'une identité déclarée dans une charge utile (§16, traçabilité).
 *
 * Le pont ne peut pas authentifier un compte Bitbucket ou Jira : `verified`
 * signifie seulement que le Cerveau a contrôlé l'identité déclarée contre une
 * liste d'habilitation qu'il tient lui (approbateurs de dérogations,
 * administrateur de l'installation).
 */
export type WaiverIdentityStatus = 'verified' | 'declared';

/** Ce qu'une décision de dérogation a fait, tel que journalisé (item 50). */
export interface WaiverAuditEntry {
  /** Identifiant fourni par l'appelant : le journal n'invente rien. */
  id: string;
  waiverId: string;
  prId: number;
  repositoryUuid: string;
  rule: RuleCode;
  /** Espace de travail lié à la décision, quand la requête l'annonçait. */
  workspaceUuid?: string;
  /** Qui a demandé la dérogation. */
  requestedBy: string;
  /** Qui a tranché ; absent tant que la demande n'est pas décidée. */
  decidedBy?: string;
  decision: 'requested' | 'granted' | 'refused';
  /** Motivation de la demande, telle que rédigée par le demandeur. */
  reason: string;
  /**
   * Statut de l'identité qui porte l'événement : le demandeur pour une demande,
   * le décideur pour une décision. `verified` = contrôlée contre la liste des
   * approbateurs habilités ; `declared` = recopiée de la charge utile.
   */
  identity: WaiverIdentityStatus;
  /** Horodatage ISO 8601, fourni par l'appelant. */
  createdAt: string;
}

/** Codes d'erreur renvoyés par le Cerveau. */
export type BridgeErrorCode =
  | 'unpaired'
  | 'unknown-route'
  | 'bad-payload'
  | 'unauthorized'
  | 'not-found'
  | 'rate-limited'
  | 'internal';

export interface BridgeErrorBody {
  error: BridgeErrorCode;
  message: string;
}

function isRecord(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur);
}

function isStringList(valeur: unknown): valeur is string[] {
  return Array.isArray(valeur) && valeur.every((item) => typeof item === 'string');
}

/** Garde de forme des règles de dépôt : une liste d'objets portant un code. */
function isDepotRuleList(valeur: unknown): valeur is DepotRule[] {
  return (
    Array.isArray(valeur) &&
    valeur.every((item) => isRecord(item) && typeof item.code === 'string')
  );
}

/** Analyse le corps JSON d'une requête du pont. */
export function parseEnvelope(body: string): { ok: true; envelope: BridgeEnvelope } | { ok: false; reason: 'bad-json' | 'bad-shape' } {
  let brut: unknown;
  try {
    brut = JSON.parse(body);
  } catch {
    return { ok: false, reason: 'bad-json' };
  }
  if (!isRecord(brut)) return { ok: false, reason: 'bad-shape' };
  const route = brut.route;
  if (typeof route !== 'string' || !(BRIDGE_ROUTES as string[]).includes(route)) {
    return { ok: false, reason: 'bad-shape' };
  }
  return { ok: true, envelope: { route: route as BridgeRoute, payload: brut.payload } };
}

/** Garde de forme d'une demande d'évaluation. */
export function isEvaluatePayload(valeur: unknown): valeur is EvaluatePayload {
  if (!isRecord(valeur)) return false;
  return (
    typeof valeur.workspaceUuid === 'string' &&
    typeof valeur.repositoryUuid === 'string' &&
    typeof valeur.pullRequestId === 'number' &&
    typeof valeur.sourceBranch === 'string' &&
    typeof valeur.targetBranch === 'string' &&
    (TRIGGERS as string[]).includes(String(valeur.trigger)) &&
    isStringList(valeur.issueKeys) &&
    (valeur.changedPaths === undefined || isStringList(valeur.changedPaths)) &&
    (valeur.depotRules === undefined || isDepotRuleList(valeur.depotRules))
  );
}

/** Garde de forme d'une demande de jumelage. */
export function isPairPayload(valeur: unknown): valeur is PairPayload {
  return isRecord(valeur) && typeof valeur.code === 'string' && typeof valeur.workspaceUuid === 'string';
}

/** Espace de travail annoncé, s'il y en a un : chaîne ou rien. */
function isWorkspaceUuid(valeur: unknown): boolean {
  return valeur === undefined || typeof valeur === 'string';
}

/** Garde de forme d'une demande de dérogation. */
export function isWaiverRequestPayload(valeur: unknown): valeur is WaiverRequestPayload {
  if (!isRecord(valeur)) return false;
  return (
    typeof valeur.prId === 'number' &&
    typeof valeur.repositoryUuid === 'string' &&
    typeof valeur.rule === 'string' &&
    isRuleCode(valeur.rule) &&
    typeof valeur.reason === 'string' &&
    typeof valeur.hours === 'number' &&
    valeur.hours > 0 &&
    typeof valeur.requestedBy === 'string' &&
    isWorkspaceUuid(valeur.workspaceUuid)
  );
}

/** Garde de forme d'une décision de dérogation. */
export function isWaiverDecisionPayload(valeur: unknown): valeur is WaiverDecisionPayload {
  if (!isRecord(valeur)) return false;
  return (
    typeof valeur.waiverId === 'string' &&
    (valeur.decision === 'granted' || valeur.decision === 'refused') &&
    typeof valeur.decidedBy === 'string' &&
    (valeur.hours === undefined || typeof valeur.hours === 'number') &&
    isWorkspaceUuid(valeur.workspaceUuid)
  );
}
