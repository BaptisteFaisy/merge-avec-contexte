/**
 * Analyse des réponses Jira — logique pure, sans le moindre import Forge.
 *
 * R-03 (« où lire les critères ») admet trois sources : les cases à cocher de
 * la description, un champ personnalisé, les sous-tâches. R-05 s'appuie sur
 * les incidents JSM liés au ticket. Rien n'est lu ici : le JSON brut de Jira
 * entre, un `IssueContext` sort.
 */
import type {
  AcceptanceCriterion,
  FixVersion,
  Incident,
  IssueContext,
} from '../shared';
import { cleIncident, parseLiens, statutLu } from './liens';

/** `cleIncident` reste exporté d'ici : ce module est la façade de l'analyse Jira. */
export { cleIncident };

/** Case à cocher markdown en début de ligne : `- [x]`, `* [ ]`, `1. [x]`, `+ [X]`. */
const CASE_A_COCHER = /^\s*(?:[-*+]|\d{1,3}[.)])\s+\[([ xX])\]\s*(.*)$/;

/** Titre markdown ou ADF converti : `# Critères d'acceptation`. */
const TITRE = /^\s{0,3}#{1,6}\s+\S/;

/**
 * Où R-03 lit les critères (§8, paramètre `source` de la règle).
 *
 * - `description-checkboxes` : les cases à cocher de la description ;
 * - `customfield` : le champ personnalisé `champs.criteres` ;
 * - `subtasks` : les sous-tâches du ticket (une sous-tâche « Done » = critère
 *   coché).
 *
 * Quand la source est imposée, on ne lit qu'elle : pas de repli silencieux sur
 * une autre source, qui masquerait un réglage incohérent. Sans source imposée
 * (`undefined`), on conserve la cascade historique description → champ →
 * sous-tâches.
 */
export type SourceCriteres = 'description-checkboxes' | 'customfield' | 'subtasks';

/** Options de lecture des critères d'acceptation. */
export interface OptionsCriteres {
  /** Ne garder que les cases situées sous un titre contenant ce texte. */
  sousTitre?: string;
  /** Conserver les cases sans libellé (faux par défaut : elles n'informent pas). */
  garderVides?: boolean;
}

/** Champs personnalisés qui portent les signaux du ticket (§8, R-09, R-12). */
export interface ChampsPersonnalises {
  /** Champ des critères d'acceptation (liste de `{texte, fait}` ou texte). */
  criteres?: string;
  /** Champ « revue de sécurité requise ». */
  revueSecurite?: string;
  /** Champ « revue de sécurité approuvée ». */
  approbationSecurite?: string;
  /** Champ « plan de retour arrière ». */
  planRetour?: string;
  /** Champ JSM qui nomme le service touché (R-05). */
  service?: string;
}

/** Options de `parseIssue`. */
export interface ParseIssueOptions {
  /** Ids des champs personnalisés à lire. */
  champs?: ChampsPersonnalises;
  /** Étiquette qui vaut à elle seule exigence de revue de sécurité. */
  etiquetteRevueSecurite?: string;
  /** Base du site (`https://exemple.atlassian.net`) pour construire `url`. */
  baseUrl?: string;
  /**
   * Source imposée par R-03 (paramètre `source`). Absente : cascade historique
   * description → champ → sous-tâches. Présente : on ne lit que cette source.
   */
  sourceCriteres?: SourceCriteres;
  /**
   * Sous-tâches déjà requêtées par le lecteur (source `subtasks`). Prime sur le
   * champ `subtasks` éventuellement présent dans l'instantané du ticket.
   */
  sousTaches?: ValeurJira;
}

/** Une valeur Jira qui porte du texte : chaîne, ADF, `{ value }` ou `{ name }`. */
type ValeurJira = unknown;

