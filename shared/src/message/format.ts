/**
 * Le message affiché par Bitbucket (§9). Format imposé : le nombre de raisons
 * d'abord, puis une ligne par raison, la plus grave en premier, et le renvoi
 * vers la carte. Jamais de jargon interne.
 */
import type { Evaluation, Level, Locale, Reason, RuleCode } from '../types';
import { t } from './strings';
import { RULE_CODES } from '../rules/catalog';

export interface FormatOptions {
  locale?: Locale;
  /** Raisons listées au plus ; le reste est renvoyé vers la carte. */
  maxReasons?: number;
  /** Longueur cible du texte (la doc Bitbucket ne la précise pas : §15). */
  maxChars?: number;
  /** Ajoute la marche à suivre après chaque raison (absent du format imposé). */
  includeActions?: boolean;
}

const GRAVITE: Record<Level, number> = { blocking: 0, warning: 1, information: 2 };
const MAX_RAISONS_DEFAUT = 4;
const MAX_CHARS_DEFAUT = 900;

/** Ordre du catalogue, pour départager deux raisons de même gravité. */
function rangRegle(code: RuleCode): number {
  return RULE_CODES.indexOf(code);
}

/** La plus grave d'abord, puis l'ordre du catalogue. */
export function compareReasons(a: Reason, b: Reason): number {
  const gravite = GRAVITE[a.level] - GRAVITE[b.level];
  return gravite !== 0 ? gravite : rangRegle(a.rule) - rangRegle(b.rule);
}

/** Raisons affichables : ni journalisées en observation, ni couvertes par une dérogation. */
export function visibleReasons(evaluation: Evaluation): Reason[] {
  return evaluation.reasons
    .filter((raison) => !raison.observed && !raison.waived)
    .sort(compareReasons);
}

/** Raisons qui bloquent réellement la fusion. */
export function blockingReasons(evaluation: Evaluation): Reason[] {
  return visibleReasons(evaluation).filter((raison) => raison.level === 'blocking');
}

/** Une ligne de raison : `1) texte` (+ marche à suivre si demandée). */
function ligne(raison: Reason, index: number, includeActions: boolean): string {
  const texte = includeActions && raison.action ? `${raison.text} ${raison.action}` : raison.text;
  return `${index + 1}) ${texte}`;
}

/** En-tête du message, selon le verdict et le nombre de raisons. */
function entete(locale: Locale, evaluation: Evaluation, raisons: Reason[], count: number): string {
  if (evaluation.verdict === 'blocked') {
    return count === 1
      ? t(locale, 'verdict.blocked.one')
      : t(locale, 'verdict.blocked.many', { count });
  }
  if (count === 0) return t(locale, 'verdict.allowed');
  if (count === 1) {
    return t(locale, 'verdict.allowed.one', { text: raisons[0]?.text ?? '' });
  }
  return t(locale, 'verdict.allowed.many', { count });
}

/** Corps complet pour un nombre de raisons affichées donné. */
function composer(
  locale: Locale,
  evaluation: Evaluation,
  raisons: Reason[],
  affichees: number,
  includeActions: boolean,
): string {
  const count = raisons.length;
  const lignes = [entete(locale, evaluation, raisons, count)];
  const dejaUneLigne = count === 1 && evaluation.verdict !== 'blocked';
  if (!dejaUneLigne) {
    raisons.slice(0, affichees).forEach((raison, index) => lignes.push(ligne(raison, index, includeActions)));
    if (count > affichees) lignes.push(t(locale, 'verdict.more', { count: count - affichees }));
  }
  lignes.push(t(locale, 'verdict.card'));
  return lignes.join('\n');
}

/** Message de repli : contexte indisponible, puis la politique choisie. */
function repli(locale: Locale, evaluation: Evaluation): string {
  const politique = evaluation.fallback === 'closed' ? 'verdict.fallback.closed' : 'verdict.fallback.open';
  return [t(locale, 'verdict.inconclusive'), t(locale, politique), t(locale, 'verdict.card')].join('\n');
}

/** Rend le message d'une évaluation, en respectant la longueur cible. */
export function formatEvaluation(evaluation: Evaluation, options: FormatOptions = {}): string {
  const locale = options.locale ?? 'fr';
  const includeActions = options.includeActions ?? false;
  const maxChars = options.maxChars ?? MAX_CHARS_DEFAUT;
  if (evaluation.verdict === 'inconclusive') return repli(locale, evaluation);
  const raisons = evaluation.verdict === 'blocked'
    ? blockingReasons(evaluation)
    : visibleReasons(evaluation).filter((raison) => raison.level !== 'blocking');
  let affichees = Math.min(options.maxReasons ?? MAX_RAISONS_DEFAUT, Math.max(raisons.length, 1));
  let message = composer(locale, evaluation, raisons, affichees, includeActions);
  while (message.length > maxChars && affichees > 1) {
    affichees -= 1;
    message = composer(locale, evaluation, raisons, affichees, includeActions);
  }
  return message;
}
