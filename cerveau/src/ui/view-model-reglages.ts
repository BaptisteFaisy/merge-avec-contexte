/**
 * Écran 4 — réglages du projet (§12, écran 4).
 *
 * Tableau des treize règles (niveau, mode, portée, paramètres — tout éditable,
 * items 3/6), section jumelage, correspondance dépôt → service, approbateurs
 * rangés par projet (item 23) et calendrier des gels (item 10, MC-14).
 * Module **pur** : aucune dépendance Forge, aucune lecture d'heure — l'instant
 * est injecté (`maintenant`).
 */
import { freezeApplies } from '../shared/freezes/match';
import { t } from '../shared/message/strings';
import { RULE_CODES, descriptorFor } from '../shared/rules/catalog';
import type { ParamType } from '../shared/rules/catalog';
import { formatDayAndHour, localParts } from '../shared/time/moment';
import type {
  Evaluation,
  FallbackPolicy,
  Freeze,
  Level,
  Locale,
  Recurrence,
  RuleCode,
  RuleConfig,
  RuleMode,
  RuleScope,
  Waiver,
} from '../shared/types';
import {
  libelleJour,
  libelleParam,
  optionsMode,
  optionsNiveau,
  optionsRecurrence,
  texte,
} from './view-model-commun';
import type { Option } from './view-model-commun';

export type EtatJumelage = 'unpaired' | 'paired' | 'code-pending';

export interface EntreeJumelage {
  etat: EtatJumelage;
  /** Code de jumelage en cours, tant qu'il n'a pas été saisi côté Bitbucket. */
  code?: string;
  /** Expiration du code (ISO). */
  codeExpireA?: string;
  siteUrl?: string;
  politiqueRepli: FallbackPolicy;
}

export interface EntreeReglages {
  locale: Locale;
  /** Réglages enregistrés ; une règle absente prend les valeurs du catalogue. */
  configs?: RuleConfig[];
  jumelage?: EntreeJumelage;
  correspondance?: Array<{ depot: string; service: string; composant?: string }>;
  approbateurs?: string[];
  /** Gels enregistrés (MC-14) : le calendrier rendu par l'écran. */
  gels?: Freeze[];
  /** Clé du projet dont c'est la page de réglages (item 23). */
  projet?: string;
  /** Instant injecté : décide si le code de jumelage est encore valable. */
  maintenant?: string;
  /**
   * Item 103 — évaluations de la fenêtre courante : seule la matière du bloc
   * « ce qui bloque le plus » est nécessaire (verdict et raisons).
   */
  evaluations?: Array<Pick<Evaluation, 'verdict' | 'reasons'>>;
  /** Item 103 — dérogations de la fenêtre : règle et statut suffisent. */
  waivers?: Array<Pick<Waiver, 'rule' | 'status'>>;
}

/** Valeur brute d'un paramètre, telle que le champ d'édition la reprend. */
export type ValeurParam = string | string[] | number | boolean | null;

export interface LigneParam {
  name: string;
  type: ParamType;
  note: string;
  /** Libellé bilingue du paramètre (son nom technique à défaut). */
  libelle: string;
  /** Valeur courante, déjà mise en texte pour l'affichage. */
  value: string;
  /** Valeur brute, pour initialiser le champ d'édition ; `null` si absente. */
  valeurBrute: ValeurParam;
}

export interface VuePortee {
  depots: string[];
  branches: string[];
  resume: string;
}

export interface LigneRegle {
  code: RuleCode;
  titre: string;
  niveau: Level;
  niveauLabel: string;
  niveauxPossibles: Option<Level>[];
  mode: RuleMode;
  modeLabel: string;
  modesPossibles: Option<RuleMode>[];
  portee: VuePortee;
  params: LigneParam[];
}

export interface VueJumelage {
  etat: EtatJumelage;
  etatLabel: string;
  /** Code à usage unique généré pour la liaison, tant qu'il n'est pas saisi côté Bitbucket. */
  codeEnCours: string | null;
  /** Expiration du code (ISO), nulle si aucun code n'est en cours. */
  codeExpire: string | null;
  codeExpireLabel: string | null;
  codeValide: boolean;
  siteUrl: string | null;
  politiqueRepli: FallbackPolicy;
  politiqueRepliLabel: string;
}

export interface LigneCorrespondance {
  depot: string;
  service: string;
  composant: string | null;
}

/** État d'un gel à l'instant injecté : en cours, à venir, ou terminé. */
export type EtatGel = 'active' | 'upcoming' | 'past';

/** Genre de récurrence d'un gel (`Recurrence` du contrat partagé). */
export type GenreRecurrence = Recurrence['kind'];