/** Nettoie un libellé : gras markdown, code inline, espaces multiples. */
function nettoyerTexte(texte: string): string {
  return texte
    .replace(/\*\*|__/g, '')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Texte d'un nœud ADF (les sauts de ligne comptent pour une espace). */
function texteAdf(noeud: unknown): string {
  if (Array.isArray(noeud)) return noeud.map(texteAdf).join('');
  if (!noeud || typeof noeud !== 'object') return '';
  const n = noeud as { type?: string; text?: string; content?: unknown };
  if (typeof n.text === 'string') return n.text;
  if (n.type === 'hardBreak') return ' ';
  return texteAdf(n.content);
}

/** Lignes markdown équivalentes d'un document ADF (`taskItem` → case à cocher). */
function lignesDepuisAdf(noeud: unknown, sortie: string[]): string[] {
  if (Array.isArray(noeud)) {
    for (const enfant of noeud) lignesDepuisAdf(enfant, sortie);
    return sortie;
  }
  if (!noeud || typeof noeud !== 'object') return sortie;
  const n = noeud as { type?: string; content?: unknown; attrs?: { state?: string; level?: number } };
  if (n.type === 'taskItem') {
    const coche = n.attrs?.state === 'DONE' ? 'x' : ' ';
    sortie.push(`- [${coche}] ${texteAdf(n.content)}`);
    return sortie;
  }
  if (n.type === 'heading') {
    const niveau = Math.min(6, Math.max(1, n.attrs?.level ?? 1));
    sortie.push(`${'#'.repeat(niveau)} ${texteAdf(n.content)}`);
    return sortie;
  }
  if (n.type === 'paragraph') {
    sortie.push(texteAdf(n.content));
    return sortie;
  }
  if (Array.isArray(n.content)) return lignesDepuisAdf(n.content, sortie);
  return sortie;
}

/** Description Jira (texte markdown ou ADF) ramenée à des lignes. */
export function lignesDepuisDescription(description: unknown): string[] {
  if (typeof description === 'string') return description.split(/\r?\n/);
  if (description && typeof description === 'object') return lignesDepuisAdf(description, []);
  return [];
}

/** Restreint les lignes à la section ouverte par le premier titre qui la nomme. */
function bornerSection(lignes: string[], sousTitre?: string): string[] {
  if (!sousTitre) return lignes;
  const cible = sousTitre.toLowerCase();
  const debut = lignes.findIndex((ligne) => TITRE.test(ligne) && ligne.toLowerCase().includes(cible));
  if (debut < 0) return lignes;
  const suite = lignes.slice(debut + 1);
  const fin = suite.findIndex((ligne) => TITRE.test(ligne));
  return fin < 0 ? suite : suite.slice(0, fin);
}

/**
 * Critères d'acceptation lus dans une description Jira.
 *
 * Toutes les formes de case sont tolérées (`- [x]`, `* [ ]`, `1. [x]`,
 * `+ [X]`), avec espaces et gras markdown autour du libellé.
 */
export function parseCriteres(
  description: unknown,
  options: OptionsCriteres = {},
): AcceptanceCriterion[] {
  const lignes = bornerSection(lignesDepuisDescription(description), options.sousTitre);
  const criteres: AcceptanceCriterion[] = [];
  for (const ligne of lignes) {
    const trouve = CASE_A_COCHER.exec(ligne);
    if (!trouve) continue;
    const texte = nettoyerTexte(trouve[2] ?? '');
    if (texte.length === 0 && options.garderVides !== true) continue;
    criteres.push({ text: texte, done: (trouve[1] ?? '').toLowerCase() === 'x' });
  }
  return criteres;
}

/** Vrai si la valeur Jira vaut « oui » (booléen, libellé d'option, `{ value }`). */
function vautOui(valeur: ValeurJira): boolean {
  if (valeur === true) return true;
  if (typeof valeur === 'number') return valeur > 0;
  if (typeof valeur === 'string') return /^(oui|yes|true|done|approuv[ée]e?)$/i.test(valeur.trim());
  if (Array.isArray(valeur)) return valeur.some(vautOui);
  if (valeur && typeof valeur === 'object') {
    const n = valeur as { value?: unknown; name?: unknown; checked?: unknown };
    if (n.checked === true) return true;
    return vautOui(n.value) || vautOui(n.name);
  }
  return false;
}

/** Vrai si la valeur Jira porte quelque chose (texte non vide, ADF, pièce jointe). */
function estRenseigne(valeur: ValeurJira): boolean {
  if (valeur === undefined || valeur === null || valeur === false) return false;
  if (typeof valeur === 'string') return valeur.trim().length > 0;
  if (typeof valeur === 'number') return valeur > 0;
  if (Array.isArray(valeur)) return valeur.some(estRenseigne);
  if (typeof valeur === 'object') {
    const texte = texteAdf(valeur).trim();
    const n = valeur as { value?: unknown; name?: unknown; id?: unknown };
    return texte.length > 0 || estRenseigne(n.value) || estRenseigne(n.name) || estRenseigne(n.id);
  }
  return false;
}

/** Texte d'un champ de critères : ses cases, sinon la ligne entière comme un critère. */
function criteresDepuisTexte(valeur: string): AcceptanceCriterion[] {
  const cases = parseCriteres(valeur);
  if (cases.length > 0) return cases;
  const texte = nettoyerTexte(valeur);
  if (texte.length === 0 || /\r?\n/.test(valeur.trim())) return [];
  return [{ text: texte, done: false }];
}

/** Un champ personnalisé de critères : liste de `{texte, fait}`, texte, ou ADF. */
export function parseCriteresDepuisChamp(valeur: ValeurJira): AcceptanceCriterion[] {
  if (valeur === undefined || valeur === null) return [];
  if (typeof valeur === 'string') return criteresDepuisTexte(valeur);
  if (Array.isArray(valeur)) return valeur.flatMap((entree) => parseCriteresDepuisChamp(entree));
  if (typeof valeur !== 'object') return [];
  const n = valeur as {
    texte?: unknown;
    text?: unknown;
    fait?: unknown;
    done?: unknown;
    checked?: unknown;
    value?: unknown;
    content?: unknown;
  };
  if (n.content !== undefined && typeof n.content === 'object') return parseCriteres(valeur);
  const libelle = [n.texte, n.text, n.value].find((v) => typeof v === 'string');
  if (typeof libelle === 'string') {
    const texte = nettoyerTexte(libelle);
    if (texte.length === 0) return [];
    return [{ text: texte, done: vautOui(n.fait ?? n.done ?? n.checked) }];
  }
  return [];
}

/**
 * Critères lus dans les sous-tâches : libellé = résumé, fait = catégorie `done`.
 *
 * Accepte une liste brute de sous-tâches ou une réponse de recherche JQL
 * (`{ issues: [...] }`) : le lecteur passe le corps tel quel, l'analyse extrait.
 */
export function parseCriteresDepuisSousTaches(sousTaches: ValeurJira): AcceptanceCriterion[] {
  const brutes = Array.isArray(sousTaches)
    ? sousTaches
    : ((sousTaches as { issues?: unknown } | undefined)?.issues ?? undefined);
  if (!Array.isArray(brutes)) return [];
  const criteres: AcceptanceCriterion[] = [];
  for (const brute of brutes) {
    if (!brute || typeof brute !== 'object') continue;
    const tache = brute as {
      summary?: unknown;
      done?: unknown;
      fields?: { summary?: unknown; status?: { name?: unknown; statusCategory?: { key?: unknown } } };
    };
    const resume = tache.fields?.summary ?? tache.summary;
    if (typeof resume !== 'string' || resume.trim().length === 0) continue;
    const categorie = tache.fields?.status?.statusCategory?.key;
    const fait = typeof tache.done === 'boolean' ? tache.done : categorie === 'done';
    criteres.push({ text: nettoyerTexte(resume), done: fait });
  }
  return criteres;
}

/** Versions cibles, avec leur état de publication (R-07). */
function parseVersions(fixVersions: unknown): FixVersion[] {
  if (!Array.isArray(fixVersions)) return [];
  const versions: FixVersion[] = [];
  for (const brute of fixVersions) {
    if (!brute || typeof brute !== 'object') continue;
    const version = brute as { name?: unknown; released?: unknown };
    if (typeof version.name !== 'string' || version.name.length === 0) continue;
    versions.push({ name: version.name, released: version.released === true });
  }
  return versions;
}

/** Noms d'une liste Jira (`components`, `labels`) — chaînes ou objets nommés. */
function nomsDe(valeur: unknown): string[] {
  if (!Array.isArray(valeur)) return [];
  const noms: string[] = [];
  for (const entree of valeur) {
    if (typeof entree === 'string' && entree.length > 0) noms.push(entree);
    else if (entree && typeof entree === 'object') {
      const nom = (entree as { name?: unknown }).name;
      if (typeof nom === 'string' && nom.length > 0) noms.push(nom);
    }
  }
  return noms;
}

/** Critères du ticket : source imposée par R-03, ou cascade historique. */
function criteresDuTicket(
  description: unknown,
  champs: Record<string, unknown>,
  options: ParseIssueOptions,
): AcceptanceCriterion[] {
  const idChamp = options.champs?.criteres;
  const depuisSousTaches = () => parseCriteresDepuisSousTaches(options.sousTaches ?? champs.subtasks);
  switch (options.sourceCriteres) {
    case 'description-checkboxes':
      return parseCriteres(description);
    case 'customfield':
      return idChamp ? parseCriteresDepuisChamp(champs[idChamp]) : [];
    case 'subtasks':
      return depuisSousTaches();
  }
  const depuisDescription = parseCriteres(description);
  if (depuisDescription.length > 0) return depuisDescription;
  const depuisChamp = idChamp ? parseCriteresDepuisChamp(champs[idChamp]) : [];
  if (depuisChamp.length > 0) return depuisChamp;
  return depuisSousTaches();
}

/** Ticket absent du site jumelé : le contrat veut `exists: false`, pas une erreur. */
export function issueInexistante(cle: string, options: ParseIssueOptions = {}): IssueContext {
  return {
    key: cle,
    id: '',
    exists: false,
    status: '',
    criteria: [],
    links: [],
    fixVersions: [],
    labels: [],
    components: [],
    incidentKeys: [],
    url: options.baseUrl ? `${options.baseUrl.replace(/\/+$/, '')}/browse/${cle}` : undefined,
  };
}

/** URL du ticket sur le site jumelé. */
function urlDuTicket(cle: string, baseUrl?: string): string | undefined {
  if (!baseUrl) return undefined;
  return `${baseUrl.replace(/\/+$/, '')}/browse/${cle}`;
}

/** Instantané d'un ticket Jira brut (REST `GET /rest/api/3/issue/{key}`). */
export function parseIssue(brut: unknown, options: ParseIssueOptions = {}): IssueContext {
  const issue = (brut ?? {}) as {
    id?: unknown;
    key?: unknown;
    fields?: Record<string, unknown>;
  };
  const champs = (issue.fields ?? {}) as Record<string, unknown>;
  const cle = typeof issue.key === 'string' ? issue.key : '';
  const statut = statutLu(champs.status);
  const liens = parseLiens(champs.issuelinks);
  const etiquette = options.etiquetteRevueSecurite;
  const labels = nomsDe(champs.labels);
  const champsPerso = options.champs ?? {};
  const cleRevue = champsPerso.revueSecurite;
  const cleApprobation = champsPerso.approbationSecurite;
  const clePlan = champsPerso.planRetour;
  return {
    key: cle,
    id: typeof issue.id === 'string' ? issue.id : String(issue.id ?? ''),
    exists: true,
    status: statut.nom,
    statusId: statut.id,
    statusCategory: statut.categorie,
    summary: typeof champs.summary === 'string' ? champs.summary : undefined,
    criteria: criteresDuTicket(champs.description, champs, options),
    links: liens,
    fixVersions: parseVersions(champs.fixVersions),
    labels,
    components: nomsDe(champs.components),
    incidentKeys: [
      ...new Set(
        (Array.isArray(champs.issuelinks) ? champs.issuelinks : [])
          .map(cleIncident)
          .filter((v): v is string => typeof v === 'string'),
      ),
    ],
    securityReviewRequired:
      (cleRevue ? vautOui(champs[cleRevue]) : false) ||
      (etiquette !== undefined && labels.includes(etiquette)),
    securityReviewApproved: cleApprobation ? vautOui(champs[cleApprobation]) : undefined,
    rollbackPlanAttached: clePlan ? estRenseigne(champs[clePlan]) : undefined,
    url: urlDuTicket(cle, options.baseUrl),
  };
}

/** Service touché par un incident JSM : champ dédié, composant, puis projet. */
function serviceDe(fields: Record<string, unknown>, champService?: string): string {
  const candidats: unknown[] = [];
  if (champService) candidats.push(fields[champService]);
  candidats.push(fields.service, fields.components, fields.project);
  for (const candidat of candidats) {
    if (typeof candidat === 'string' && candidat.length > 0) return candidat;
    if (Array.isArray(candidat)) {
      const nom = nomsDe(candidat)[0];
      if (nom) return nom;
    }
    if (candidat && typeof candidat === 'object') {
      const objet = candidat as { value?: unknown; name?: unknown; key?: unknown };
      const nom = [objet.value, objet.name, objet.key].find(
        (v): v is string => typeof v === 'string' && v.length > 0,
      );
      if (nom) return nom;
    }
  }
  return '';
}

/** Incidents JSM d'une réponse de recherche (`issues[]`, éventuellement vide). */
export function parseIncidents(reponseJsm: unknown, champService?: string): Incident[] {
  const brut = Array.isArray(reponseJsm)
    ? reponseJsm
    : ((reponseJsm as { issues?: unknown } | undefined)?.issues ?? []);
  if (!Array.isArray(brut)) return [];
  const incidents: Incident[] = [];
  for (const entree of brut) {
    if (!entree || typeof entree !== 'object') continue;
    const issue = entree as { key?: unknown; fields?: Record<string, unknown> };
    if (typeof issue.key !== 'string' || issue.key.length === 0) continue;
    const champs = issue.fields ?? {};
    const ouvert = champs.created;
    const resolu = champs.resolutiondate;
    incidents.push({
      service: serviceDe(champs, champService),
      incidentKey: issue.key,
      openedAt: typeof ouvert === 'string' ? ouvert : '',
      resolvedAt: typeof resolu === 'string' && resolu.length > 0 ? resolu : undefined,
    });
  }
  return incidents;
}
