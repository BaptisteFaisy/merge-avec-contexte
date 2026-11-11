/**
 * Dérogations (§7.1, MC-07) : une exception accordée pour une règle, par une
 * personne habilitée, avec motif et durée. Elle vise une PR, ou des tickets :
 * dans ce cas elle lève le blocage de n'importe quelle PR qui les cite. Une
 * dérogation expirée ne protège plus rien : le contrôle échoue et le dit.
 */
import { t } from '../message/strings';
import { formatDayAndHour } from '../time/moment';
import type { Level, Locale, Reason, RuleCode, Waiver } from '../types';

/** Ce qu'une dérogation peut couvrir : une PR, ou les tickets qu'elle cite. */
export interface WaiverScope {
  prId: number;
  repositoryUuid: string;
  /** Clés de tickets citées par la PR ; vides si aucune. */
  issueKeys: string[];
}

export interface WaiverContext {
  prId: number;
  repositoryUuid: string;
  /** Clés de tickets citées par la PR ; absentes si l'appelant ne les a pas. */
  issueKeys?: string[];
  now: string;
}

/** Passe en `expired` les dérogations accordées dont la date est dépassée. */
export function expireStale(waivers: Waiver[], now: string): Waiver[] {
  const instant = Date.parse(now);
  return waivers.map((waiver) => {
    if (waiver.status !== 'granted' || !waiver.expiresAt) return waiver;
    return Date.parse(waiver.expiresAt) <= instant ? { ...waiver, status: 'expired' as const } : waiver;
  });
}

/** Les clés Jira ne sont pas sensibles à la casse : comparaison normalisée. */
function cleTicket(valeur: string): string {
  return valeur.trim().toUpperCase();
}

/** Vrai si un des tickets de la dérogation est cité par la PR. */
function couvreParTicket(waiver: Waiver, issueKeys: string[] | undefined): boolean {
  if (!waiver.issueKeys || waiver.issueKeys.length === 0) return false;
  if (!issueKeys || issueKeys.length === 0) return false;
  const cites = new Set(issueKeys.map(cleTicket));
  return waiver.issueKeys.some((cle) => cites.has(cleTicket(cle)));
}

/** Vrai si la dérogation vise cette PR, ou un ticket qu'elle cite. */
export function couvreLaPr(
  waiver: Waiver,
  scope: { prId: number; repositoryUuid: string; issueKeys?: string[] },
): boolean {
  const parPr = waiver.prId === scope.prId && waiver.repositoryUuid === scope.repositoryUuid;
  return parPr || couvreParTicket(waiver, scope.issueKeys);
}

/** Vrai si la dérogation s'applique à cette PR, maintenant. */
export function isEffective(waiver: Waiver, ctx: WaiverContext): boolean {
  if (waiver.status !== 'granted') return false;
  if (!couvreLaPr(waiver, ctx)) return false;
  return waiver.expiresAt === undefined || Date.parse(waiver.expiresAt) > Date.parse(ctx.now);
}

/** Dérogations en vigueur pour cette PR. */
export function effectiveWaivers(waivers: Waiver[], ctx: WaiverContext): Waiver[] {
  return waivers.filter((waiver) => isEffective(waiver, ctx));
}

/** Dérogation en vigueur couvrant une règle, s'il y en a une. */
export function waiverForRule(waivers: Waiver[], rule: RuleCode, ctx: WaiverContext): Waiver | undefined {
  return effectiveWaivers(waivers, ctx).find((waiver) => waiver.rule === rule);
}

/** Rattache une dérogation par ticket à la PR qu'elle couvre. */
function rattacher(waiver: Waiver, scope: WaiverScope): Waiver {
  if (waiver.prId === scope.prId && waiver.repositoryUuid === scope.repositoryUuid) return waiver;
  return { ...waiver, prId: scope.prId, repositoryUuid: scope.repositoryUuid };
}

/**
 * Dérogations couvrant cette PR, parmi des candidats chargés par PR et par
 * ticket : dédoublonnées par identifiant, les dérogations par ticket rattachées
 * à la PR (le moteur filtre sur la PR). Les statuts non accordés sont conservés
 * pour la trace (l'expiration doit pouvoir être dite, §17 cas 5).
 */
export function waiversForPr(candidats: Waiver[], scope: WaiverScope): Waiver[] {
  const retenus = new Map<string, Waiver>();
  for (const waiver of candidats) {
    if (couvreLaPr(waiver, scope)) retenus.set(waiver.id, rattacher(waiver, scope));
  }
  return [...retenus.values()];
}

/** Dérogation expirée qui couvrait cette règle pour cette PR, s'il y en a une. */
export function expiredWaiverForRule(waivers: Waiver[], rule: RuleCode, ctx: WaiverContext): Waiver | undefined {
  const instant = Date.parse(ctx.now);
  return waivers.find((waiver) =>
    waiver.rule === rule
    && (waiver.status === 'granted' || waiver.status === 'expired')
    && waiver.expiresAt !== undefined
    && Date.parse(waiver.expiresAt) <= instant
    && couvreLaPr(waiver, ctx));
}

/** Phrase de trace : qui a accordé, jusqu'à quand, pourquoi. */
export function describeWaiver(waiver: Waiver, locale: Locale): string {
  const jusqua = waiver.expiresAt ? formatDayAndHour(waiver.expiresAt, locale) : '—';
  return t(locale, 'waiver.granted', {
    by: waiver.grantedBy ?? waiver.requestedBy,
    until: jusqua,
    reason: waiver.reason,
  });
}

/** Phrase d'expiration, pour le message de blocage. */
export function describeExpiry(waiver: Waiver, locale: Locale): string {
  return t(locale, 'waiver.expired', {
    until: waiver.expiresAt ? formatDayAndHour(waiver.expiresAt, locale) : '—',
  });
}

/**
 * Raison lisible d'un contrôle qui échoue alors qu'une dérogation couvrait la
 * règle : elle a expiré entre l'accord et la fusion (§17, cas 5). Le niveau
 * suit celui de la règle concernée (par défaut : bloquant).
 */
export function expiryReason(waiver: Waiver, locale: Locale, level: Level = 'blocking'): Reason {
  return { rule: waiver.rule, level, text: describeExpiry(waiver, locale) };
}
