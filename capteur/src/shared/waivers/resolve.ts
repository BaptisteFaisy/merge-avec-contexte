/**
 * Dérogations (§7.1, MC-07) : une exception accordée à une PR, pour une règle,
 * par une personne habilitée, avec motif et durée. Une dérogation expirée ne
 * protège plus rien : le contrôle échoue et le dit.
 */
import { t } from '../message/strings';
import { formatDayAndHour } from '../time/moment';
import type { Locale, RuleCode, Waiver } from '../types';

export interface WaiverContext {
  prId: number;
  repositoryUuid: string;
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

/** Vrai si la dérogation s'applique à cette PR, maintenant. */
export function isEffective(waiver: Waiver, ctx: WaiverContext): boolean {
  if (waiver.status !== 'granted') return false;
  if (waiver.prId !== ctx.prId || waiver.repositoryUuid !== ctx.repositoryUuid) return false;
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
