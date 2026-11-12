/**
 * Écran 7 — journal (§12, écran 7).
 *
 * L'écran rend : les évaluations horodatées avec l'identifiant de corrélation
 * qui les relie aux lignes de `forge logs` (item 60) ; les volumes par verdict
 * et les durées — moyenne, **P95**, maximum, ce que le §16 exige de mesurer et
 * d'afficher (item 8) ; les blocages par règle, par service, et le délai de
 * déblocage d'une PR (§10 MC-16, item 13) ; les dérogations de la fenêtre — qui,
 * quoi, quand, pourquoi, échéance, statut (§12 écran 7, item 12) et leurs
 * comptages ; le rapport d'observation « ce qui aurait été bloqué » (§7.3,
 * MC-13) sur une **fenêtre configurable** (item 21) ; et `texteRapport`, le
 * rapport produit à la demande (item 22). « Par équipe » n'est pas modélisable
 * sans Teamwork Graph : les chiffres sont agrégés par **service**, via la
 * correspondance dépôt → service déjà en place.
 *
 * Module **pur** : aucune dépendance Forge, aucune lecture d'heure — les bornes
 * de la fenêtre sont fournies par l'appelant.
 */
import { t } from '../shared/message/strings';
import { descriptorFor } from '../shared/rules/catalog';
import { formatDayAndHour } from '../shared/time/moment';
import type { Evaluation, Locale, RuleCode, Verdict, Waiver, WaiverStatus } from '../shared/types';
// Le calcul pur du P95 vit avec le contrat de `EvaluationStats` : une seule
// définition, partagée par le port de stockage et par l'écran.
import { dureeMaximale, percentileDurees } from '../storage/ports';
import { libelleVerdict, raisonsSimples, texte } from './view-model-commun';
import type { VueRaison } from './view-model-commun';

interface Traduction {
  fr: string;
  en: string;
}

/** Libellés propres au journal : le dictionnaire des écrans n'a pas ces clés. */
const TEXTES = {
  'statut.requested': { fr: 'Demandée', en: 'Requested' },
  'statut.granted': { fr: 'Accordée', en: 'Granted' },
  'statut.refused': { fr: 'Refusée', en: 'Refused' },
  'statut.expired': { fr: 'Expirée', en: 'Expired' },
  'service.inconnu': { fr: 'Service inconnu', en: 'Unknown service' },
  'rapport.titre': { fr: 'Rapport d’observation', en: 'Observation report' },
  'rapport.fenetre': { fr: 'Fenêtre', en: 'Window' },
  'rapport.total': { fr: 'Évaluations', en: 'Evaluations' },
  'rapport.allowed': { fr: 'autorisées', en: 'allowed' },
  'rapport.blocked': { fr: 'bloquées', en: 'blocked' },
  'rapport.inconclusive': { fr: 'non concluantes', en: 'inconclusive' },
  'rapport.durees': { fr: 'Durées (ms)', en: 'Durations (ms)' },
  'rapport.moyenne': { fr: 'moyenne', en: 'average' },
  'rapport.p95': { fr: 'P95', en: 'P95' },
  'rapport.max': { fr: 'maximum', en: 'max' },
  'rapport.observation': { fr: 'Observation', en: 'Observation' },
  'rapport.wouldHaveBlocked': { fr: 'auraient été bloquées', en: 'would have been blocked' },
  'rapport.parRegle': { fr: 'Blocages par règle', en: 'Blocks by rule' },
  'rapport.parService': { fr: 'Blocages par service', en: 'Blocks by service' },
  'rapport.derogations': { fr: 'Dérogations', en: 'Waivers' },
  'rapport.demandees': { fr: 'demandées', en: 'requested' },
  'rapport.accordees': { fr: 'accordées', en: 'granted' },
  'rapport.refusees': { fr: 'refusées', en: 'refused' },
  'rapport.enAttente': { fr: 'en attente', en: 'pending' },
  'rapport.deblocage': { fr: 'Délai de déblocage', en: 'Unlock delay' },
  'rapport.mediane': { fr: 'médiane', en: 'median' },
  'rapport.prsBloquees': { fr: 'PR encore bloquées', en: 'PRs still blocked' },
  'rapport.rien': { fr: 'aucune', en: 'none' },
} satisfies Record<string, Traduction>;

