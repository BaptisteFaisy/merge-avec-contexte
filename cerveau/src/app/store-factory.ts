/**
 * Choix du stockage à l'exécution.
 *
 * En production le Cerveau utilise Forge SQL ; si le module `@forge/sql` n'est
 * pas disponible (installation sans le module `sql` du manifeste, tests hors
 * plateforme), on retombe sur le store mémoire pour que l'app démarre et
 * explique la situation au lieu de lever.
 */
import type { Store } from '../storage/ports';
import { createMemoryStore } from '../storage/memory-store';
import type { LoggerCommun } from './logger';

/** Crée le store de production, avec repli mémoire documenté. */
export async function creerStoreProduction(logger: LoggerCommun): Promise<Store> {
  try {
    const module = await import('../storage/sql-store');
    return module.createSqlStore();
  } catch (erreur) {
    logger.warn('Forge SQL indisponible : stockage mémoire (aucune persistance)', { erreur: String(erreur) });
    return createMemoryStore();
  }
}
