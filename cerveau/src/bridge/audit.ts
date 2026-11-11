/**
 * Identités déclarées et journal d'audit des dérogations (items 47, 48, 50).
 *
 * Le pont reçoit `requestedBy` et `decidedBy` dans la charge utile : ce sont
 * des **déclarations**, pas des preuves. Un web trigger Forge n'a pas de
 * session Bitbucket à présenter, et le Cerveau ne peut pas authentifier un
 * compte à distance. Deux choses sont donc faites, et seulement deux :
 *
 * 1. **Contrôle d'habilitation** (item 48) : pour une décision, le décideur
 *    déclaré doit figurer parmi les approbateurs que l'installation a elle-même
 *    habilités (réglages de l'app). Sinon, refus explicite. Quand aucune liste
 *    n'est configurée, le contrôle est impossible : la décision passe, mais
 *    l'identité est journalisée comme `declared` — jamais comme `verified`.
 * 2. **Traçabilité honnête** (items 47, 50, §16) : chaque événement (demande,
 *    accord, refus) écrit une ligne dans `waiver_audit` avec l'identité
 *    déclarée et son statut. Le journal est conservé sans limite de durée.
 *
 * Rien de secret n'est journalisé : ni secret partagé, ni nonce, ni signature.
 */
import type { Waiver, WaiverAuditEntry, WaiverIdentityStatus } from '../shared';
import type { BridgeDeps } from './deps';
import { erreurPont } from './errors';

/** Ce que rend le contrôle d'habilitation d'un décideur. */
export interface IdentiteDecideur {
  /** Identité telle que déclarée dans la charge utile. */
  declaree: string;
  /** Vérifiée contre la liste d'habilitation, ou seulement déclarée. */
  statut: WaiverIdentityStatus;
  /** Vrai si la décision peut être prise. */
  autorisee: boolean;
}

/** Approbateurs habilités ; une liste illisible ou absente vaut une liste vide. */
async function habilitations(deps: BridgeDeps): Promise<string[]> {
  if (deps.approbateurs === undefined) return [];
  try {
    const liste = await deps.approbateurs();
    return Array.isArray(liste) ? liste : [];
  } catch {
    return [];
  }
}

/** Contrôle l'identité déclarée du décideur (item 48). */
export async function identiteDuDecideur(deps: BridgeDeps, decidedBy: string): Promise<IdentiteDecideur> {
  const habilites = await habilitations(deps);
  if (habilites.includes(decidedBy)) return { declaree: decidedBy, statut: 'verified', autorisee: true };
  if (habilites.length === 0) return { declaree: decidedBy, statut: 'declared', autorisee: true };
  return { declaree: decidedBy, statut: 'declared', autorisee: false };
}

/** Refus lisible d'un décideur qui n'est pas un approbateur habilité. */
export function refusNonHabilite(decidedBy: string): Error {
  return erreurPont(
    'unauthorized',
    `Le décideur « ${decidedBy} » ne fait pas partie des approbateurs habilités de cette installation.`,
  );
}

/** Identifiant d'une ligne d'audit : déterministe, donc rejouable sans doublon. */
export function identifiantAudit(
  waiverId: string,
  decision: WaiverAuditEntry['decision'],
  now: string,
): string {
  return `audit-${waiverId}-${decision}-${Date.parse(now)}`;
}

/** Arguments d'une ligne d'audit : la dérogation et l'événement qui la touche. */
export interface ArgumentsAudit {
  deps: BridgeDeps;
  waiver: Waiver;
  decision: WaiverAuditEntry['decision'];
  decidedBy?: string;
  identity: WaiverIdentityStatus;
  workspaceUuid?: string;
}

/** Ligne d'audit d'un événement de dérogation. */
export function entreeAudit(args: ArgumentsAudit): WaiverAuditEntry {
  const now = args.deps.clock();
  return {
    id: identifiantAudit(args.waiver.id, args.decision, now),
    waiverId: args.waiver.id,
    prId: args.waiver.prId,
    repositoryUuid: args.waiver.repositoryUuid,
    rule: args.waiver.rule,
    workspaceUuid: args.workspaceUuid,
    requestedBy: args.waiver.requestedBy,
    decidedBy: args.decidedBy,
    decision: args.decision,
    reason: args.waiver.reason,
    identity: args.identity,
    createdAt: now,
  };
}

/**
 * Écrit une ligne d'audit (item 50).
 *
 * Sans port branché, l'événement part au journal applicatif : la décision n'est
 * pas annulée par un journal injoignable, mais la perte est dite à voix haute
 * (`error`), parce qu'une traçabilité silencieusement absente ne vaut rien.
 */
export async function journaliser(deps: BridgeDeps, entree: WaiverAuditEntry): Promise<void> {
  const contexte = {
    waiverId: entree.waiverId,
    decision: entree.decision,
    identity: entree.identity,
    decidedBy: entree.decidedBy ?? '',
    requestedBy: entree.requestedBy,
  };
  if (deps.audit === undefined) {
    deps.logger.info('Pont : dérogation sans journal d’audit branché', contexte);
    return;
  }
  try {
    await deps.audit.record(entree);
  } catch (erreur) {
    deps.logger.error('Pont : journal d’audit injoignable', { ...contexte, erreur: String(erreur) });
  }
}
