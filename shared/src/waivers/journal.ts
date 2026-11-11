/**
 * Les dérogations du journal (§12, écran 7) : ce qu'une ligne de dérogation
 * affiche, déjà rédigé dans le contrat. L'écran ne fait que rendre ces lignes,
 * il ne recompose ni phrase ni portée.
 */
import type { JournalWaiver, JournalWaivers, Locale, Waiver } from '../types';
import { describeExpiry, describeWaiver } from './resolve';

/** Phrase déjà rédigée d'une ligne, selon le statut de la dérogation. */
function trace(waiver: Waiver, locale: Locale): string {
  if (waiver.status === 'granted') return describeWaiver(waiver, locale);
  if (waiver.status === 'expired') return describeExpiry(waiver, locale);
  return waiver.reason;
}

/** Une dérogation comme ligne du journal. */
export function journalWaiver(waiver: Waiver, locale: Locale): JournalWaiver {
  return {
    id: waiver.id,
    rule: waiver.rule,
    status: waiver.status,
    prId: waiver.prId,
    repositoryUuid: waiver.repositoryUuid,
    issueKeys: waiver.issueKeys ?? [],
    requestedBy: waiver.requestedBy,
    grantedBy: waiver.grantedBy,
    reason: waiver.reason,
    requestedAt: waiver.requestedAt,
    expiresAt: waiver.expiresAt,
    text: trace(waiver, locale),
  };
}

/** Les dérogations d'une entrée du journal, les plus récentes d'abord. */
export function journalWaivers(evaluationId: string, waivers: Waiver[], locale: Locale): JournalWaivers {
  const tries = [...waivers].sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt));
  return { evaluationId, waivers: tries.map((waiver) => journalWaiver(waiver, locale)) };
}
