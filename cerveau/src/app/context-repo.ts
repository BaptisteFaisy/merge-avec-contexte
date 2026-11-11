/**
 * Adaptateur : le contexte du projet (règles, gels, correspondance
 * dépôt → service) lu dans le stockage, tel que le pont le demande.
 *
 * `serviceDuDepot` est partagé par le pont et par les actions Rovo : une seule
 * implémentation de la correspondance (§8, « Relier un dépôt à un service »).
 */
import type { ContextRepository } from '../bridge/deps';
import type { Store } from '../storage/ports';
import type { AppConfig } from './config';

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
      return store.ruleConfig.listByProject(config.projectId);
    },
    async serviceForRepository(_siteUrl, repositoryUuid) {
      return serviceDuDepot(store, repositoryUuid);
    },
    async freezes() {
      return store.freezes.list();
    },
  };
}
