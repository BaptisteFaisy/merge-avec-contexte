/**
 * Cache des incidents par service (R-05, §13.4).
 *
 * La table `service_incident` est tenue par les événements Jira : le cache la
 * lit, et ne relit Jira que si la dernière mise à jour date de plus de
 * 60 secondes. `serviceIncidentOuvert` répond ensuite à la seule question de
 * la règle : y a-t-il, à cet instant, un incident ouvert sur ce service ?
 */
import type { Incident } from '../shared';
import { TTL_MS, estFrais, journaliser, messageErreur } from './issue-cache';
import type { DepsHorloge } from './issue-cache';
import type { IncidentRepository } from './ports';

/** Lecture directe des incidents d'un service (le lecteur Jira la fournit). */
export interface LecteurIncidents {
  incidentsOuverts(service: string): Promise<Incident[]>;
}

/** Dépendances du cache des incidents. */
export interface DepsCacheIncidents extends DepsHorloge {
  cache: IncidentRepository;
  lecteur: LecteurIncidents;
}

/** Incidents ouverts d'un service : cache frais, sinon Jira, jamais d'exception. */
export async function incidentsDuService(
  service: string,
  deps: DepsCacheIncidents,
): Promise<Incident[] | undefined> {
  const ttl = deps.ttlMs ?? TTL_MS;
  const now = deps.now();
  let entree: { valeur: Incident[]; updatedAt: string } | undefined;
  try {
    entree = await deps.cache.incidentsOuverts(service);
  } catch (erreur) {
    journaliser(deps, `cache ${service} : incidents illisibles (${messageErreur(erreur)})`);
  }
  if (entree && estFrais(entree.updatedAt, now, ttl)) return entree.valeur;
  try {
    return await deps.lecteur.incidentsOuverts(service);
  } catch (erreur) {
    journaliser(deps, `service ${service} : recherche Jira impossible (${messageErreur(erreur)})`);
    return entree?.valeur;
  }
}

/**
 * Rafraîchit le cache des incidents d'un service après un événement Jira
 * (audit item 31, §13.4) : sans cet appel, un incident clos ou ouvert côté
 * Jira reste invisible jusqu'à ce que la table soit remise à jour autrement.
 * Ne lève jamais : un échec est journalisé, la prochaine lecture réessaiera.
 */
export async function invaliderIncidents(service: string, deps: DepsCacheIncidents): Promise<void> {
  if (!deps.cache.invalider) return;
  try {
    await deps.cache.invalider(service);
  } catch (erreur) {
    journaliser(deps, `cache ${service} : rafraîchissement impossible (${messageErreur(erreur)})`);
  }
}

/**
 * Vrai si un incident du service est ouvert à l'instant `now`.
 *
 * Ouvert = commencé (`openedAt` passé) et pas encore résolu ; un incident
 * résolu dans le futur est encore ouvert.
 */
export function serviceIncidentOuvert(
  incidents: readonly Incident[],
  service: string,
  now: string,
): boolean {
  const instant = Date.parse(now);
  if (Number.isNaN(instant)) return false;
  return incidents.some((incident) => {
    if (incident.service !== service) return false;
    const ouvert = Date.parse(incident.openedAt);
    if (Number.isNaN(ouvert) || ouvert > instant) return false;
    if (incident.resolvedAt === undefined) return true;
    const resolu = Date.parse(incident.resolvedAt);
    return Number.isNaN(resolu) || resolu > instant;
  });
}
