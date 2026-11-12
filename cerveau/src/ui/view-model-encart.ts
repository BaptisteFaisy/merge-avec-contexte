/**
 * Écran 5 — encart sur le ticket (§12, écran 5).
 *
 * PR connues du ticket, dernière évaluation, raisons avec la marche à suivre,
 * dérogations encore en cours, demandes à trancher et décisions closes.
 * L'annuaire des approbateurs dit qui peut décider : une personne qui n'y figure
 * pas voit les boutons désactivés, et pourquoi (§7.1 étape 6, MC-07).
 *
 * Module **pur** : aucune dépendance Forge, aucune lecture d'heure.
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
  /** Annuaire des approbateurs (écran 4) : il dit qui peut décider. */
  approbateurs?: string[];
  /** Identité de la personne qui regarde l'encart, vide si l'écran l'ignore. */
  utilisateur?: string;
  /**
   * Item 101 : aucune évaluation n'a encore eu lieu sur l'installation. Quand
   * c'est vrai, l'encart affiche l'écran d'accueil (onboarding) au lieu du vide.
   * Le resolver la calcule depuis le port de stockage ; le modèle ne fait que la
   * reporter, ce qui le rend testable sans plateforme.
   */
  premierUsage?: boolean;
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

/** Une dérogation déjà close : refusée, ou accordée puis arrivée à échéance. */
export type StatutDecision = 'refused' | 'expired';

/** Pourquoi les boutons « Accorder » / « Refuser » sont désactivés. */
export type MotifDecision = 'annuaire-vide' | 'non-approbateur';

/** Une demande en attente : ce qu'un approbateur doit trancher (§7.1, MC-07). */
export interface VueDemande {
  id: string;
  rule: RuleCode;
  titre: string;
  requestedBy: string;
  reason: string;
  requestedAtLabel: string;
  /** Durée demandée, bornée de 1 à 72 h : proposition par défaut de l'accord. */
  heuresDemandees: number;
}

/** Une décision prise : qui a tranché, jusqu'à quand, et pourquoi. */
export interface VueDecision {
  id: string;
  rule: RuleCode;
  statut: StatutDecision;
  decidedBy: string;
  reason: string;
  /** Échéance de l'accord expiré ; `null` pour un refus. */
  expiresLabel: string | null;
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
  /** Demandes en attente d'un approbateur : l'encart y met les boutons. */
  demandes: VueDemande[];
  /** Décisions closes : refus, et accords arrivés à échéance. */
  decisions: VueDecision[];
  /** Annuaire des approbateurs : qui peut décider. */
  approbateurs: string[];
  /** La personne qui regarde peut-elle trancher ? */
  peutDecider: boolean;
  /** Motif de l'interdiction de trancher, `null` quand c'est possible. */
  motif: MotifDecision | null;
  /** Item 101 : vrai tant qu'aucune évaluation n'a eu lieu — l'écran d'accueil s'affiche. */
  onboarding: boolean;
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

/** Durée demandée, en heures bornées : sert de proposition à l'accord. */
function heuresDemandees(waiver: Waiver): number {
  if (!waiver.expiresAt) return 2;
  const heures = Math.round((Date.parse(waiver.expiresAt) - Date.parse(waiver.requestedAt)) / 3_600_000);
  return Math.min(Math.max(heures, 1), 72);
}

/** Demandes en attente : ce que l'approbateur peut accorder ou refuser. */
function demandes(waivers: Waiver[], locale: Locale): VueDemande[] {
  return waivers
    .filter((waiver) => waiver.status === 'requested')
    .map((waiver) => ({
      id: waiver.id,
      rule: waiver.rule,
      titre: t(locale, descriptorFor(waiver.rule).titleKey),
      requestedBy: waiver.requestedBy,
      reason: waiver.reason,
      requestedAtLabel: formatDayAndHour(waiver.requestedAt, locale),
      heuresDemandees: heuresDemandees(waiver),
    }));
}

/** Une décision est-elle close ? Refus, ou accord dont l'échéance est passée. */
function close(waiver: Waiver, instant: number): boolean {
  if (waiver.status === 'refused' || waiver.status === 'expired') return true;
  return waiver.status === 'granted' && waiver.expiresAt !== undefined && Date.parse(waiver.expiresAt) <= instant;
}

/** Décisions closes : qui a tranché, jusqu'à quand, et pourquoi. */
function decisions(waivers: Waiver[], locale: Locale, maintenant?: string): VueDecision[] {
  const instant = maintenant ? Date.parse(maintenant) : Number.POSITIVE_INFINITY;
  return waivers
    .filter((waiver) => close(waiver, instant))
    .map((waiver) => ({
      id: waiver.id,
      rule: waiver.rule,
      statut: (waiver.status === 'refused' ? 'refused' : 'expired') as StatutDecision,
      decidedBy: waiver.grantedBy ?? waiver.requestedBy,
      reason: waiver.reason,
      expiresLabel:
        waiver.status === 'refused' || !waiver.expiresAt ? null : formatDayAndHour(waiver.expiresAt, locale),
    }));
}

/** Droit de décider : l'annuaire des approbateurs fait foi (§12, écran 4). */
function droitDeDecider(annuaire: string[], utilisateur: string | undefined): { peutDecider: boolean; motif: MotifDecision | null } {
  if (annuaire.length === 0) return { peutDecider: false, motif: 'annuaire-vide' };
  const habilite = utilisateur !== undefined && annuaire.includes(utilisateur);
  return habilite ? { peutDecider: true, motif: null } : { peutDecider: false, motif: 'non-approbateur' };
}

/** Règles dérogables : celles dont le niveau (réglé ou par défaut) pèse sur le verdict. */function reglesDerogables(configs: RuleConfig[] | undefined, locale: Locale): RegleDerogable[] {
  const parCode = new Map((configs ?? []).map((config) => [config.rule, config]));
  return RULE_CODES.map((code) => {
    const niveau = parCode.get(code)?.level ?? descriptorFor(code).defaultLevel;
    return { code, niveau, titre: t(locale, descriptorFor(code).titleKey) };
  }).filter((regle) => regle.niveau !== 'information');
}

/** Écran 5 — encart sur le ticket : PR connues, dernière évaluation, dérogations. */
export function vmEncart(entree: EntreeEncart): VueEncart {
  const vues = (entree.prs ?? []).map((pr) => vuePr(pr, entree.locale));
  const waivers = entree.waivers ?? [];
  const annuaire = [...(entree.approbateurs ?? [])];
  const droit = droitDeDecider(annuaire, entree.utilisateur);
  return {
    prs: vues,
    derniere: plusRecente(vues),
    derogations: derogationsEnCours(waivers, entree.locale, entree.maintenant),
    reglesDerogables: reglesDerogables(entree.configs, entree.locale),
    demandes: demandes(waivers, entree.locale),
    decisions: decisions(waivers, entree.locale, entree.maintenant),
    approbateurs: annuaire,
    peutDecider: droit.peutDecider,
    motif: droit.motif,
    onboarding: Boolean(entree.premierUsage),
  };
}
