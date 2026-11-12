/**
 * Requêtes Jira du Cerveau : chemins REST et JQL, en un seul endroit.
 *
 * Ce module n'exécute rien et n'importe rien de Forge : il ne rend que des
 * chaînes. Le lecteur (`reader.ts`) les enveloppe dans `route`, qui refuse un
 * paramètre de chemin contenant `/` — les littéraux `/rest/api/3/...` sont donc
 * écrits dans le lecteur et documentés ici.
 */

/** Chemin REST d'un ticket par clé. */
export const CHEMIN_TICKET = '/rest/api/3/issue';

/** Chemin REST de recherche JQL (remplace `/rest/api/3/search`, retiré). */
export const CHEMIN_RECHERCHE = '/rest/api/3/search/jql';

/** Champs lus sur un ticket : statut, critères, liens, versions, composants. */
export const CHAMPS_TICKET = [
  'summary',
  'status',
  'issuetype',
  'project',
  'description',
  'labels',
  'components',
  'fixVersions',
  'issuelinks',
  'subtasks',
] as const;

/** Liste prête pour le paramètre `fields=` (une seule requête par ticket). */
export const LISTE_CHAMPS_TICKET = CHAMPS_TICKET.join(',');

/** Champs lus sur un incident JSM ouvert. */
export const CHAMPS_INCIDENT = [
  'created',
  'resolutiondate',
  'status',
  'issuetype',
  'components',
  'project',
] as const;

/** Liste prête pour le paramètre `fields=` d'une recherche d'incidents. */
export const LISTE_CHAMPS_INCIDENT = CHAMPS_INCIDENT.join(',');

/** Champs lus sur une sous-tâche (R-03 : critères portés par les sous-tâches). */
export const CHAMPS_SOUS_TACHE = ['summary', 'status'] as const;

/** Liste prête pour le paramètre `fields=` d'une recherche de sous-tâches. */
export const LISTE_CHAMPS_SOUS_TACHE = CHAMPS_SOUS_TACHE.join(',');

/** Nombre de sous-tâches ramenées par recherche : au-delà, la liste est tronquée. */
export const MAX_SOUS_TACHES = 100;

/** Nombre d'incidents ramenés par recherche : au-delà, l'information est noyée. */
export const MAX_INCIDENTS = 50;

/** Échappe une valeur insérée dans une JQL entre guillemets doubles. */
export function echapperJql(valeur: string): string {
  return valeur.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Options de construction d'une recherche d'incidents. */
export interface OptionsIncidents {
  /** Id du champ personnalisé qui nomme le service (défaut : `service`). */
  champService?: string;
  /** Projets JSM surveillés ; vide = tous les projets du site. */
  projets?: string[];
}

/** JQL des incidents JSM non résolus d'un service (R-05). */
export function jqlIncidentsOuverts(service: string, options: OptionsIncidents = {}): string {
  const champ = options.champService ?? 'service';
  const clauses = ['issuetype = Incident', 'resolution = Unresolved'];
  if (options.projets && options.projets.length > 0) {
    clauses.push(`project in (${options.projets.map(echapperJql).join(', ')})`);
  }
  clauses.push(`"${champ}" = "${echapperJql(service)}"`);
  return `${clauses.join(' AND ')} ORDER BY created DESC`;
}

/** JQL des sous-tâches d'un ticket (critères d'acceptation, R-03). */
export function jqlSousTaches(cle: string): string {
  return `parent = "${echapperJql(cle)}" ORDER BY created ASC`;
}

/** JQL de lecture d'un ticket par clé (repli quand le chemin REST suffit mal). */
export function jqlTicket(cle: string): string {
  return `key = "${echapperJql(cle)}"`;
}