/** Une ligne du calendrier des gels (MC-14). */
export interface LigneGel {
  id: string;
  nom: string;
  /** Fenêtre lisible, dans le fuseau du gel : « 24/12 à 18 h → 24/12 à 22 h ». */
  fenetre: string;
  branches: string[];
  branchesLabel: string;
  services: string[];
  servicesLabel: string;
  recurrence: GenreRecurrence;
  recurrenceLabel: string;
  etat: EtatGel;
  etatLabel: string;
  fuseau: string;
  /** Conséquence affichée avant la suppression (confirmation, item 99). */
  supprimerConsequence: string;
}

/** Libellés du formulaire et de la liste des gels. */
export interface LibellesGels {
  titre: string;
  aide: string;
  nom: string;
  debut: string;
  heureDebut: string;
  fin: string;
  heureFin: string;
  branches: string;
  services: string;
  recurrence: string;
  jours: string;
  fuseau: string;
  creer: string;
  supprimer: string;
  aucun: string;
  recurrenceOptions: Option<GenreRecurrence>[];
}

/** Libellés de l'édition d'une règle (portée et paramètres). */
export interface LibellesRegles {
  depots: string;
  branches: string;
  aide: string;
  parametres: string;
}

/** Libellés bilingues de l'écran : les composants UI Kit ne traduisent rien. */
export interface LibellesReglages {
  regles: LibellesRegles;
  gels: LibellesGels;
  approbateursAide: string;
}

/**
 * Item 103 — une des règles qui bloquent le plus sur la fenêtre courante, avec
 * son taux de dérogation (part des blocages contournés par une dérogation accordée).
 */
export interface VueBlocage {
  code: RuleCode;
  titre: string;
  /** Nombre de fusions bloquées par cette règle sur la fenêtre. */
  blocages: number;
  /** Nombre de dérogations accordées pour cette règle sur la fenêtre. */
  derogations: number;
  /** Pourcentage de dérogations accordées rapporté aux blocages. */
  tauxDerogation: number;
}

export interface VueReglages {
  regles: LigneRegle[];
  jumelage: VueJumelage;
  correspondance: LigneCorrespondance[];
  approbateurs: string[];
  /** Item 103 — les trois règles qui ont le plus bloqué, taux de dérogation inclus. */
  blocages: VueBlocage[];
  /** Calendrier des gels (MC-14), trié par début. */
  gels: LigneGel[];
  /** Libellés bilingues de l'écran, déjà traduits dans la langue effective. */
  libelles: LibellesReglages;
  /** Phrase rappelant le projet de la page ; nulle si le projet est inconnu. */
  projetLabel: string | null;
}

/** Valeur de paramètre mise en texte : listes jointes, booléens traduits. */
function formaterValeur(valeur: unknown, locale: Locale): string {
  if (valeur === undefined || valeur === null) return '';
  if (Array.isArray(valeur)) return valeur.map((element) => String(element)).join(', ');
  if (typeof valeur === 'boolean') return valeur ? texte(locale, 'param.oui') : texte(locale, 'param.non');
  return String(valeur);
}

/** Valeur brute d'un paramètre, normalisée pour initialiser un champ d'édition. */
function valeurBruteParam(valeur: unknown): ValeurParam {
  if (valeur === undefined || valeur === null) return null;
  if (Array.isArray(valeur)) return valeur.map((element) => String(element));
  if (typeof valeur === 'boolean' || typeof valeur === 'number') return valeur;
  return String(valeur);
}

/** Portée d'une règle : listes brutes et phrase de résumé. */
function vuePortee(scope: RuleScope, locale: Locale): VuePortee {
  const depots = scope.repositories ?? [];
  const branches = scope.branches ?? [];
  const morceaux: string[] = [];
  if (depots.length > 0) morceaux.push(texte(locale, 'portee.depots', { list: depots.join(', ') }));
  if (branches.length > 0) morceaux.push(texte(locale, 'portee.branches', { list: branches.join(', ') }));
  return {
    depots,
    branches,
    resume: morceaux.length > 0 ? morceaux.join(' · ') : texte(locale, 'portee.tout'),
  };
}

/** Une ligne du tableau des treize règles. */
function ligneRegle(code: RuleCode, config: RuleConfig | undefined, locale: Locale): LigneRegle {
  const descriptor = descriptorFor(code);
  const niveau = config?.level ?? descriptor.defaultLevel;
  const mode = config?.mode ?? 'active';
  return {
    code,
    titre: t(locale, descriptor.titleKey),
    niveau,
    niveauLabel: texte(locale, `niveau.${niveau}`),
    niveauxPossibles: optionsNiveau(locale),
    mode,
    modeLabel: texte(locale, `mode.${mode}`),
    modesPossibles: optionsMode(locale),
    portee: vuePortee(config?.scope ?? {}, locale),
    params: descriptor.params.map((spec) => ({
      name: spec.name,
      type: spec.type,
      note: spec.note,
      libelle: libelleParam(spec.name, locale),
      value: formaterValeur(config?.params?.[spec.name], locale),
      valeurBrute: valeurBruteParam(config?.params?.[spec.name]),
    })),
  };
}

