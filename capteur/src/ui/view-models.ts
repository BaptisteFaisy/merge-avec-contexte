/**
 * Modèles de vue des trois écrans du Capteur (§12) : carte de PR, panneau de
 * l'onglet Overview, page de réglages de l'espace de travail.
 *
 * Aucun import Forge : les écrans `src/frontend/*.jsx` ne font qu'afficher ce
 * que ces fonctions calculent, et `capteur/test` les vérifie sans plateforme.
 * Les textes propres à l'interface (libellés de boutons, états de jumelage)
 * sont dans `TEXTES` : le contrat partagé n'en contient pas, et ce lot ne
 * modifie pas `shared/`.
 */
import type {
  Evaluation,
  FallbackCause,
  FallbackPolicy,
  Incident,
  IssueContext,
  Level,
  Locale,
  Reason,
  RuleCode,
  RuleConfig,
  RuleMode,
  RuleStatus,
} from '../shared/types';
import { formatEvaluation, visibleReasons } from '../shared/message/format';
import { RULE_CATALOG } from '../shared/rules/catalog';
import { t } from '../shared/message/strings';
import { formatDayAndHour } from '../shared/time/moment';
import { etatVideReglages } from './ux';

/** Les trois verdicts, tels que les écrans les nomment. */
export type VerdictVm = 'bloque' | 'autorise' | 'nonConcluant';

export interface LienVm {
  label: string;
  url: string;
}

/** Une raison affichable : ce qu'on montre, à qui, et quoi faire. */
export interface RaisonVm {
  text: string;
  action?: string;
  level: Level;
  rule: RuleCode;
  lien?: LienVm;
  /** Mode observation : journalisée, jamais présentée comme un blocage. */
  observee?: boolean;
}

export interface TicketVm {
  reconnu: boolean;
  cles: string[];
  /** Un lien par clé dont le ticket a une URL. */
  liens: LienVm[];
}

/** Ce que le Capteur sait du jumelage avec le Cerveau (§13.3). */
export interface JumelageEntree {
  jumele: boolean;
  site?: string;
  /** Date de la liaison, ISO 8601. */
  depuis?: string;
}

export interface JumelageVm {
  jumele: boolean;
  texte: string;
  site?: string;
  depuis?: string;
}

export interface DerogationVm {
  libelle: string;
  disponible: boolean;
  /** Pourquoi le bouton est absent, quand il l'est. */
  motif?: string;
}

export interface MarcheASuivreVm {
  titre: string;
  texte: string;
}

/** Modèle de la carte de PR (§12, écran 2). */
export interface CarteVm {
  verdict: VerdictVm;
  verdictTexte: string;
  /** Message exact du merge check, rendu par `formatEvaluation`. */
  message: string;
  ticket: TicketVm;
  raisons: RaisonVm[];
  jumelage: JumelageVm;
  derogation: DerogationVm;
  /** Renseigné quand le Cerveau est injoignable. */
  marcheASuivre?: MarcheASuivreVm;
  /** §17 cas 6 : un incident a bougé après l'évaluation, elle est périmée. */
  perime?: MarcheASuivreVm;
}

export interface CarteEntree {
  evaluation: Evaluation;
  jumelage: JumelageEntree;
  issues?: IssueContext[];
  /** Incidents du service touché, pour détecter une évaluation périmée. */
  incidents?: Incident[];
  locale?: Locale;
}

/** Une règle telle que le panneau la liste. */
export interface RegleVm {
  code: RuleCode;
  titre: string;
  niveau: Level;
  mode: RuleMode;
  resultat: RuleStatus;
}

/** Une ligne d'historique : quand, quel verdict, combien de temps. */
export interface HistoriqueVm {
  evalueLe: string;
  evalueLeIso: string;
  verdict: VerdictVm;
  verdictTexte: string;
  dureeMs: number;
}

/** Modèle du panneau de l'onglet Overview (§12, écran 2 bis). */
export interface PanneauVm extends CarteVm {
  regles: RegleVm[];
  /** Horodatage de l'évaluation, lisible (« 11/11 à 9 h »). */
  evalueLe: string;
  evalueLeIso: string;
  dureeMs: number;
  /** Évaluations précédentes, la plus récente d'abord. */
  historique: HistoriqueVm[];
}

export interface PanneauEntree extends CarteEntree {
  regles?: RuleConfig[];
  /** Statut connu par règle ; à défaut, déduit des raisons de l'évaluation. */
  resultats?: Partial<Record<RuleCode, RuleStatus>>;
  /** Évaluations passées de cette PR, déjà triées ou non. */
  historique?: Evaluation[];
}

