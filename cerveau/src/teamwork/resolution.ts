/**
 * Résolution des deux sources du §8 — logique pure, aucune lecture.
 *
 * « Relier un dépôt à un service. Sources, dans l'ordre : 1. table de
 * correspondance tenue dans les réglages du Cerveau ; 2. relations du Teamwork
 * Graph entre service, dépôt et composant, lues côté Jira. »
 *
 * La table de réglages prime donc toujours : le graphe complète, il ne
 * contredit pas. La même priorité s'applique à l'équipe de R-10 — une liste
 * saisie par l'administrateur l'emporte sur l'équipe découverte dans le
 * graphe — et la source retenue est rendue, pour être journalisée.
 */
import type { RuleConfig } from '../shared';
import { paramString, paramStrings } from '../rules/input';
import type { TeamworkRelations, TeamworkTeam } from './ports';

/** Source déclarée par l'administrateur dans les réglages d'une règle. */
export type SourceDeclaree = 'settings' | 'teamwork-graph';

/** Source qui a effectivement fourni la valeur ; `none` = aucune des deux. */
export type SourceEffective = SourceDeclaree | 'none';

/** Nom du dépôt ou du service absent des relations. */
const SANS_SOURCE: SourceEffective = 'none';

/** Correspondance dépôt → service, avec la source qui l'a donnée. */
export interface CorrespondanceService {
  /** Service retenu, ou `null` si aucune source n'en connaît. */
  service: string | null;
  source: SourceEffective;
}

/** Texte utile d'une valeur de source : chaîne non vide, sinon `undefined`. */
function utile(valeur: string | undefined | null): string | undefined {
  if (typeof valeur !== 'string') return undefined;
  const texte = valeur.trim();
  return texte === '' ? undefined : texte;
}

/** Source 1 d'abord (réglages), source 2 ensuite (graphe) : §8, « dans l'ordre ». */
export function resoudreService(
  reglages: string | undefined,
  graphe: string | undefined,
): CorrespondanceService {
  const depuisReglages = utile(reglages);
  if (depuisReglages !== undefined) return { service: depuisReglages, source: 'settings' };
  const depuisGraphe = utile(graphe);
  if (depuisGraphe !== undefined) return { service: depuisGraphe, source: 'teamwork-graph' };
  return { service: null, source: SANS_SOURCE };
}

/** Équipe propriétaire effective d'un service, et sa provenance. */
export interface EquipeEffective {
  /** Comptes habilités à satisfaire R-10 ; vide = règle non évaluée. */
  team: string[];
  /** Nom d'équipe affiché par le message de R-10. */
  teamName: string;
  source: SourceEffective;
}

/** Nom d'équipe de repli : celui des réglages, sinon le service. */
function nomDeRepli(params: Record<string, unknown>, service: string | undefined): string {
  return paramString(params, 'teamName', service ?? 'owners');
}

/** Une équipe du graphe est exploitable si elle porte au moins un membre. */
function equipeExploitable(equipe: TeamworkTeam | undefined): equipe is TeamworkTeam {
  return equipe !== undefined && equipe.memberAccountIds.length > 0;
}

/**
 * Équipe de R-10 : la liste des réglages prime, le graphe complète.
 *
 * Sans aucune des deux, `team` reste vide et R-10 n'est pas évaluée — c'est le
 * comportement existant de la règle (« mieux vaut ne rien dire que bloquer à
 * tort »), que cette résolution ne change jamais.
 */
export function resoudreEquipe(
  params: Record<string, unknown>,
  relations: TeamworkRelations | undefined,
  service: string | undefined,
): EquipeEffective {
  const reglages = paramStrings(params, 'team', []);
  if (reglages.length > 0) {
    return { team: reglages, teamName: nomDeRepli(params, service), source: 'settings' };
  }
  const equipe = relations?.team;
  if (equipeExploitable(equipe)) {
    const nom = utile(equipe.name) ?? nomDeRepli(params, service);
    return { team: [...equipe.memberAccountIds], teamName: nom, source: 'teamwork-graph' };
  }
  return { team: [], teamName: nomDeRepli(params, service), source: SANS_SOURCE };
}

/**
 * Réglage R-10 dont l'équipe est résolue : ce que la règle lira.
 *
 * Le reste du réglage (niveau, mode, portée) n'est jamais touché : la
 * résolution complète les paramètres, elle ne règle rien à la place de
 * l'administrateur.
 */
export function regleR10Effective(config: RuleConfig, equipe: EquipeEffective): RuleConfig {
  return {
    ...config,
    params: { ...config.params, team: [...equipe.team], teamName: equipe.teamName },
  };
}

/** Vrai si ce réglage est celui de R-10, la seule règle qui porte une équipe. */
export function estRegleEquipe(config: RuleConfig): boolean {
  return config.rule === 'R-10';
}
