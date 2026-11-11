/**
 * Action `list-waivers` (§11) : dérogations en cours pour un ticket.
 *
 * Les dérogations accordées dont l'échéance est passée sont marquées
 * `expired` avant l'affichage (`expireStale`) : un agent ne doit jamais
 * croire qu'une dérogation morte protège encore la fusion.
 */
import { expireStale, formatDayAndHour } from '../shared';
import type { Locale, RuleCode, Waiver, WaiverStatus } from '../shared';
import { cleTicket } from './deps';
import type { RovoDeps } from './deps';

/** Une dérogation mise à plat pour la sortie JSON. */
export interface DerogationSortie {
  rule: RuleCode;
  status: WaiverStatus;
  grantedBy: string | null;
  reason: string;
  expiresAt: string | null;
  /** Échéance déjà rédigée ; `null` si la dérogation n'en porte pas. */
  expiresLabel: string | null;
}

/** Sortie de l'action. */
export interface ListWaiversOutput {
  issueKey: string;
  waivers: DerogationSortie[];
}

/** Dérogations encore vivantes : demandées ou accordées. */
const EN_COURS: WaiverStatus[] = ['requested', 'granted'];

/** Une dérogation du contrat, mise à la forme publique. */
export function derogationSortie(waiver: Waiver, locale: Locale): DerogationSortie {
  return {
    rule: waiver.rule,
    status: waiver.status,
    grantedBy: waiver.grantedBy ?? null,
    reason: waiver.reason,
    expiresAt: waiver.expiresAt ?? null,
    expiresLabel: waiver.expiresAt ? formatDayAndHour(waiver.expiresAt, locale) : null,
  };
}

/** Les dérogations en cours, l'échéance la plus proche d'abord. */
export function enCours(waivers: Waiver[], now: string): Waiver[] {
  return expireStale(waivers, now)
    .filter((waiver) => EN_COURS.includes(waiver.status))
    .sort((a, b) => Date.parse(a.expiresAt ?? '') - Date.parse(b.expiresAt ?? ''));
}

/** Action `list-waivers` : entrée `issueKey`. */
export async function runListWaivers(
  deps: RovoDeps,
  payload: Record<string, unknown>,
): Promise<ListWaiversOutput> {
  const locale = deps.locale;
  const issueKey = cleTicket(payload.issueKey, locale);
  const now = deps.clock.now();
  const waivers = enCours(await deps.waivers.listByIssue(issueKey), now).map((waiver) =>
    derogationSortie(waiver, locale),
  );
  deps.logger.info('list-waivers', { issueKey, count: waivers.length });
  return { issueKey, waivers };
}