export interface OptionVm<T extends string> {
  value: T;
  label: string;
  aide: string;
}

/** Modèle de la page de réglages de l'espace de travail (§12, écran 3). */
export interface ReglagesVm {
  codeJumelage: { libelle: string; aide: string; exemple: string; obligatoire: boolean };
  liaison: JumelageVm;
  politique: { valeur: FallbackPolicy; libelle: string; aide: string; options: OptionVm<FallbackPolicy>[] };
  envoyerChemins: { actif: boolean; libelle: string; aide: string };
  /** §17 cas 10 : la sonde `health` du pont a échoué au chargement. */
  pontInjoignable: boolean;
  /** Bandeau d'alerte rendu seulement quand `pontInjoignable` est vrai. */
  bandeauPont?: MarcheASuivreVm;
  etatVide?: MarcheASuivreVm; // Item 98 : état vide expliqué si espace non jumelé.
}

export interface ReglagesEntree {
  jumelage: JumelageEntree;
  politique: FallbackPolicy;
  envoyerChemins: boolean;
  /** Résultat de la sonde du pont : vrai si le Cerveau ne répond pas. */
  pontInjoignable?: boolean;
  locale?: Locale;
}

/** Textes de l'interface, en français et en anglais (§ CONVENTIONS 4). */
const TEXTES: Record<string, { fr: string; en: string }> = {
  'verdict.bloque': { fr: 'Bloqué', en: 'Blocked' },
  'verdict.autorise': { fr: 'Autorisé', en: 'Allowed' },
  'verdict.nonConcluant': { fr: 'Non concluant', en: 'Inconclusive' },
  'ticket.titre': { fr: 'Ticket reconnu', en: 'Linked issue' },
  'ticket.aucun': {
    fr: 'Aucun ticket Jira reconnu dans cette PR.',
    en: 'No Jira issue found in this pull request.',
  },
  'jumelage.jumele': { fr: 'Jumelé avec le site {site}', en: 'Paired with site {site}' },
  'jumelage.sansSite': { fr: 'Jumelé avec le Cerveau Jira.', en: 'Paired with the Jira brain.' },
  'jumelage.nonJumele': {
    fr: 'Non jumelé : cet espace de travail n’est relié à aucun site Jira.',
    en: 'Not paired: this workspace is not linked to any Jira site.',
  },
  'derogation.bouton': { fr: 'Demander une dérogation', en: 'Request a waiver' },
  'derogation.autorise': {
    fr: 'Le contrôle est autorisé : rien à demander.',
    en: 'The check is allowed: nothing to request.',
  },
  'derogation.nonJumele': {
    fr: 'Le jumelage se fait dans les réglages de l’espace de travail.',
    en: 'Pair the two apps in the workspace settings first.',
  },
  'derogation.injoignable': {
    fr: 'Le Cerveau est injoignable : la dérogation se demande depuis le ticket Jira.',
    en: 'The brain is unreachable: request the waiver from the Jira issue.',
  },
  'panne.titre': { fr: 'Cerveau injoignable', en: 'Brain unreachable' },
  'panne.texte': {
    fr: 'Vérifiez le jumelage dans les réglages de l’espace de travail, puis relancez le contrôle.',
    en: 'Check the pairing in the workspace settings, then run the check again.',
  },
  'panne.nonJumele.titre': { fr: 'Espace non jumelé', en: 'Workspace not paired' },
  'panne.nonJumele.texte': {
    fr: 'Jumelez cet espace de travail à un site Jira dans les réglages, puis relancez le contrôle.',
    en: 'Pair this workspace with a Jira site in the settings, then run the check again.',
  },
  'pont.bandeau.titre': { fr: 'Pont interrompu', en: 'Bridge down' },
  'perime.titre': { fr: 'Évaluation périmée', en: 'Stale evaluation' },
  'perime.texte': {
    fr: 'Un incident du service a été ouvert ou clos depuis ce contrôle : relancez le contrôle.',
    en: 'A service incident was opened or closed since this check: run the check again.',
  },
  'pont.bandeau.texte': {
    fr: 'Le Cerveau Jira ne répond pas : les contrôles appliquent la politique de repli jusqu’au rétablissement du pont.',
    en: 'The Jira brain is not responding: checks apply the fallback policy until the bridge is back up.',
  },
  'regles.titre': { fr: 'Règles évaluées', en: 'Evaluated rules' },
  'evalue.le': { fr: 'Évalué le {at}', en: 'Evaluated at {at}' },
  'reglages.code.libelle': { fr: 'Code de jumelage', en: 'Pairing code' },
  'reglages.code.aide': {
    fr: 'Saisissez le code affiché par le Cerveau dans les réglages du projet Jira : il est valable dix minutes.',
    en: 'Enter the code shown by the brain in the Jira project settings: it is valid for ten minutes.',
  },
  'reglages.politique.libelle': { fr: 'Politique de repli', en: 'Fallback policy' },
  'reglages.politique.open': { fr: 'Ouvert', en: 'Open' },
  'reglages.politique.closed': { fr: 'Fermé', en: 'Closed' },
  'reglages.politique.open.aide': {
    fr: 'Le contrôle passe avec la mention « contexte indisponible ».',
    en: 'The check passes with "context unavailable".',
  },
  'reglages.politique.closed.aide': {
    fr: 'Le contrôle échoue : à réserver aux branches critiques.',
    en: 'The check fails: reserve it for critical branches.',
  },
  'reglages.chemins.libelle': { fr: 'Envoyer les chemins de fichiers', en: 'Send file paths' },
  'reglages.chemins.aide': {
    fr: 'Seules des métadonnées circulent : décochez pour que les chemins modifiés ne quittent pas Bitbucket.',
    en: 'Only metadata travels: clear this so changed paths never leave Bitbucket.',
  },
};

