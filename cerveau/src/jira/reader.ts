/**
 * Lecteur Jira du Cerveau — le seul module de ce lot qui touche à Forge.
 *
 * Un appel REST par ticket (`GET /rest/api/3/issue/{key}`), un par service
 * (`GET /rest/api/3/search/jql`), et — quand R-03 lit les critères dans les
 * sous-tâches (paramètre `source`) — une recherche dédiée des sous-tâches du
 * ticket. Le mapping vit dans `parse.ts` : ce fichier ne fait que poser la
 * requête, vérifier la réponse et déléguer.
 */
import api, { route } from '@forge/api';
import type { Route } from '@forge/api';
import type { AcceptanceCriterion, Incident, IssueContext } from '../shared';
import type { ChampsPersonnalises, SourceCriteres } from './parse';
import {
  issueInexistante,
  parseCriteresDepuisSousTaches,
  parseIncidents,
  parseIssue,
} from './parse';
import {
  LISTE_CHAMPS_INCIDENT,
  LISTE_CHAMPS_SOUS_TACHE,
  LISTE_CHAMPS_TICKET,
  MAX_INCIDENTS,
  MAX_SOUS_TACHES,
  jqlIncidentsOuverts,
  jqlSousTaches,
} from './queries';

/** Réponse REST minimale : ce que le lecteur sait exploiter. */
export interface ReponseJira {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

/** Exécute une requête REST Jira : `asApp()` en production, doublure en test. */
export type RequeteJira = (
  chemin: Route,
  init?: { headers?: Record<string, string> },
) => Promise<ReponseJira>;

/** Lectures Jira dont le cache et le moteur dépendent (§13.4). */
export interface IssueReader {
  /** Instantané d'un ticket ; `exists: false` si la clé est inconnue du site. */
  lire(cle: string): Promise<IssueContext>;
  /** Incidents JSM non résolus d'un service. */
  incidentsOuverts(service: string): Promise<Incident[]>;
  /**
   * Critères d'acceptation portés par les sous-tâches d'un ticket (R-03,
   * source `subtasks`) : une sous-tâche « Done » vaut critère coché. Facultatif
   * pour ne pas imposer la requête aux lecteurs qui n'en ont pas l'usage.
   */
  sousTaches?(cle: string): Promise<AcceptanceCriterion[]>;
}

/** Dépendances du lecteur : tout ce qui sort de la machine est injecté. */
export interface DepsLecteurJira {
  /** Requête REST ; par défaut `api.asApp().requestJira`. */
  requete?: RequeteJira;
  /** Base du site, pour l'URL des tickets. */
  baseUrl?: string;
  /** Champs personnalisés porteurs des signaux du ticket. */
  champs?: ChampsPersonnalises;
  /** Étiquette valant exigence de revue de sécurité. */
  etiquetteRevueSecurite?: string;
  /** Projets JSM surveillés (R-05) ; vide = tous. */
  projetsIncidents?: string[];
  /**
   * Source des critères d'acceptation imposée par R-03 (paramètre `source`).
   * Sur `subtasks`, `lire` requiert les sous-tâches du ticket et n'en lit pas
   * d'autre source.
   */
  sourceCriteres?: SourceCriteres;
}

/** Requête REST par défaut : l'app elle-même, jamais l'utilisateur. */
const requeteParDefaut: RequeteJira = (chemin, init) => api.asApp().requestJira(chemin, init);

/** Erreur de lecture Jira, porteuse du statut HTTP (le cache journalise, il ne lève pas). */
export class ErreurJira extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ErreurJira';
  }
}

/**
 * Sous-tâches d'un ticket, requêtées par JQL (`parent = <clé>`).
 *
 * L'instantané du ticket (`fields.subtasks`) ne porte pas toujours le statut de
 * chaque sous-tâche : la recherche dédiée demande `summary` et `status`, seuls
 * champs dont R-03 a besoin pour décider qu'une sous-tâche « Done » est un
 * critère coché. Rend le corps brut ; l'analyse vit dans `parse.ts`.
 */
async function requeteSousTaches(requete: RequeteJira, cle: string): Promise<unknown> {
  const jql = jqlSousTaches(cle);
  const chemin = route`/rest/api/3/search/jql?jql=${jql}&fields=${LISTE_CHAMPS_SOUS_TACHE}&maxResults=${MAX_SOUS_TACHES}`;
  const reponse = await requete(chemin);
  if (!reponse.ok) {
    throw new ErreurJira(`recherche des sous-tâches de ${cle} refusée (HTTP ${reponse.status})`, reponse.status);
  }
  return reponse.json();
}

/** Lit un ticket et le mappe ; 404 = ticket inexistant, pas une panne. */
async function lireTicket(
  requete: RequeteJira,
  cle: string,
  options: Parameters<typeof parseIssue>[1],
): Promise<IssueContext> {
  const reponse = await requete(route`/rest/api/3/issue/${cle}?fields=${LISTE_CHAMPS_TICKET}`);
  if (reponse.status === 404) return issueInexistante(cle, options);
  if (!reponse.ok) {
    throw new ErreurJira(`lecture du ticket ${cle} refusée (HTTP ${reponse.status})`, reponse.status);
  }
  const brut = await reponse.json();
  const sousTaches = options?.sourceCriteres === 'subtasks'
    ? await requeteSousTaches(requete, cle)
    : undefined;
  return parseIssue(brut, { ...options, sousTaches });
}

/** Lit les incidents ouverts d'un service ; le service demandé fait foi. */
async function lireIncidents(
  requete: RequeteJira,
  service: string,
  deps: DepsLecteurJira,
): Promise<Incident[]> {
  const jql = jqlIncidentsOuverts(service, {
    champService: deps.champs?.service,
    projets: deps.projetsIncidents,
  });
  const chemin = route`/rest/api/3/search/jql?jql=${jql}&fields=${LISTE_CHAMPS_INCIDENT}&maxResults=${MAX_INCIDENTS}`;
  const reponse = await requete(chemin);
  if (!reponse.ok) {
    throw new ErreurJira(`recherche d'incidents refusée (HTTP ${reponse.status})`, reponse.status);
  }
  return parseIncidents(await reponse.json(), deps.champs?.service).map((incident) => ({
    ...incident,
    service: incident.service.length > 0 ? incident.service : service,
  }));
}

/** Construit le lecteur Jira du Cerveau. */
export function createJiraReader(deps: DepsLecteurJira = {}): IssueReader {
  const requete = deps.requete ?? requeteParDefaut;
  const options = {
    champs: deps.champs,
    etiquetteRevueSecurite: deps.etiquetteRevueSecurite,
    baseUrl: deps.baseUrl,
    sourceCriteres: deps.sourceCriteres,
  };
  return {
    lire: (cle) => lireTicket(requete, cle, options),
    incidentsOuverts: (service) => lireIncidents(requete, service, deps),
    sousTaches: async (cle) => parseCriteresDepuisSousTaches(await requeteSousTaches(requete, cle)),
  };
}
