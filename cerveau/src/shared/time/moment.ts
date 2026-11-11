/**
 * Lecture d'un instant dans un fuseau donné, sans dépendance externe.
 *
 * Les gels récurrents et les dérogations s'expriment en heures locales : on
 * lit donc les composantes locales avec `Intl`, qui connaît les fuseaux IANA,
 * plutôt que de manipuler des décalages à la main.
 */
import type { Locale } from '../types';

export interface LocalParts {
  /** Date locale `AAAA-MM-JJ` (comparable lexicographiquement). */
  date: string;
  /** Minutes écoulées depuis minuit, dans le fuseau. */
  minutes: number;
  /** Jour de la semaine, 0 = dimanche. */
  weekday: number;
}

const JOURS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MOIS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Composantes locales d'un instant ISO ; `undefined` si l'instant est illisible. */
export function localParts(iso: string, timeZone: string): LocalParts | undefined {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  const formateur = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const champs: Record<string, string> = {};
  for (const partie of formateur.formatToParts(date)) champs[partie.type] = partie.value;
  const heure = Number(champs.hour) % 24;
  const minute = Number(champs.minute);
  return {
    date: `${champs.year}-${champs.month}-${champs.day}`,
    minutes: heure * 60 + minute,
    weekday: Math.max(0, JOURS.indexOf(champs.weekday ?? '')),
  };
}

/** Jour et heure lisibles : « 30/11 à 9 h » (fr) ou « 30 Nov, 09:00 » (en). */
export function formatDayAndHour(iso: string, locale: Locale, timeZone = 'UTC'): string {
  const parts = localParts(iso, timeZone);
  if (!parts) return iso;
  const [, mois, jour] = parts.date.split('-');
  const heure = Math.floor(parts.minutes / 60);
  const minute = parts.minutes % 60;
  const minutesTexte = minute === 0 ? '' : ` ${String(minute).padStart(2, '0')}`;
  if (locale === 'fr') return `${jour}/${mois} à ${heure} h${minutesTexte}`;
  const moisTexte = MOIS[Number(mois) - 1] ?? mois;
  return `${Number(jour)} ${moisTexte}, ${String(heure).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