/** Rend un texte de l'interface, avec interpolation des `{param}`. */
function tx(locale: Locale, cle: string, params: Record<string, string> = {}): string {
  const entree = TEXTES[cle];
  const gabarit = entree ? entree[locale] : cle;
  return gabarit.replace(/\{(\w+)\}/g, (motif, nom: string) =>
    Object.prototype.hasOwnProperty.call(params, nom) ? params[nom] : motif,
  );
}

/** Le verdict de l'évaluation, dans le vocabulaire des écrans. */
export function verdictVm(evaluation: Evaluation): VerdictVm {
  if (evaluation.verdict === 'blocked') return 'bloque';
  if (evaluation.verdict === 'allowed') return 'autorise';
  return 'nonConcluant';
}

/** Libellé court du verdict. */
export function verdictTexte(verdict: VerdictVm, locale: Locale = 'fr'): string {
  return tx(locale, `verdict.${verdict}`);
}

/** Ticket reconnu : les clés trouvées et un lien par ticket joignable. */
export function ticketVm(evaluation: Evaluation, issues: IssueContext[] = []): TicketVm {
  const cles = [...evaluation.issueKeys];
  const liens = cles
    .map((cle) => {
      const url = issues.find((issue) => issue.key === cle)?.url;
      return url ? { label: cle, url } : undefined;
    })
    .filter((lien): lien is LienVm => lien !== undefined);
  return { reconnu: cles.length > 0, cles, liens };
}

/** Une raison du contrat, prête à afficher. */
export function raisonVm(raison: Reason): RaisonVm {
  const vm: RaisonVm = { text: raison.text, level: raison.level, rule: raison.rule };
  if (raison.action) vm.action = raison.action;
  if (raison.link) vm.lien = { label: raison.link.label, url: raison.link.url };
  if (raison.observed) vm.observee = true;
  return vm;
}

/** Raisons affichables, la plus grave d'abord (même filtre que le message). */
export function raisonsVm(evaluation: Evaluation): RaisonVm[] {
  return visibleReasons(evaluation).map((raison) => raisonVm(raison));
}

/** État du jumelage, en une phrase. */
export function jumelageVm(entree: JumelageEntree, locale: Locale = 'fr'): JumelageVm {
  if (!entree.jumele) return { jumele: false, texte: tx(locale, 'jumelage.nonJumele') };
  const cle = entree.site ? 'jumelage.jumele' : 'jumelage.sansSite';
  const vm: JumelageVm = { jumele: true, texte: tx(locale, cle, entree.site ? { site: entree.site } : {}) };
  if (entree.site) vm.site = entree.site;
  if (entree.depuis) vm.depuis = entree.depuis;
  return vm;
}

