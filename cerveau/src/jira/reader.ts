/**
 * Lecteur Jira du Cerveau — le seul module de ce lot qui touche à Forge.
 *
 * Un appel REST par ticket (`GET /rest/api/3/issue/{key}`), un par service
 * (`GET /rest/api/3/search/jql`). Le mapping vit dans `parse.ts` : ce fichier
 * ne fait que poser la requête, vérifier la réponse et déléguer.
 */
import api, { route } from '@forge/api';
import type { Route } from '@forge/api';
import type { Incident, IssueContext } from '../shared';
import type { ChampsPersonnalises } from './parse';
import { issueInexistante, parseIncidents, parseIssue } from './parse';
import {
  LISTE_CHAMPS_INCIDENT,
  LISTE_CHAMPS_TICKET,
  MAX_INCIDENTS,
  jqlIncidentsOuverts,
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
  return parseIssue(await reponse.json(), options);
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
  };
  return {
    lire: (cle) => lireTicket(requete, cle, options),
    incidentsOuverts: (service) => lireIncidents(requete, service, deps),
  };
}
