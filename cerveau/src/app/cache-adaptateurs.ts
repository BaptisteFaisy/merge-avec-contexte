/**
 * Adaptateurs entre le stockage (§14, tables `issue_cache` et
 * `service_incident`) et les ports du cache (`cache/ports.ts`).
 *
 * Les deux couches ont été écrites séparément : le cache parle `lire`/`ecrire`
 * et d'entrées horodatées, le stockage parle `read`/`write` et d'entrées
 * `IssueCacheEntry`. On traduit ici, une seule fois.
 */
import type { DepsCacheTicket } from '../cache/issue-cache';
import type { DepsCacheIncidents } from '../cache/service-cache';
import type { IncidentRepository as CacheIncidents, IssueCacheRepository as CacheTickets } from '../cache/ports';
import type { IssueReader } from '../jira/reader';
import type { Store } from '../storage/ports';
import type { HorlogeIso } from './horloge';
import type { LoggerCommun } from './logger';

/** Cache des tickets adossé à la table `issue_cache`. */
export function adaptateurCacheTickets(store: Store): CacheTickets {
  return {
    async lire(cle) {
      const entree = await store.issueCache.read(cle);
      return entree ? { valeur: entree.issue, updatedAt: entree.updatedAt } : undefined;
    },
    async ecrire(cle, snapshot, now) {
      await store.issueCache.write({ issueKey: cle, issue: snapshot, updatedAt: now });
    },
  };
}

/**
 * Cache des incidents adossé à la table `service_incident`.
 *
 * La table est tenue par les événements Jira (§13.4) : elle fait foi, et son
 * horodatage est celui de la lecture. Le lecteur Jira reste branché pour le cas
 * où la table serait vide (installation neuve, aucun événement reçu).
 */
export function adaptateurCacheIncidents(store: Store, clock: HorlogeIso): CacheIncidents {
  return {
    async incidentsOuverts(service) {
      const incidents = await store.incidents.listOpen(service);
      if (incidents.length === 0) return undefined;
      return { valeur: incidents, updatedAt: clock() };
    },
  };
}

/** Dépendances du cache des tickets, prêtes à injecter. */
export function depsCacheTickets(store: Store, jira: IssueReader, clock: HorlogeIso, logger: LoggerCommun): DepsCacheTicket {
  return {
    now: clock,
    cache: adaptateurCacheTickets(store),
    lecteur: jira,
    journal: (message) => logger.warn(message),
  };
}

/** Dépendances du cache des incidents, prêtes à injecter. */
export function depsCacheIncidents(store: Store, jira: IssueReader, clock: HorlogeIso, logger: LoggerCommun): DepsCacheIncidents {
  return {
    now: clock,
    cache: adaptateurCacheIncidents(store, clock),
    lecteur: jira,
    journal: (message) => logger.warn(message),
  };
}
