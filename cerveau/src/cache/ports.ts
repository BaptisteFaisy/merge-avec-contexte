/**
 * Ports du cache du Cerveau : ce que le cache attend du stockage.
 *
 * Les implémentations vivent ailleurs (Forge SQL, mémoire pour les tests) :
 * ce fichier ne déclare que les contrats, pour que le cache reste testable
 * sans base ni réseau (§14 : tables `issue_cache` et `service_incident`).
 */
import type { Incident, IssueContext } from '../shared';

/**
 * Une entrée de cache : la valeur et l'instant de sa dernière écriture.
 *
 * `updatedAt` est une chaîne ISO 8601, comparée à l'horloge injectée pour
 * décider de la fraîcheur (§13.4 : 60 secondes).
 */
export interface EntreeCache<T> {
  valeur: T;
  updatedAt: string;
}

/** Cache des tickets (table `issue_cache`). */
export interface IssueCacheRepository {
  /** Dernier instantané connu du ticket, `undefined` si absent du cache. */
  lire(cle: string): Promise<EntreeCache<IssueContext> | undefined>;
  /** Écrit (ou remplace) l'instantané du ticket, horodaté par l'appelant. */
  ecrire(cle: string, snapshot: IssueContext, now: string): Promise<void>;
}

/** Cache des incidents par service (table `service_incident`). */
export interface IncidentRepository {
  /**
   * Incidents ouverts connus d'un service, avec l'instant de dernière mise à
   * jour du cache. La table est tenue par les événements Jira : lecture seule.
   */
  incidentsOuverts(service: string): Promise<EntreeCache<Incident[]> | undefined>;
  /**
   * Rafraîchit les incidents d'un service après un événement Jira (audit
   * item 31) : relit Jira et remet la table d'aplomb. Facultatif : un cache
   * de test peut s'en passer, l'invalidation devient alors un non-lieu.
   */
  invalider?(service: string): Promise<void>;
}
