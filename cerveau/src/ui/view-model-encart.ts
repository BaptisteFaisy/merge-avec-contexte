/**
 * Écran 5 — encart sur le ticket (§12, écran 5).
 *
 * PR connues du ticket, dernière évaluation, raisons avec la marche à suivre et
 * dérogations encore en cours. Module **pur** : aucune dépendance Forge.
 */
import { formatEvaluation, visibleReasons } from '../shared/message/format';
import { t } from '../shared/message/strings';
import { RULE_CODES, descriptorFor } from '../shared/rules/catalog';
import { formatDayAndHour } from '../shared/time/moment';
import type { Evaluation, Level, Locale, RuleCode, RuleConfig, Verdict, Waiver } from '../shared/types';
import { libelleVerdict, raisonsSimples, texte } from './view-model-commun';
import type { VueRaison } from './view-model-commun';

export interface PrEvaluee {
  prId: number;
  depot: string;
  evaluation: Evaluation;
}

export interface EntreeEncart {
  locale: Locale;
  prs?: PrEvaluee[];
  waivers?: Waiver[];
  /** Réglages enregistrés ; une règle absente prend le niveau du catalogue. */
  configs?: RuleConfig[];
  /** Instant injecté : décide quelles dérogations sont encore en cours. */
  maintenant?: string;
}

export interface VuePr {
  prId: number;
  depot: string;
  verdict: Verdict;
  verdictLabel: string;
  /** Le message exact du contrôle Bitbucket (§9). */
  message: string;
  evaluatedAt: string;
  reasons: VueRaison[];
}

export interface VueDerogation {
  rule: RuleCode;
  grantedBy: string;
  reason: string;
  expiresLabel: string;
}

/** Une règle pour laquelle l'encart propose de demander une dérogation. */
export interface RegleDerogable {
  code: RuleCode;
  titre: string;
  niveau: Level;
}

export interface VueEncart {
  prs: VuePr[];
  /** PR évaluée le plus récemment, celle que l'encart met en avant. */
  derniere: VuePr | null;
  derogations: VueDerogation[];
  /** Règles dont le niveau peut peser sur le verdict : bloquant ou avertissement. */
  reglesDerogables: RegleDerogable[];
}

/** Une PR et son évaluation, telle que l'encart la montre. */
function vuePr(pr: PrEvaluee, locale: Locale): VuePr {
  return {
    prId: pr.prId,
    depot: pr.depot,
    verdict: pr.evaluation.verdict,
    verdictLabel: libelleVerdict(locale, pr.evaluation.verdict),
    message: formatEvaluation(pr.evaluation, { locale }),
    evaluatedAt: pr.evaluation.evaluatedAt,
    reasons: raisonsSimples(visibleReasons(pr.evaluation)),
  };
}

/** La PR dont l'évaluation est la plus récente. */
function plusRecente(vues: VuePr[]): VuePr | null {
  return vues.reduce<VuePr | null>((meilleure, vue) => {
    if (!meilleure) return vue;
    return Date.parse(vue.evaluatedAt) >= Date.parse(meilleure.evaluatedAt) ? vue : meilleure;
  }, null);
}

/** Dérogations accordées et encore en vigueur. */
function derogationsEnCours(waivers: Waiver[], locale: Locale, maintenant?: string): VueDerogation[] {
  const instant = maintenant ? Date.parse(maintenant) : Number.POSITIVE_INFINITY;
  return waivers
    .filter((waiver) => waiver.status === 'granted')
    .filter((waiver) => !waiver.expiresAt || Date.parse(waiver.expiresAt) > instant)
    .map((waiver) => ({
      rule: waiver.rule,
      grantedBy: waiver.grantedBy ?? waiver.requestedBy,
      reason: waiver.reason,
      expiresLabel: waiver.expiresAt
        ? formatDayAndHour(waiver.expiresAt, locale)
        : texte(locale, 'derogation.sansEcheance'),
    }));
}

/** Règles dérogables : celles dont le niveau (réglé ou par défaut) pèse sur le verdict. */
function reglesDerogables(configs: RuleConfig[] | undefined, locale: Locale): RegleDerogable[] {
  const parCode = new Map((configs ?? []).map((config) => [config.rule, config]));
  return RULE_CODES.map((code) => {
    const niveau = parCode.get(code)?.level ?? descriptorFor(code).defaultLevel;
    return { code, niveau, titre: t(locale, descriptorFor(code).titleKey) };
  }).filter((regle) => regle.niveau !== 'information');
}

/** Écran 5 — encart sur le ticket : PR connues, dernière évaluation, dérogations. */
export function vmEncart(entree: EntreeEncart): VueEncart {
  const vues = (entree.prs ?? []).map((pr) => vuePr(pr, entree.locale));
  return {
    prs: vues,
    derniere: plusRecente(vues),
    derogations: derogationsEnCours(entree.waivers ?? [], entree.locale, entree.maintenant),
    reglesDerogables: reglesDerogables(entree.configs, entree.locale),
  };
}
