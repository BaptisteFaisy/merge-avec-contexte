/**
 * Écran 4 — réglages du projet (§12, écran 4).
 *
 * Tableau des treize règles (niveau, mode, portée, paramètres), section jumelage
 * et correspondance dépôt → service. Module **pur** : aucune dépendance Forge.
 */
import { t } from '../shared/message/strings';
import { RULE_CODES, descriptorFor } from '../shared/rules/catalog';
import type { ParamType } from '../shared/rules/catalog';
import { formatDayAndHour } from '../shared/time/moment';
import type {
  Evaluation,
  FallbackPolicy,
  Level,
  Locale,
  RuleCode,
  RuleConfig,
  RuleMode,
  RuleScope,
  Waiver,
} from '../shared/types';
import { optionsMode, optionsNiveau, texte } from './view-model-commun';
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

export interface LigneParam {
  name: string;
  type: ParamType;
  note: string;
  /** Valeur courante, déjà mise en texte pour l'affichage. */
  value: string;
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
}

/** Valeur de paramètre mise en texte : listes jointes, booléens traduits. */
function formaterValeur(valeur: unknown, locale: Locale): string {
  if (valeur === undefined || valeur === null) return '';
  if (Array.isArray(valeur)) return valeur.map((element) => String(element)).join(', ');
  if (typeof valeur === 'boolean') return valeur ? texte(locale, 'param.oui') : texte(locale, 'param.non');
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
      value: formaterValeur(config?.params?.[spec.name], locale),
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

/** Écran 4 — réglages du projet : treize règles, jumelage, dépôt → service. */
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
  };
}
