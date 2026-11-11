/**
 * Action `list-freezes` (§11) : gels de déploiement en cours et à venir.
 *
 * Les gels viennent du calendrier du Cerveau (`freeze`, §14) ; l'action les
 * met à plat, ajoute la fin lisible et les trie par début, pour qu'un agent
 * puisse répondre « quels gels cette semaine ? ».
 */
import { formatDayAndHour } from '../shared';
import type { Freeze, Locale, Recurrence } from '../shared';
import { texte } from './deps';
import type { RovoDeps } from './deps';

/** Un gel mis à plat pour la sortie JSON : jamais d'`undefined`. */
export interface GelSortie {
  name: string;
  branches: string[];
  services: string[];
  startsAt: string;
  endsAt: string;
  /** Fin déjà rédigée, dans la langue de l'espace de travail. */
  endsLabel: string;
  recurrence: Recurrence;
}

/** Sortie de l'action. */
export interface ListFreezesOutput {
  now: string;
  freezes: GelSortie[];
}

/** Horizon par défaut, en jours (§11 : « gels en cours et à venir »). */
export const HORIZON_DEFAUT = 7;
const HORIZON_MIN = 1;
const HORIZON_MAX = 365;

/** Horizon demandé, borné à [1, 365] ; valeur absente ou illisible = défaut. */
export function horizon(valeur: unknown): number {
  const brut = texte(valeur);
  if (typeof valeur === 'number') return borner(valeur);
  if (brut === '') return HORIZON_DEFAUT;
  const nombre = Number(brut);
  return Number.isFinite(nombre) ? borner(nombre) : HORIZON_DEFAUT;
}

/** Ramène un horizon dans ses bornes, en jours entiers. */
function borner(nombre: number): number {
  if (!Number.isFinite(nombre)) return HORIZON_DEFAUT;
  return Math.min(HORIZON_MAX, Math.max(HORIZON_MIN, Math.round(nombre)));
}

/** Fuseau du gel, UTC par défaut (contrat `Freeze.timezone`). */
function fuseau(freeze: Freeze): string {
  return freeze.timezone ?? 'UTC';
}

/** Un gel du contrat, mis à la forme publique. */
export function gelSortie(freeze: Freeze, locale: Locale): GelSortie {
  return {
    name: freeze.name,
    branches: [...freeze.branches],
    services: [...freeze.services],
    startsAt: freeze.startsAt,
    endsAt: freeze.endsAt,
    endsLabel: formatDayAndHour(freeze.endsAt, locale, fuseau(freeze)),
    recurrence: freeze.recurrence,
  };
}

/** Union actifs + à venir, sans doublon, triée par début. */
export function fusionnerGels(actifs: Freeze[], aVenir: Freeze[]): Freeze[] {
  const parId = new Map<string, Freeze>();
  for (const freeze of [...actifs, ...aVenir]) {
    if (!parId.has(freeze.id)) parId.set(freeze.id, freeze);
  }
  return [...parId.values()].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

/** Action `list-freezes` : entrée `days` (défaut 7). */
export async function runListFreezes(
  deps: RovoDeps,
  payload: Record<string, unknown>,
): Promise<ListFreezesOutput> {
  const now = deps.clock.now();
  const days = horizon(payload.days);
  const [actifs, aVenir] = await Promise.all([
    deps.freezes.active(now),
    deps.freezes.upcoming(now, days),
  ]);
  const freezes = fusionnerGels(actifs, aVenir).map((freeze) => gelSortie(freeze, deps.locale));
  deps.logger.info('list-freezes', { days, count: freezes.length });
  return { now, freezes };
}
