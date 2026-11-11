/**
 * Adaptateurs entre le stockage (§14, tables `issue_cache` et
 * `service_incident`) et les ports du cache (`cache/ports.ts`).
 *
 * Les deux couches ont été écrites séparément : le cache parle `lire`/`ecrire`
 * et d'entrées horodatées, le stockage parle `read`/`write` et d'entrées
 * `IssueCacheEntry`. On traduit ici, une seule fois.
 */
import type { DepsCacheTicket } from '../cache/issue-cache';
import { invalider, lireTicket } from '../cache/issue-cache';
import type { DepsCacheIncidents } from '../cache/service-cache';
import { invaliderIncidents } from '../cache/service-cache';
import { evenementDepuisJira, servicesConcernes } from '../cache/evenements';
import type { IncidentRepository as CacheIncidents, IssueCacheRepository as CacheTickets } from '../cache/ports';
import type { IssueReader } from '../jira/reader';
import type { Store } from '../storage/ports';
import type { Incident, IssueContext } from '../shared';
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
 * où la table serait vide (installation neuve, aucun événement reçu), et pour
 * remettre la table d'aplomb à chaque événement (`invalider`, audit item 31).
 */
export function adaptateurCacheIncidents(store: Store, jira: IssueReader, clock: HorlogeIso): CacheIncidents {
  return {
    async incidentsOuverts(service) {
      const incidents = await store.incidents.listOpen(service);
      if (incidents.length === 0) return undefined;
      return { valeur: incidents, updatedAt: clock() };
    },
    async invalider(service) {
      const frais = await jira.incidentsOuverts(service);
      const connus = await store.incidents.listOpen(service);
      for (const incident of frais) await store.incidents.open(incident);
      for (const connu of connus) {
        const encoreOuvert = frais.some((incident) => incident.incidentKey === connu.incidentKey);
        if (!encoreOuvert) await store.incidents.resolve(service, connu.incidentKey, clock());
      }
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
    cache: adaptateurCacheIncidents(store, jira, clock),
    lecteur: jira,
    journal: (message) => logger.warn(message),
  };
}

/** Ce dont l'invalidation par événement a besoin : l'assemblage de `compose`. */
export interface DepsEvenement {
  store: Store;
  jira: IssueReader;
  clock: HorlogeIso;
  logger: LoggerCommun;
}

/**
 * Invalide les caches touchés par un événement Jira (audit item 31, §13.4) :
 * le ticket d'abord (puis relecture, qui réécrit l'instantané et suit un
 * éventuel déplacement), ensuite les incidents des services concernés quand
 * le ticket est un incident ou y est lié. Ne lève jamais vers Forge.
 */
export async function invaliderPourEvenement(event: unknown, deps: DepsEvenement): Promise<void> {
  const { cle, typeTicket } = evenementDepuisJira(event);
  if (cle === undefined) return;
  const tickets = depsCacheTickets(deps.store, deps.jira, deps.clock, deps.logger);
  await invalider(cle, tickets);
  const ticket: IssueContext | undefined = await lireTicket(cle, tickets);
  let connus: Incident[] = [];
  try {
    connus = await deps.store.incidents.listOpenAll();
  } catch (erreur) {
    deps.logger.warn(`événement ${cle} : table des incidents illisible (${String(erreur)})`);
  }
  const cache = depsCacheIncidents(deps.store, deps.jira, deps.clock, deps.logger);
  for (const service of servicesConcernes(cle, typeTicket, ticket, connus)) {
    await invaliderIncidents(service, cache);
  }
}