/** Bouton de dérogation : offert seulement si le contrôle bloque et que le pont tient. */
export function derogationVm(
  verdict: VerdictVm,
  jumele: boolean,
  locale: Locale = 'fr',
  cause?: FallbackCause,
): DerogationVm {
  const libelle = tx(locale, 'derogation.bouton');
  if (!jumele) return { libelle, disponible: false, motif: tx(locale, 'derogation.nonJumele') };
  if (verdict === 'autorise') return { libelle, disponible: false, motif: tx(locale, 'derogation.autorise') };
  if (verdict === 'nonConcluant') {
    // Item 102 : un repli pour cause de jumelage absent ou perdu ne se dit pas
    // « Cerveau injoignable » — les deux situations n'ont pas la même issue.
    const cle = cause === 'unpaired' ? 'derogation.nonJumele' : 'derogation.injoignable';
    return { libelle, disponible: false, motif: tx(locale, cle) };
  }
  return { libelle, disponible: true };
}

/** Marche à suivre quand le Cerveau ne répond pas (§13.5). */
export function marcheASuivreVm(evaluation: Evaluation, locale: Locale = 'fr'): MarcheASuivreVm | undefined {
  if (evaluation.verdict !== 'inconclusive') return undefined;
  const cle = evaluation.fallback === 'closed' ? 'verdict.fallback.closed' : 'verdict.fallback.open';
  // Item 102 : « non jumelé » est une cause distincte du pont injoignable.
  const nonJumele = evaluation.cause === 'unpaired';
  const titre = tx(locale, nonJumele ? 'panne.nonJumele.titre' : 'panne.titre');
  const aide = tx(locale, nonJumele ? 'panne.nonJumele.texte' : 'panne.texte');
  const texte = [t(locale, 'verdict.inconclusive'), t(locale, cle), aide].join(' ');
  return { titre, texte };
}

/**
 * §17 cas 6 : un incident ouvert ou clos *après* l'évaluation la rend périmée —
 * le contrôle ne le rattrape qu'à une relance. Renvoie l'instant ISO du dernier
 * mouvement postérieur, ou `undefined`. Horloge injectée : `evaluatedAt` est
 * comparé aux horodatages des incidents, jamais à l'heure réelle.
 */
export function activiteApresEvaluation(evaluation: Evaluation, incidents: readonly Incident[] = []): string | undefined {
  const evalue = Date.parse(evaluation.evaluatedAt);
  if (Number.isNaN(evalue)) return undefined;
  let dernier: { instant: number; iso: string } | undefined;
  const mouvements = incidents.flatMap((incident) => [incident.openedAt, incident.resolvedAt]);
  for (const iso of mouvements) {
    if (typeof iso !== 'string') continue;
    const instant = Date.parse(iso);
    if (Number.isNaN(instant) || instant <= evalue) continue;
    if (!dernier || instant > dernier.instant) dernier = { instant, iso };
  }
  return dernier?.iso;
}

/** Vrai si l'évaluation est périmée au regard des incidents du service. */
export function evaluationPerimee(evaluation: Evaluation, incidents: readonly Incident[] = []): boolean {
  return activiteApresEvaluation(evaluation, incidents) !== undefined;
}

/** Bandeau « évaluation périmée, relancez le contrôle », ou `undefined`. */
export function perimeVm(evaluation: Evaluation, incidents: readonly Incident[] = [], locale: Locale = 'fr'): MarcheASuivreVm | undefined {
  if (!evaluationPerimee(evaluation, incidents)) return undefined;
  return { titre: tx(locale, 'perime.titre'), texte: tx(locale, 'perime.texte') };
}

/** Modèle de la carte de PR. */
export function vmCarte(entree: CarteEntree): CarteVm {
  const locale = entree.locale ?? 'fr';
  const verdict = verdictVm(entree.evaluation);
  const vm: CarteVm = {
    verdict,
    verdictTexte: verdictTexte(verdict, locale),
    message: formatEvaluation(entree.evaluation, { locale }),
    ticket: ticketVm(entree.evaluation, entree.issues),
    raisons: raisonsVm(entree.evaluation),
    jumelage: jumelageVm(entree.jumelage, locale),
    derogation: derogationVm(verdict, entree.jumelage.jumele, locale, entree.evaluation.cause),
  };
  const marche = marcheASuivreVm(entree.evaluation, locale);
  if (marche) vm.marcheASuivre = marche;
  const perime = perimeVm(entree.evaluation, entree.incidents, locale);
  if (perime) vm.perime = perime;
  return vm;
}

/** Statut d'une règle déduit des raisons, quand le moteur ne le fournit pas. */
function resultatDeduit(evaluation: Evaluation, code: RuleCode): RuleStatus {
  const touchee = evaluation.reasons.some((raison) => raison.rule === code);
  return touchee ? 'fail' : 'pass';
}