/** Fenêtre par défaut du rapport d'observation (§7.3 : trente jours). */
export const FENETRE_DEFAUT_JOURS = 30;
/** Fenêtre maximale : un an, au-delà le rapport n'a plus de sens. */
export const FENETRE_MAX_JOURS = 365;
/** Choix proposés par l'écran pour la fenêtre. */
const JOURS_PROPOSES = [7, 30, 90, 365];

/** Rend un libellé de ce module. */
function libelle(locale: Locale, cle: keyof typeof TEXTES): string {
  return TEXTES[cle][locale];
}

export interface EvaluationJournalisee {
  depot: string;
  prId: number;
  evaluation: Evaluation;
  /** Service alimenté par le dépôt, quand la correspondance est connue (item 13). */
  service?: string;
  /** Identifiant de corrélation : relie la ligne du journal aux logs (item 60). */
  correlationId?: string;
}

/** Une dérogation de la fenêtre, avec le service de son dépôt (item 13). */
export interface DerogationJournalisee extends Waiver {
  /** Service du dépôt visé, pour les chiffres « par équipe » du §10 (item 13). */
  service?: string;
}

export interface Observation {
  observed: number;
  wouldHaveBlocked: number;
  byRepository?: Array<{ depot: string; bloquees: number }>;
}

export interface EntreeJournal {
  locale: Locale;
  evaluations?: EvaluationJournalisee[];
  derogations?: DerogationJournalisee[];
  observation?: Observation;
  /** Fenêtre du rapport en jours ; défaut 30 (§7.3), bornée de 1 à 365 (item 21). */
  fenetreJours?: number;
  /** Début de la fenêtre, calculé par l'appelant (ce module ne lit pas l'heure). */
  depuis?: string;
  /** Fin de la fenêtre, calculée par l'appelant. */
  jusquA?: string;
}

export interface VueLigneJournal {
  evaluatedAt: string;
  depot: string;
  prId: number;
  verdict: Verdict;
  verdictLabel: string;
  durationMs: number;
  reasons: VueRaison[];
  /** Service du dépôt, quand il est connu (item 13). */
  service: string | null;
  /** Identifiant de corrélation de l'évaluation (item 60). */
  correlationId: string | null;
}

export interface VueStatistiques {
  total: number;
  allowed: number;
  blocked: number;
  inconclusive: number;
  /** Durée moyenne d'une évaluation, en millisecondes (0 si le journal est vide). */
  averageDurationMs: number;
}

/** Les durées du §16 : moyenne déjà dans les statistiques, P95 et maximum ici. */
export interface VueDurees {
  /** 95e percentile des durées, en ms (§16 : « 95 % des évaluations sous 5 s »). */
  p95Ms: number;
  maxMs: number;
}

/** Une dérogation affichée au journal : qui, quoi, quand, pourquoi, statut (item 12). */
export interface VueDerogationLigne {
  id: string;
  depot: string;
  prId: number;
  regle: RuleCode;
  regleTitre: string;
  /** Qui a demandé, quand, et pourquoi. */
  qui: string;
  quand: string;
  pourquoi: string;
  /** Échéance de l'accord, ou « sans échéance ». */
  echeance: string;
  statut: WaiverStatus;
  statutLabel: string;
  /** Qui a tranché ; `null` tant que la demande n'est pas décidée. */
  decideur: string | null;
  service: string | null;
}

/** Les dérogations de la fenêtre et leurs comptages (items 12 et 13). */
export interface VueDerogations {
  demandees: number;
  accordees: number;
  refusees: number;
  enAttente: number;
  expirees: number;
  entrees: VueDerogationLigne[];
  parService: VueDerogationsService[];
}

