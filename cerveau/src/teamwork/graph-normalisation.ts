/**
 * Normalisation d'une réponse du Teamwork Graph — logique pure, aucun import
 * Forge : l'adaptateur qui pose la requête vit dans `forge-graph.ts`.
 *
 * Le schéma du graphe est jeune et peut bouger (chemins, noms de types). Plutôt
 * que de coller à une forme précise, la normalisation reconnaît les entités par
 * leur **type** et retient la première de chaque famille rencontrée dans la
 * réponse : service, composant, équipe. Une réponse vide, tronquée ou en erreur
 * rend des relations vides — jamais d'exception vers l'appelant.
 */
import type { TeamworkRelations, TeamworkTeam } from './ports';

/** Garde-fous d'un parcours de JSON inconnu : ni pile infinie, ni boucle. */
export const PROFONDEUR_MAX = 8;
export const NOEUDS_MAX = 600;

/** Clés candidates du type d'une entité, selon les formes du graphe. */
const CLES_TYPE = ['type', '__typename', 'entityType', 'kind'];
/** Clés candidates du nom d'une entité. */
const CLES_NOM = ['name', 'title', 'label', 'displayName', 'key'];
/** Clés candidates des membres d'une équipe. */
const CLES_MEMBRES = ['members', 'memberAccountIds', 'users', 'people', 'accounts'];
/** Clés candidates de l'identifiant de compte d'un membre. */
const CLES_COMPTE = ['accountId', 'account_id', 'id', 'key'];

/** Entités retenues pendant le parcours. */
interface Entites {
  service: string | undefined;
  component: string | undefined;
  team: TeamworkTeam | undefined;
}

/** État borné du parcours : entités, profondeur, objets déjà vus. */
interface Etat {
  entites: Entites;
  profondeur: number;
  vus: number;
  objets: Set<object>;
}

/** Vrai si la valeur est un objet simple, parcourable. */
function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur);
}

/** Première chaîne non vide portée par l'une des clés. */
function premiereChaine(noeud: Record<string, unknown>, cles: string[]): string | undefined {
  for (const cle of cles) {
    const valeur = noeud[cle];
    if (typeof valeur === 'string' && valeur.trim() !== '') return valeur.trim();
  }
  return undefined;
}

/** Type d'une entité, en minuscules : `Service`, `service`, `TEAM`… */
function typeDe(noeud: Record<string, unknown>): string {
  const brut = premiereChaine(noeud, CLES_TYPE);
  return brut === undefined ? '' : brut.toLowerCase();
}

/** Identifiant de compte d'un membre : chaîne nue ou objet portant un compte. */
function compteDe(membre: unknown): string | undefined {
  if (typeof membre === 'string' && membre.trim() !== '') return membre.trim();
  return estObjet(membre) ? premiereChaine(membre, CLES_COMPTE) : undefined;
}

/** Comptes des membres d'une équipe, tous champs candidats confondus. */
function membresDe(noeud: Record<string, unknown>): string[] {
  for (const cle of CLES_MEMBRES) {
    const brut = noeud[cle];
    if (!Array.isArray(brut)) continue;
    const comptes = brut.map(compteDe).filter((compte): compte is string => compte !== undefined);
    if (comptes.length > 0) return comptes;
  }
  return [];
}

/** Retient l'entité si sa famille n'a pas encore été trouvée. */
function retenir(noeud: Record<string, unknown>, entites: Entites): void {
  const type = typeDe(noeud);
  if (type === '') return;
  if (type.includes('service') && entites.service === undefined) {
    entites.service = premiereChaine(noeud, CLES_NOM);
    return;
  }
  if (type.includes('component') && entites.component === undefined) {
    entites.component = premiereChaine(noeud, CLES_NOM);
    return;
  }
  if (type.includes('team') && entites.team === undefined) {
    const membres = membresDe(noeud);
    if (membres.length === 0) return;
    const nom = premiereChaine(noeud, CLES_NOM) ?? '';
    entites.team = { id: premiereChaine(noeud, ['id']) ?? nom, name: nom, memberAccountIds: membres };
  }
}

/** Parcours borné en profondeur : chaque objet est vu au plus une fois. */
function parcourir(valeur: unknown, etat: Etat): void {
  if (etat.vus >= NOEUDS_MAX || etat.profondeur > PROFONDEUR_MAX) return;
  if (Array.isArray(valeur)) {
    for (const item of valeur) parcourir(item, etat);
    return;
  }
  if (!estObjet(valeur) || etat.objets.has(valeur)) return;
  etat.objets.add(valeur);
  etat.vus += 1;
  retenir(valeur, etat.entites);
  for (const sous of Object.values(valeur)) parcourir(sous, etat);
}

/** Racine utile d'une réponse GraphQL : le `data`, sinon la réponse entière. */
function racineDe(reponse: unknown): unknown {
  return estObjet(reponse) && 'data' in reponse ? reponse.data : reponse;
}

/** Réponse du graphe → relations exploitables, sans clé `undefined`. */
export function normaliserRelations(reponse: unknown): TeamworkRelations {
  const etat: Etat = {
    entites: { service: undefined, component: undefined, team: undefined },
    profondeur: 0,
    vus: 0,
    objets: new Set<object>(),
  };
  parcourir(racineDe(reponse), etat);
  const relations: TeamworkRelations = {};
  if (etat.entites.service !== undefined) relations.service = etat.entites.service;
  if (etat.entites.component !== undefined) relations.component = etat.entites.component;
  if (etat.entites.team !== undefined) relations.team = etat.entites.team;
  return relations;
}