/** Vrai si le code de jumelage est encore valable à l'instant donné. */
function codeEncoreValide(codeExpireA: string | undefined, maintenant: string | undefined): boolean {
  if (!codeExpireA) return false;
  if (!maintenant) return true;
  return Date.parse(codeExpireA) > Date.parse(maintenant);
}

/** Section « jumelage » : état, code en cours, adresse du site, politique de repli. */
function vueJumelage(entree: EntreeJumelage | undefined, locale: Locale, maintenant?: string): VueJumelage {
  const etat = entree?.etat ?? 'unpaired';
  const politique = entree?.politiqueRepli ?? 'open';
  const codeExpireA = entree?.codeExpireA;
  return {
    etat,
    etatLabel: texte(locale, `jumelage.${etat}`),
    codeEnCours: entree?.code ?? null,
    codeExpire: codeExpireA ?? null,
    codeExpireLabel: codeExpireA ? formatDayAndHour(codeExpireA, locale) : null,
    codeValide: codeEncoreValide(codeExpireA, maintenant),
    siteUrl: entree?.siteUrl ?? null,
    politiqueRepli: politique,
    politiqueRepliLabel: texte(locale, `repli.${politique}`),
  };
}

/**
 * Item 103 — compte les blocages par règle : une évaluation `blocked` compte une
 * fois par règle bloquante effectivement appliquée (ni observée, ni dérogée).
 */
function compterBlocages(evaluations: EntreeReglages['evaluations']): Map<RuleCode, number> {
  const compte = new Map<RuleCode, number>();
  for (const evaluation of evaluations ?? []) {
    if (evaluation.verdict !== 'blocked') continue;
    const touchees = new Set<RuleCode>();
    for (const raison of evaluation.reasons ?? []) {
      if (raison.level === 'blocking' && !raison.waived && !raison.observed) touchees.add(raison.rule);
    }
    for (const code of touchees) compte.set(code, (compte.get(code) ?? 0) + 1);
  }
  return compte;
}

/** Item 103 — compte les dérogations accordées par règle sur la fenêtre. */
function compterDerogations(waivers: EntreeReglages['waivers']): Map<RuleCode, number> {
  const compte = new Map<RuleCode, number>();
  for (const derogation of waivers ?? []) {
    if (derogation.status !== 'granted') continue;
    compte.set(derogation.rule, (compte.get(derogation.rule) ?? 0) + 1);
  }
  return compte;
}

/**
 * Item 103 — « ce qui bloque le plus » : les trois règles les plus bloquantes de
 * la fenêtre, avec leur taux de dérogation (dérogations accordées ÷ blocages).
 */
function blocagesFrequents(entree: EntreeReglages): VueBlocage[] {
  const blocages = compterBlocages(entree.evaluations);
  const derogations = compterDerogations(entree.waivers);
  return [...blocages.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([code, nombre]) => {
      const accordees = derogations.get(code) ?? 0;
      return {
        code,
        titre: t(entree.locale, descriptorFor(code).titleKey),
        blocages: nombre,
        derogations: accordees,
        tauxDerogation: Math.round((accordees / nombre) * 100),
      };
    });
}

/**
 * Le gel couvre-t-il son propre périmètre à l'instant donné ? On réutilise le
 * moteur partagé (`freezeApplies`) en lui présentant une branche et un service
 * qui appartiennent au gel : un motif glob se correspond toujours à lui-même.
 */
function gelEnCours(freeze: Freeze, maintenant: string): boolean {
  return freezeApplies(freeze, {
    targetBranch: freeze.branches[0] ?? '',
    service: freeze.services[0],
    now: maintenant,
  });
}

/** Le gel est terminé : instant brut dépassé, ou date locale après la fin. */
function gelPasse(freeze: Freeze, maintenant: string): boolean {
  if (freeze.recurrence.kind === 'none') {
    return Date.parse(maintenant) >= Date.parse(freeze.endsAt);
  }
  const fuseau = freeze.timezone ?? 'UTC';
  const instant = localParts(maintenant, fuseau);
  const fin = localParts(freeze.endsAt, fuseau);
  return Boolean(instant && fin && instant.date > fin.date);
}