/** Dérogations d'un service : demandées, accordées, refusées (item 13). */
export interface VueDerogationsService {
  service: string;
  demandees: number;
  accordees: number;
  refusees: number;
}

/** Une PR dont le délai de déblocage a pu être mesuré (item 13). */
export interface VueDelaiPr {
  depot: string;
  prId: number;
  service: string | null;
  bloqueeLe: string;
  autoriseeLe: string;
  delaiMs: number;
}

/** Le délai de déblocage : première évaluation bloquée → première autorisée. */
export interface VueDelaiDeblocage {
  prs: VueDelaiPr[];
  /** PR bloquées sans évaluation autorisée ensuite : délai non mesurable. */
  enAttente: number;
  medianMs: number;
  maxMs: number;
}

/** Les blocages : par règle, par service, et le délai de déblocage (item 13). */
export interface VueBlocages {
  parRegle: Array<{ regle: RuleCode; titre: string; bloquees: number }>;
  parService: VueChiffresService[];
  deblocage: VueDelaiDeblocage;
}

/** Chiffres d'un service : ce que le §10 MC-16 demande « par équipe » (item 13). */
export interface VueChiffresService {
  service: string;
  bloquees: number;
  derogations: number;
  delaiMedianMs: number;
}

/** La fenêtre du rapport : en jours, et ses bornes (item 21). */
export interface VueFenetre {
  jours: number;
  depuis: string | null;
  jusquA: string | null;
  /** Choix proposés à l'écran, la fenêtre courante comprise. */
  joursDisponibles: number[];
}

export interface VueRapportObservation {
  observed: number;
  wouldHaveBlocked: number;
  byRepository: Array<{ depot: string; bloquees: number }>;
}

export interface VueJournal {
  evaluations: VueLigneJournal[];
  statistiques: VueStatistiques;
  durees: VueDurees;
  blocages: VueBlocages;
  derogations: VueDerogations;
  fenetre: VueFenetre;
  rapport: VueRapportObservation;
}

/** Lignes du journal, la plus récente en tête. */
function lignesJournal(evaluations: EvaluationJournalisee[], locale: Locale): VueLigneJournal[] {
  return [...evaluations]
    .sort((a, b) => Date.parse(b.evaluation.evaluatedAt) - Date.parse(a.evaluation.evaluatedAt))
    .map((entree) => ({
      evaluatedAt: entree.evaluation.evaluatedAt,
      depot: entree.depot,
      prId: entree.prId,
      verdict: entree.evaluation.verdict,
      verdictLabel: libelleVerdict(locale, entree.evaluation.verdict),
      durationMs: entree.evaluation.durationMs,
      reasons: raisonsSimples(entree.evaluation.reasons),
      service: entree.service ?? null,
      correlationId: entree.correlationId ?? null,
    }));
}

/** Statistiques du journal : volume par verdict et durée moyenne. */
function statistiques(lignes: VueLigneJournal[]): VueStatistiques {
  const total = lignes.length;
  const durees = lignes.reduce((somme, ligne) => somme + ligne.durationMs, 0);
  return {
    total,
    allowed: lignes.filter((ligne) => ligne.verdict === 'allowed').length,
    blocked: lignes.filter((ligne) => ligne.verdict === 'blocked').length,
    inconclusive: lignes.filter((ligne) => ligne.verdict === 'inconclusive').length,
    averageDurationMs: total === 0 ? 0 : Math.round(durees / total),
  };
}

/** Les durées du §16 : P95 et maximum (item 8), calculés sur les lignes rendues. */
function vueDurees(lignes: VueLigneJournal[]): VueDurees {
  const durees = lignes.map((ligne) => ligne.durationMs);
  return { p95Ms: percentileDurees(durees, 95), maxMs: dureeMaximale(durees) };
}