/** Une règle évaluée : code, titre du catalogue, niveau, mode, résultat. */
export function regleVm(
  config: RuleConfig,
  evaluation: Evaluation,
  resultats: Partial<Record<RuleCode, RuleStatus>> = {},
  locale: Locale = 'fr',
): RegleVm {
  return {
    code: config.rule,
    titre: t(locale, RULE_CATALOG[config.rule].titleKey),
    niveau: config.level,
    mode: config.mode,
    resultat: resultats[config.rule] ?? resultatDeduit(evaluation, config.rule),
  };
}

/** Toutes les règles configurées, dans l'ordre reçu. */
export function reglesVm(
  evaluation: Evaluation,
  configs: RuleConfig[] = [],
  resultats: Partial<Record<RuleCode, RuleStatus>> = {},
  locale: Locale = 'fr',
): RegleVm[] {
  return configs.map((config) => regleVm(config, evaluation, resultats, locale));
}

/** Une ligne d'historique à partir d'une évaluation. */
export function historiqueVm(evaluation: Evaluation, locale: Locale = 'fr'): HistoriqueVm {
  const verdict = verdictVm(evaluation);
  return {
    evalueLe: formatDayAndHour(evaluation.evaluatedAt, locale),
    evalueLeIso: evaluation.evaluatedAt,
    verdict,
    verdictTexte: verdictTexte(verdict, locale),
    dureeMs: evaluation.durationMs,
  };
}

/** Historique complet : l'évaluation courante d'abord, puis les précédentes. */
export function historiqueComplet(
  evaluation: Evaluation,
  precedentes: Evaluation[] = [],
  locale: Locale = 'fr',
): HistoriqueVm[] {
  return [evaluation, ...precedentes]
    .map((entree) => historiqueVm(entree, locale))
    .sort((a, b) => (a.evalueLeIso < b.evalueLeIso ? 1 : a.evalueLeIso > b.evalueLeIso ? -1 : 0));
}

/** Modèle du panneau de l'onglet Overview : la carte, plus le détail. */
export function vmPanneau(entree: PanneauEntree): PanneauVm {
  const locale = entree.locale ?? 'fr';
  const carte = vmCarte(entree);
  return {
    ...carte,
    regles: reglesVm(entree.evaluation, entree.regles, entree.resultats, locale),
    evalueLe: formatDayAndHour(entree.evaluation.evaluatedAt, locale),
    evalueLeIso: entree.evaluation.evaluatedAt,
    dureeMs: entree.evaluation.durationMs,
    historique: historiqueComplet(entree.evaluation, entree.historique, locale),
  };
}

/** Les deux politiques de repli, avec leur texte d'aide. */
export function politiqueOptions(locale: Locale = 'fr'): OptionVm<FallbackPolicy>[] {
  const valeurs: FallbackPolicy[] = ['open', 'closed'];
  return valeurs.map((value) => ({
    value,
    label: tx(locale, `reglages.politique.${value}`),
    aide: tx(locale, `reglages.politique.${value}.aide`),
  }));
}

/** Modèle de la page de réglages de l'espace de travail. */
export function vmReglagesEspace(entree: ReglagesEntree): ReglagesVm {
  const locale = entree.locale ?? 'fr';
  const options = politiqueOptions(locale);
  const choisie = options.find((option) => option.value === entree.politique) ?? options[0];
  const vm: ReglagesVm = {
    codeJumelage: {
      libelle: tx(locale, 'reglages.code.libelle'),
      aide: tx(locale, 'reglages.code.aide'),
      exemple: 'XXXX-XXXX',
      obligatoire: !entree.jumelage.jumele,
    },
    liaison: jumelageVm(entree.jumelage, locale),
    politique: {
      valeur: entree.politique,
      libelle: tx(locale, 'reglages.politique.libelle'),
      aide: choisie.aide,
      options,
    },
    envoyerChemins: {
      actif: entree.envoyerChemins,
      libelle: tx(locale, 'reglages.chemins.libelle'),
      aide: tx(locale, 'reglages.chemins.aide'),
    },
    pontInjoignable: entree.pontInjoignable ?? false,
  };
  if (vm.pontInjoignable) {
    vm.bandeauPont = { titre: tx(locale, 'pont.bandeau.titre'), texte: tx(locale, 'pont.bandeau.texte') };
  }
  // Item 98 : sans jumelage, la page explique quoi faire (état vide).
  const vide = etatVideReglages(entree.jumelage.jumele, locale);
  if (vide) vm.etatVide = vide;
  return vm;
}
