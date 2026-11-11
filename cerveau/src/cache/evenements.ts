/**
 * Événement Jira → caches (audit item 31, §13.4).
 *
 * Logique pure : extraire ce que l'événement porte (clé, type du ticket) et
 * décider quels services voient leur cache d'incidents rafraîchi. L'écriture
 * réelle (Jira, stockage) est orchestrée par `app/cache-adaptateurs.ts`.
 */
import type { Incident, IssueContext } from '../shared';

/** Ce qu'un événement Jira porte d'utile aux caches. */
export interface EvenementTicket {
  cle?: string;
  typeTicket?: string;
}

type Noeud = Record<string, unknown> | undefined;

/** Nœud objet ou `undefined` : les événements Jira arrivent en JSON brut. */
function objet(valeur: unknown): Noeud {
  return valeur && typeof valeur === 'object' ? (valeur as Noeud) : undefined;
}

/** Chaîne non vide, ou `undefined`. */
function texte(valeur: unknown): string | undefined {
  return typeof valeur === 'string' && valeur.length > 0 ? valeur : undefined;
}

/** Clé et type du ticket portés par un événement Jira (`jira:issue_*`). */
export function evenementDepuisJira(event: unknown): EvenementTicket {
  const issue = objet(objet(event)?.issue);
  const issuetype = objet(objet(issue?.fields)?.issuetype);
  return { cle: texte(issue?.key), typeTicket: texte(issuetype?.name) };
}

/** Vrai si le ticket est lui-même un incident : type déclaré ou clé connue. */
export function estUnIncident(
  cle: string,
  typeTicket: string | undefined,
  incidentsConnus: readonly Incident[],
): boolean {
  if (typeTicket !== undefined && /incident/i.test(typeTicket)) return true;
  return incidentsConnus.some((incident) => incident.incidentKey === cle);
}

/**
 * Services dont le cache d'incidents doit être rafraîchi après un événement.
 *
 * - ticket de type incident : les services qu'il porte (ses composants Jira,
 *   même heuristique que le lecteur Jira) et ceux déjà connus de la table ;
 * - ticket lié à un incident : les services de ces incidents, d'après la
 *   table. Un incident inconnu de la table ne désigne aucun service : la
 *   table vide fait alors déjà relire Jira, il n'y a rien à rafraîchir.
 */
export function servicesConcernes(
  cle: string,
  typeTicket: string | undefined,
  ticket: IssueContext | undefined,
  incidentsConnus: readonly Incident[],
): string[] {
  const services = new Set<string>();
  if (estUnIncident(cle, typeTicket, incidentsConnus)) {
    for (const composant of ticket?.components ?? []) services.add(composant);
    for (const incident of incidentsConnus) {
      if (incident.incidentKey === cle) services.add(incident.service);
    }
  }
  for (const cleIncident of ticket?.incidentKeys ?? []) {
    for (const incident of incidentsConnus) {
      if (incident.incidentKey === cleIncident) services.add(incident.service);
    }
  }
  return [...services];
}