/**
 * Règles qui bloquent le plus (item 13).
 *
 * Compte les évaluations **bloquées** dont une raison bloquante (non observée)
 * porte cette règle : une PR bloquée par deux règles compte une fois pour
 * chacune. Les plus bloquants en tête.
 */
function blocagesParRegle(
  evaluations: EvaluationJournalisee[],
  locale: Locale,
): Array<{ regle: RuleCode; titre: string; bloquees: number }> {
  const compte = new Map<RuleCode, number>();
  for (const { evaluation } of evaluations) {
    if (evaluation.verdict !== 'blocked') continue;
    const regles = new Set(
      evaluation.reasons
        .filter((raison) => raison.level === 'blocking' && raison.observed !== true)
        .map((raison) => raison.rule),
    );
    for (const regle of regles) compte.set(regle, (compte.get(regle) ?? 0) + 1);
  }
  return [...compte.entries()]
    .map(([regle, bloquees]) => ({ regle, titre: t(locale, descriptorFor(regle).titleKey), bloquees }))
    .sort((a, b) => b.bloquees - a.bloquees || a.regle.localeCompare(b.regle));
}

/**
 * Délai de déblocage (item 13) : entre la **première** évaluation bloquée d'une
 * PR et sa **première** évaluation autorisée ensuite. Une PR encore bloquée à
 * la fin de la fenêtre n'a pas de délai mesurable : elle est comptée à part.
 */
function delaisDeblocage(evaluations: EvaluationJournalisee[]): VueDelaiDeblocage {
  const parPr = new Map<string, EvaluationJournalisee[]>();
  for (const entree of evaluations) {
    const cle = `${entree.depot}\u0000${entree.prId}`;
    parPr.set(cle, [...(parPr.get(cle) ?? []), entree]);
  }
  const prs: VueDelaiPr[] = [];
  let enAttente = 0;
  for (const liste of parPr.values()) {
    const triees = [...liste].sort((a, b) => Date.parse(a.evaluation.evaluatedAt) - Date.parse(b.evaluation.evaluatedAt));
    const bloquee = triees.find((entree) => entree.evaluation.verdict === 'blocked');
    if (!bloquee) continue;
    const depart = Date.parse(bloquee.evaluation.evaluatedAt);
    const autorisee = triees.find((e) => e.evaluation.verdict === 'allowed' && Date.parse(e.evaluation.evaluatedAt) >= depart);
    if (!autorisee) {
      enAttente += 1; // PR encore bloquée à la fin de la fenêtre : délai non mesurable.
      continue;
    }
    const fin = Date.parse(autorisee.evaluation.evaluatedAt);
    prs.push({
      depot: bloquee.depot, prId: bloquee.prId, service: bloquee.service ?? null,
      bloqueeLe: bloquee.evaluation.evaluatedAt, autoriseeLe: autorisee.evaluation.evaluatedAt, delaiMs: fin - depart,
    });
  }
  const delais = prs.map((pr) => pr.delaiMs);
  return {
    prs: prs.sort((a, b) => b.delaiMs - a.delaiMs),
    enAttente,
    medianMs: percentileDurees(delais, 50),
    maxMs: dureeMaximale(delais),
  };
}

/** Nom affiché d'un service : le regroupement « inconnu » quand il manque. */
function nomService(service: string, locale: Locale): string {
  return service === '' ? libelle(locale, 'service.inconnu') : service;
}

/**
 * Blocages et dérogations par **service** (item 13). « Par équipe » supposerait
 * le Teamwork Graph ; la correspondance dépôt → service suffit à regrouper ce
 * qui est demandable aujourd'hui.
 */
