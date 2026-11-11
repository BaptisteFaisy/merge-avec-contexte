/**
 * Adaptateur : le contexte du projet (règles, gels, correspondance
 * dépôt → service) lu dans le stockage, tel que le pont le demande.
 *
 * `serviceDuDepot` est partagé par le pont et par les actions Rovo : une seule
 * implémentation de la correspondance (§8, « Relier un dépôt à un service »).
 *
 * Le §8 prévoit deux sources, dans l'ordre : la table de correspondance des
 * réglages (source 1) puis les relations du Teamwork Graph (source 2). La
 * source 1 prime : le graphe ne sert que lorsque les réglages ne connaissent
 * pas le dépôt. La règle R-10 (équipe propriétaire) profite de la même
 * lecture : sans liste d'équipe dans les réglages, l'équipe vient du graphe.
 */
import type { ContextRepository } from '../bridge/deps';
import { defaultRuleConfigs } from '../rules/defaults';
import { paramStrings } from '../rules/input';
import type { RuleConfig, RuleCode } from '../shared';
import type { Store } from '../storage/ports';
import {
  estRegleEquipe,
  lecteurTeamwork,
  regleR10Effective,
  resoudreEquipe,
  resoudreService,
} from '../teamwork';
import type { EquipeEffective, TeamworkGraphReader } from '../teamwork';
import type { AppConfig } from './config';

/**
 * Réglages effectifs d'un projet : le catalogue fournit le niveau par défaut de
 * chaque règle, l'administrateur n'écrit que ce qu'il change (§8). Sans cette
 * fusion, une installation neuve n'évaluerait aucune règle — tout passerait.
 */
export function reglesAvecDefauts(enregistrees: RuleConfig[]): RuleConfig[] {
  const parRegle = new Map<RuleCode, RuleConfig>(enregistrees.map((config) => [config.rule, config]));
  return defaultRuleConfigs().map((defaut) => parRegle.get(defaut.rule) ?? defaut);
}

/** Contexte de résolution des règles : ce que l'appelant sait déjà. */
export interface ContexteRegles {
  /** Dépôt évalué : il donne le service, puis l'équipe propriétaire. */
  depot?: string | null;
  /** Service déjà résolu : évite une seconde lecture. */
  service?: string;
  /** Lecteur du Teamwork Graph ; par défaut, celui de l'installation. */
  teamwork?: TeamworkGraphReader;
}

/** Source 1 du §8 : la table de correspondance des réglages. */
export async function serviceDepuisReglages(store: Store, depot: string): Promise<string | undefined> {
  if (!depot) return undefined;
  const jumelage = await store.pairing.current();
  if (!jumelage) return undefined;
  const direct = await store.repoService.find(jumelage.workspaceUuid, depot);
  if (direct) return direct.service;
  const toutes = await store.repoService.listByWorkspace(jumelage.workspaceUuid);
  return toutes.find((ligne) => ligne.repoUuid === depot || ligne.repoUuid.endsWith(`/${depot}`))?.service;
}

/** Source 2 du §8 : les relations du Teamwork Graph pour ce dépôt. */
export async function serviceDepuisGraphe(
  depot: string,
  teamwork?: TeamworkGraphReader,
): Promise<string | undefined> {
  if (!depot) return undefined;
  const lecteur = teamwork ?? (await lecteurTeamwork());
  const relations = await lecteur.relationsForRepository(depot);
  return relations.service;
}

/** Service alimenté par un dépôt, ou `undefined` si la correspondance manque. */
export async function serviceDuDepot(
  store: Store,
  depot: string,
  teamwork?: TeamworkGraphReader,
): Promise<string | undefined> {
  const depuisReglages = await serviceDepuisReglages(store, depot);
  // La source 1 suffit : inutile d'interroger le graphe (une requête de plus).
  if (depuisReglages !== undefined) return depuisReglages;
  const depuisGraphe = await serviceDepuisGraphe(depot, teamwork);
  return resoudreService(depuisReglages, depuisGraphe).service ?? undefined;
}

/**
 * Équipe propriétaire de R-10, lue dans le Teamwork Graph.
 *
 * Renvoie `undefined` quand rien n'est à compléter : équipe déjà saisie dans les
 * réglages, dépôt inconnu, ou graphe muet. La règle garde alors son
 * comportement (« pas d'équipe, règle non évaluée »).
 */
async function equipeProprietaire(
  store: Store,
  configs: RuleConfig[],
  contexte: ContexteRegles,
): Promise<EquipeEffective | undefined> {
  const depot = (contexte.depot ?? '').trim();
  if (depot === '') return undefined;
  const config = configs.find(estRegleEquipe);
  if (config === undefined) return undefined;
  if (paramStrings(config.params, 'team', []).length > 0) return undefined;
  const service = contexte.service ?? (await serviceDuDepot(store, depot, contexte.teamwork));
  if (service === undefined) return undefined;
  const lecteur = contexte.teamwork ?? (await lecteurTeamwork());
  const relations = await lecteur.relationsForService(service);
  const equipe = resoudreEquipe(config.params, relations, service);
  return equipe.source === 'none' ? undefined : equipe;
}

/** Réglages effectifs lus en base, complétés par les valeurs du catalogue. */
export async function reglesEffectives(
  store: Store,
  projectId: string,
  contexte: ContexteRegles = {},
): Promise<RuleConfig[]> {
  const configs = reglesAvecDefauts(await store.ruleConfig.listByProject(projectId));
  const equipe = await equipeProprietaire(store, configs, contexte);
  if (equipe === undefined) return configs;
  return configs.map((config) => (estRegleEquipe(config) ? regleR10Effective(config, equipe) : config));
}

/** Fabrique le `ContextRepository` attendu par le pont. */
export function createContextRepository(store: Store, config: AppConfig): ContextRepository {
  return {
    async rules() {
      return reglesEffectives(store, config.projectId);
    },
    async serviceForRepository(_siteUrl, repositoryUuid) {
      return serviceDuDepot(store, repositoryUuid);
    },
    async freezes() {
      return store.freezes.list();
    },
  };
}
