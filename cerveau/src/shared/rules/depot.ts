/**
 * Règles dans le dépôt (MC-17, §23) : composition et bornage.
 *
 * Un dépôt peut versionner un fichier `.merge-context.yml` qui **durcit** les
 * règles de l'espace de travail pour ce dépôt — niveau plus sévère, portée plus
 * étroite — mais jamais les **affaiblir**. Un niveau plus permissif ou un mode
 * observation imposé par le dépôt est ignoré et journalisé : la règle du §23
 * (« relu comme le reste du code, borné par les règles de l'organisation ») veut
 * que l'espace de travail garde le dernier mot.
 *
 * Logique pure : aucun import Forge, aucune lecture, aucune horloge.
 */
import { globMatch } from '../match/glob';
import type { Level, RuleConfig, RuleMode, RuleScope } from '../types';
import { isRuleCode } from './catalog';
import type { RuleCode } from '../types';

/** Une règle telle que le fichier `.merge-context.yml` du dépôt la décrit. */
export interface DepotRule {
  code: RuleCode;
  level: Level;
  /** Absent = `active` (le dépôt n'impose jamais l'observation). */
  mode?: RuleMode;
  scope?: RuleScope;
  params?: Record<string, unknown>;
}

/** Journal minimal reçu par la composition (le pont passe `deps.logger`). */
export interface JournalDepot {
  info(message: string, contexte?: Record<string, unknown>): void;
}

export interface CompositionOptions {
  /** Journalise les affaiblissements ignorés et les entrées écartées. */
  logger?: JournalDepot;
  /** Slug (ou UUID) du dépôt : portée par défaut d'une règle sans `repositories`. */
  repositorySlug?: string;
}

/** Ordre de sévérité des niveaux : le plus sévère l'emporte. */
const NIVEAU_RANG: Record<Level, number> = { information: 0, warning: 1, blocking: 2 };

/** Rang de sévérité d'un niveau (information < warning < blocking). */
export function severityDuNiveau(niveau: Level): number {
  return NIVEAU_RANG[niveau];
}

/** Vrai si `candidat` est strictement plus sévère que `reference`. */
export function plusSevere(candidat: Level, reference: Level): boolean {
  return severityDuNiveau(candidat) > severityDuNiveau(reference);
}

/**
 * Portée effective du dépôt pour une liste (dépôts ou branches) : la liste
 * déclarée, sinon la portée de l'espace ; resserrée par intersection quand les
 * deux sont non vides (le dépôt ne peut pas élargir la portée de l'espace).
 */
function restreindreListe(
  espace: string[] | undefined,
  depot: string[] | undefined,
): string[] | undefined {
  if (!depot || depot.length === 0) return espace;
  if (!espace || espace.length === 0) return depot;
  const commun = depot.filter((motif) => espace.some((e) => globMatch(e, motif)));
  return commun;
}

/**
 * Portée « repositories » effective : celle du dépôt, sinon le dépôt lui-même ;
 * resserrée sur la portée de l'espace. Rend `undefined` si disjointe (la règle
 * du dépôt ne s'appliquerait à rien) — l'appelant l'ignore alors.
 */
function porteeDepots(
  regle: DepotRule,
  espace: RuleScope,
  depot: string | undefined,
): string[] | undefined {
  const declares = regle.scope?.repositories;
  const voulu = declares && declares.length > 0 ? declares : depot ? [depot] : undefined;
  if (!voulu) return espace.repositories;
  const resserre = restreindreListe(espace.repositories, voulu);
  return resserre;
}

/** Règle du dépôt durcie au-dessus du réglage de l'espace, ou `undefined`. */
function durcir(
  regle: DepotRule,
  espace: RuleConfig,
  depot: string | undefined,
  logger?: JournalDepot,
): RuleConfig | undefined {
  let niveau = espace.level;
  if (plusSevere(regle.level, espace.level)) {
    niveau = regle.level;
  } else if (severityDuNiveau(regle.level) < severityDuNiveau(espace.level)) {
    logger?.info(
      `règle du dépôt ${regle.code} : niveau « ${regle.level} » plus permissif que l'espace`
      + ` (« ${espace.level} ») — ignoré`,
    );
  }
  let mode: RuleMode = espace.mode;
  if (regle.mode === 'observe') {
    if (espace.mode === 'active') {
      logger?.info(`règle du dépôt ${regle.code} : mode observation imposé — ignoré`);
    }
  } else {
    mode = 'active';
  }
  const repositories = porteeDepots(regle, espace.scope, depot);
  if (repositories !== undefined && repositories.length === 0) {
    logger?.info(`règle du dépôt ${regle.code} : portée disjointe de l'espace — ignorée`);
    return undefined;
  }
  const branches = restreindreListe(espace.scope.branches, regle.scope?.branches);
  const scope: RuleScope = {};
  if (repositories !== undefined && repositories.length > 0) scope.repositories = repositories;
  if (branches !== undefined && branches.length > 0) scope.branches = branches;
  return { rule: regle.code, level: niveau, mode, scope, params: { ...espace.params, ...(regle.params ?? {}) } };
}

/**
 * Compose les règles d'un dépôt avec les réglages de l'espace de travail.
 *
 * Rend une **nouvelle** liste : les réglages de l'espace sont conservés tels
 * quels, et chaque règle de dépôt valide ajoute un réglage durci, resserré sur
 * le dépôt. Une règle dont le code est inconnu de l'espace, plus permissive, ou
 * de portée disjointe est ignorée et journalisée. Jamais d'affaiblissement.
 */
export function composerReglesDepot(
  depotRegles: readonly DepotRule[] | undefined,
  configs: readonly RuleConfig[],
  options: CompositionOptions = {},
): RuleConfig[] {
  const resultat: RuleConfig[] = [...configs];
  if (!depotRegles || depotRegles.length === 0) return resultat;
  for (const regle of depotRegles) {
    if (!isRuleCode(regle.code)) {
      options.logger?.info(`règle du dépôt « ${String(regle.code)} » : code inconnu — ignorée`);
      continue;
    }
    const espace = configs.find((c) => c.rule === regle.code);
    if (!espace) {
      options.logger?.info(`règle du dépôt ${regle.code} : absente des réglages de l'espace — ignorée`);
      continue;
    }
    const durcie = durcir(regle, espace, options.repositorySlug, options.logger);
    if (durcie) resultat.push(durcie);
  }
  return resultat;
}