function blocagesParService(
  evaluations: EvaluationJournalisee[],
  derogations: DerogationJournalisee[],
  deblocage: VueDelaiDeblocage,
  locale: Locale,
): VueChiffresService[] {
  const lignes = new Map<string, VueChiffresService>();
  const ligne = (service?: string): VueChiffresService => {
    const cle = service ?? '';
    if (!lignes.has(cle)) lignes.set(cle, { service: cle, bloquees: 0, derogations: 0, delaiMedianMs: 0 });
    return lignes.get(cle) as VueChiffresService;
  };
  for (const entree of evaluations) {
    if (entree.evaluation.verdict === 'blocked') ligne(entree.service).bloquees += 1;
  }
  for (const derogation of derogations) ligne(derogation.service).derogations += 1;
  const delais = new Map<string, number[]>();
  for (const pr of deblocage.prs) {
    const cle = pr.service ?? '';
    delais.set(cle, [...(delais.get(cle) ?? []), pr.delaiMs]);
  }
  for (const [cle, valeurs] of delais) ligne(cle).delaiMedianMs = percentileDurees(valeurs, 50);
  return [...lignes.values()]
    .map((entree) => ({ ...entree, service: nomService(entree.service, locale) }))
    .sort((a, b) => b.bloquees - a.bloquees || a.service.localeCompare(b.service));
}

/** Une dérogation, prête à afficher (item 12). */
function vueDerogation(derogation: DerogationJournalisee, locale: Locale): VueDerogationLigne {
  return {
    id: derogation.id, depot: derogation.repositoryUuid, prId: derogation.prId,
    regle: derogation.rule, regleTitre: t(locale, descriptorFor(derogation.rule).titleKey),
    qui: derogation.requestedBy, quand: derogation.requestedAt, pourquoi: derogation.reason,
    echeance: derogation.expiresAt ? formatDayAndHour(derogation.expiresAt, locale) : texte(locale, 'derogation.sansEcheance'),
    statut: derogation.status, statutLabel: libelle(locale, `statut.${derogation.status}` as keyof typeof TEXTES),
    decideur: derogation.grantedBy ?? null, service: derogation.service ?? null,
  };
}

/** Les dérogations de la fenêtre : la liste (item 12) et les comptages (item 13). */
function vueDerogations(derogations: DerogationJournalisee[], locale: Locale): VueDerogations {
  const entrees = [...derogations]
    .sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt))
    .map((derogation) => vueDerogation(derogation, locale));
  const compte = (statut: WaiverStatus) => entrees.filter((entree) => entree.statut === statut).length;
  const parService = new Map<string, VueDerogationsService>();
  for (const entree of entrees) {
    const cle = entree.service ?? '';
    if (!parService.has(cle)) parService.set(cle, { service: cle, demandees: 0, accordees: 0, refusees: 0 });
    const ligne = parService.get(cle) as VueDerogationsService;
    ligne.demandees += 1;
    if (entree.statut === 'granted') ligne.accordees += 1;
    if (entree.statut === 'refused') ligne.refusees += 1;
  }
  return {
    demandees: entrees.length,
    accordees: compte('granted'),
    refusees: compte('refused'),
    enAttente: compte('requested'),
    expirees: compte('expired'),
    entrees,
    parService: [...parService.values()].map((entree) => ({ ...entree, service: nomService(entree.service, locale) })),
  };
}

/** Fenêtre retenue, bornée : 30 jours par défaut (§7.3), 365 au maximum (item 21). */
export function joursFenetre(brut: number | undefined): number {
  if (brut === undefined || !Number.isFinite(brut)) return FENETRE_DEFAUT_JOURS;
  return Math.min(FENETRE_MAX_JOURS, Math.max(1, Math.round(brut)));
}

/** La fenêtre de l'écran : ses jours, ses bornes, et les choix proposés (item 21). */
function vueFenetre(entree: EntreeJournal): VueFenetre {
  const jours = joursFenetre(entree.fenetreJours);
  const disponibles = JOURS_PROPOSES.includes(jours) ? [...JOURS_PROPOSES] : [...JOURS_PROPOSES, jours].sort((a, b) => a - b);
  return { jours, depuis: entree.depuis ?? null, jusquA: entree.jusquA ?? null, joursDisponibles: disponibles };
}