/** État d'un gel à l'instant injecté. */
function etatGel(freeze: Freeze, maintenant: string | undefined): EtatGel {
  if (!maintenant) return 'upcoming';
  if (gelEnCours(freeze, maintenant)) return 'active';
  return gelPasse(freeze, maintenant) ? 'past' : 'upcoming';
}

/** Libellé de la récurrence : « Hebdomadaire (lun., mar.) ». */
function libelleRecurrence(recurrence: Recurrence, locale: Locale): string {
  if (recurrence.kind === 'none') return texte(locale, 'gel.recurrence.none');
  if (recurrence.kind === 'daily') return texte(locale, 'gel.recurrence.daily');
  const jours = recurrence.daysOfWeek.map((jour) => libelleJour(jour, locale)).join(', ');
  return `${texte(locale, 'gel.recurrence.weekly')} (${jours})`;
}

/** Une ligne du calendrier des gels. */
function ligneGel(freeze: Freeze, locale: Locale, maintenant: string | undefined): LigneGel {
  const fuseau = freeze.timezone ?? 'UTC';
  const etat = etatGel(freeze, maintenant);
  return {
    id: freeze.id,
    nom: freeze.name,
    fenetre: texte(locale, 'gel.fenetres', {
      debut: formatDayAndHour(freeze.startsAt, locale, fuseau),
      fin: formatDayAndHour(freeze.endsAt, locale, fuseau),
    }),
    branches: [...freeze.branches],
    branchesLabel: freeze.branches.length > 0
      ? texte(locale, 'gel.branchesLabel', { list: freeze.branches.join(', ') })
      : texte(locale, 'gel.toutesBranches'),
    services: [...freeze.services],
    servicesLabel: freeze.services.length > 0
      ? texte(locale, 'gel.servicesLabel', { list: freeze.services.join(', ') })
      : texte(locale, 'gel.tousServices'),
    recurrence: freeze.recurrence.kind,
    recurrenceLabel: libelleRecurrence(freeze.recurrence, locale),
    etat,
    etatLabel: texte(locale, `gel.etat.${etat}`),
    fuseau,
    supprimerConsequence: texte(locale, 'gel.supprimerConsequence', { nom: freeze.name }),
  };
}

/** Calendrier des gels (MC-14), trié par début. */
function vueGels(freezes: Freeze[], locale: Locale, maintenant: string | undefined): LigneGel[] {
  return [...freezes]
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .map((freeze) => ligneGel(freeze, locale, maintenant));
}

/** Libellés bilingues de l'écran, traduits une seule fois côté modèle de vue. */
function libellesReglages(locale: Locale): LibellesReglages {
  return {
    regles: {
      depots: texte(locale, 'portee.depots.label'),
      branches: texte(locale, 'portee.branches.label'),
      aide: texte(locale, 'portee.aide'),
      parametres: texte(locale, 'parametres.aide'),
    },
    gels: {
      titre: texte(locale, 'gel.titre'),
      aide: texte(locale, 'gel.aide'),
      nom: texte(locale, 'gel.nom'),
      debut: texte(locale, 'gel.debut'),
      heureDebut: texte(locale, 'gel.heureDebut'),
      fin: texte(locale, 'gel.fin'),
      heureFin: texte(locale, 'gel.heureFin'),
      branches: texte(locale, 'gel.branches'),
      services: texte(locale, 'gel.services'),
      recurrence: texte(locale, 'gel.recurrence'),
      jours: texte(locale, 'gel.jours'),
      fuseau: texte(locale, 'gel.fuseau'),
      creer: texte(locale, 'gel.creer'),
      supprimer: texte(locale, 'gel.supprimer'),
      aucun: texte(locale, 'gel.aucun'),
      recurrenceOptions: optionsRecurrence(locale),
    },
    approbateursAide: texte(locale, 'approbateurs.aide'),
  };
}

/** Écran 4 — réglages du projet : treize règles, jumelage, dépôt → service, gels. */
export function vmReglages(entree: EntreeReglages): VueReglages {
  const { locale } = entree;
  const parCode = new Map((entree.configs ?? []).map((config) => [config.rule, config]));
  return {
    regles: RULE_CODES.map((code) => ligneRegle(code, parCode.get(code), locale)),
    jumelage: vueJumelage(entree.jumelage, locale, entree.maintenant),
    correspondance: (entree.correspondance ?? []).map((ligne) => ({
      depot: ligne.depot,
      service: ligne.service,
      composant: ligne.composant ?? null,
    })),
    approbateurs: [...(entree.approbateurs ?? [])],
    blocages: blocagesFrequents(entree),
    gels: vueGels(entree.gels ?? [], locale, entree.maintenant),
    libelles: libellesReglages(locale),
    projetLabel: entree.projet ? texte(locale, 'reglages.projet', { cle: entree.projet }) : null,
  };
}
