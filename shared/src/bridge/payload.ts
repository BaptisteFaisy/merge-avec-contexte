/**
 * Enveloppe du pont : une route, une charge utile, et des gardes de forme.
 *
 * Le Capteur et le Cerveau s'écrivent toujours la même enveloppe JSON ; la
 * route dit ce qui est demandé. Les gardes rendent `{ok:false}` au lieu de
 * lever : un web trigger qui lève renvoie une erreur opaque à Bitbucket.
 */
import type { RuleCode, Trigger } from '../types';
import { isRuleCode } from '../rules/catalog';

export type BridgeRoute = 'health' | 'pair' | 'evaluate' | 'card' | 'waiver.request' | 'waiver.decide';

export const BRIDGE_ROUTES: BridgeRoute[] = ['health', 'pair', 'evaluate', 'card', 'waiver.request', 'waiver.decide'];

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
}

/** Décision d'une dérogation (accord ou refus) par une personne habilitée. */
export interface WaiverDecisionPayload {
  waiverId: string;
  decision: 'granted' | 'refused';
  decidedBy: string;
  hours?: number;
}

/** Codes d'erreur renvoyés par le Cerveau. */
export type BridgeErrorCode = 'unpaired' | 'unknown-route' | 'bad-payload' | 'unauthorized' | 'not-found' | 'internal';

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
    (valeur.changedPaths === undefined || isStringList(valeur.changedPaths))
  );
}

/** Garde de forme d'une demande de jumelage. */
export function isPairPayload(valeur: unknown): valeur is PairPayload {
  return isRecord(valeur) && typeof valeur.code === 'string' && typeof valeur.workspaceUuid === 'string';
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
    typeof valeur.requestedBy === 'string'
  );
}

/** Garde de forme d'une décision de dérogation. */
export function isWaiverDecisionPayload(valeur: unknown): valeur is WaiverDecisionPayload {
  if (!isRecord(valeur)) return false;
  return (
    typeof valeur.waiverId === 'string' &&
    (valeur.decision === 'granted' || valeur.decision === 'refused') &&
    typeof valeur.decidedBy === 'string' &&
    (valeur.hours === undefined || typeof valeur.hours === 'number')
  );
}
