/**
 * Gels de déploiement (§8, R-04 et §14) : une période pendant laquelle
 * certaines branches ou certains services ne reçoivent pas de fusion.
 *
 * Un gel peut être ponctuel ou récurrent (quotidien, hebdomadaire) ; la
 * fenêtre récurrente est exprimée en heures locales du fuseau du gel.
 */
import { globMatchAny } from '../match/glob';
import { formatDayAndHour, localParts } from '../time/moment';
import type { Freeze, Locale } from '../types';

export interface FreezeContext {
  targetBranch: string;
  /** Service alimenté par le dépôt, quand il est connu. */
  service?: string;
  now: string;
}

/** Vrai si le gel couvre la branche (et le service) visés. */
function couvre(freeze: Freeze, ctx: FreezeContext): boolean {
  if (!globMatchAny(freeze.branches, ctx.targetBranch)) return false;
  if (freeze.services.length === 0) return true;
  return ctx.service !== undefined && freeze.services.includes(ctx.service);
}

/** Vrai si l'instant tombe dans la fenêtre récurrente locale du gel. */
function dansRecurrence(freeze: Freeze, now: string): boolean {
  const fuseau = freeze.timezone ?? 'UTC';
  const instant = localParts(now, fuseau);
  const debut = localParts(freeze.startsAt, fuseau);
  const fin = localParts(freeze.endsAt, fuseau);
  if (!instant || !debut || !fin) return false;
  if (instant.date < debut.date || instant.date > fin.date) return false;
  if (freeze.recurrence.kind === 'weekly' && !freeze.recurrence.daysOfWeek.includes(instant.weekday)) {
    return false;
  }
  if (debut.minutes <= fin.minutes) {
    return instant.minutes >= debut.minutes && instant.minutes < fin.minutes;
  }
  return instant.minutes >= debut.minutes || instant.minutes < fin.minutes;
}

/** Vrai si le gel est actif pour ce contexte. */
export function freezeApplies(freeze: Freeze, ctx: FreezeContext): boolean {
  if (!couvre(freeze, ctx)) return false;
  if (freeze.recurrence.kind !== 'none') return dansRecurrence(freeze, ctx.now);
  const instant = Date.parse(ctx.now);
  const debut = Date.parse(freeze.startsAt);
  const fin = Date.parse(freeze.endsAt);
  if (!Number.isFinite(instant) || !Number.isFinite(debut) || !Number.isFinite(fin)) return false;
  return instant >= debut && instant < fin;
}

/** Gels actifs à cet instant, les plus récents d'abord. */
export function activeFreezes(freezes: Freeze[], ctx: FreezeContext): Freeze[] {
  return freezes
    .filter((freeze) => freezeApplies(freeze, ctx))
    .sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt));
}

/** Fin de gel lisible pour le message de blocage. */
export function describeFreezeEnd(freeze: Freeze, locale: Locale): string {
  return formatDayAndHour(freeze.endsAt, locale, freeze.timezone ?? 'UTC');
}
