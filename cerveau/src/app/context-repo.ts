/**
 * Adaptateur : le contexte du projet (règles, gels, correspondance
 * dépôt → service) lu dans le stockage, tel que le pont le demande.
 *
 * `serviceDuDepot` est partagé par le pont et par les actions Rovo : une seule
 * implémentation de la correspondance (§8, « Relier un dépôt à un service »).
 */
import type { ContextRepository } from '../bridge/deps';
import { defaultRuleConfigs } from '../rules/defaults';
import type { RuleConfig, RuleCode } from '../shared';
import type { Store } from '../storage/ports';
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

/** Réglages effectifs lus en base, complétés par les valeurs du catalogue. */
export async function reglesEffectives(store: Store, projectId: string): Promise<RuleConfig[]> {
  return reglesAvecDefauts(await store.ruleConfig.listByProject(projectId));
}

/** Service alimenté par un dépôt, ou `undefined` si la correspondance manque. */
export async function serviceDuDepot(store: Store, depot: string): Promise<string | undefined> {
  if (!depot) return undefined;
  const jumelage = await store.pairing.current();
  if (!jumelage) return undefined;
  const direct = await store.repoService.find(jumelage.workspaceUuid, depot);
  if (direct) return direct.service;
  const toutes = await store.repoService.listByWorkspace(jumelage.workspaceUuid);
  return toutes.find((ligne) => ligne.repoUuid === depot || ligne.repoUuid.endsWith(`/${depot}`))?.service;
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