/** Rapport d'observation : ce qui aurait été bloqué, dépôts les plus bloquants en tête. */
function rapportObservation(observation: Observation | undefined): VueRapportObservation {
  const byRepository = [...(observation?.byRepository ?? [])].sort((a, b) => b.bloquees - a.bloquees);
  return {
    observed: observation?.observed ?? 0,
    wouldHaveBlocked: observation?.wouldHaveBlocked ?? 0,
    byRepository,
  };
}

/** Écran 7 — journal : évaluations, statistiques, blocages, dérogations, rapport. */
export function vmJournal(entree: EntreeJournal): VueJournal {
  const evaluations = entree.evaluations ?? [];
  const derogations = entree.derogations ?? [];
  const lignes = lignesJournal(evaluations, entree.locale);
  const deblocage = delaisDeblocage(evaluations);
  return {
    evaluations: lignes,
    statistiques: statistiques(lignes),
    durees: vueDurees(lignes),
    blocages: {
      parRegle: blocagesParRegle(evaluations, entree.locale),
      parService: blocagesParService(evaluations, derogations, deblocage, entree.locale),
      deblocage,
    },
    derogations: vueDerogations(derogations, entree.locale),
    fenetre: vueFenetre(entree),
    rapport: rapportObservation(entree.observation),
  };
}

/** Une liste « a, b, c », ou « aucune » quand elle est vide. */
function liste(valeurs: string[], locale: Locale): string {
  return valeurs.length === 0 ? libelle(locale, 'rapport.rien') : valeurs.join(', ');
}

/** Ligne de fenêtre du rapport, vide si les bornes ne sont pas connues. */
function ligneFenetre(fenetre: VueFenetre, locale: Locale): string {
  if (fenetre.depuis === null || fenetre.jusquA === null) return '';
  return `${libelle(locale, 'rapport.fenetre')} : ${fenetre.depuis} → ${fenetre.jusquA} (${fenetre.jours} j)`;
}

/**
 * Le rapport d'observation, en texte (item 22).
 *
 * Fonction pure : elle ne lit rien, ne demande rien — elle rend le texte que le
 * resolver du journal produit à la demande et que l'écran affiche.
 */
export function texteRapport(vue: VueJournal, locale: Locale): string {
  const l = (cle: keyof typeof TEXTES) => libelle(locale, cle);
  const s = vue.statistiques;
  const d = vue.blocages.deblocage;
  const w = vue.derogations;
  return [
    l('rapport.titre'),
    ligneFenetre(vue.fenetre, locale),
    `${l('rapport.total')} : ${s.total} (${l('rapport.allowed')} ${s.allowed}, ${l('rapport.blocked')} ${s.blocked}, ${l('rapport.inconclusive')} ${s.inconclusive})`,
    `${l('rapport.durees')} : ${l('rapport.moyenne')} ${s.averageDurationMs}, ${l('rapport.p95')} ${vue.durees.p95Ms}, ${l('rapport.max')} ${vue.durees.maxMs}`,
    `${l('rapport.observation')} : ${vue.rapport.observed}, ${l('rapport.wouldHaveBlocked')} ${vue.rapport.wouldHaveBlocked}`,
    `${l('rapport.parRegle')} : ${liste(vue.blocages.parRegle.map((x) => `${x.regle} (${x.bloquees})`), locale)}`,
    `${l('rapport.parService')} : ${liste(vue.blocages.parService.map((x) => `${x.service} (${x.bloquees})`), locale)}`,
    `${l('rapport.derogations')} : ${w.demandees} ${l('rapport.demandees')}, ${w.accordees} ${l('rapport.accordees')}, ${w.refusees} ${l('rapport.refusees')}, ${w.enAttente} ${l('rapport.enAttente')}`,
    `${l('rapport.deblocage')} : ${l('rapport.mediane')} ${d.medianMs} ms, ${l('rapport.max')} ${d.maxMs} ms, ${d.enAttente} ${l('rapport.prsBloquees')}`,
  ]
    .filter((ligne) => ligne !== '')
    .join('\n');
}
