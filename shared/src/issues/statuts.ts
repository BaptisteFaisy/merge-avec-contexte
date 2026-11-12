/**
 * Comparaison de statuts, indépendante de la langue du site.
 *
 * Un statut Jira se désigne de trois façons : sa catégorie (`toDo`,
 * `inProgress`, `done`), son identifiant dans le site (`3`, `10001`) et son
 * nom affiché (« In Progress », « En cours »). Les deux premiers ne dépendent
 * pas de la langue : les règles qui comparent des statuts s'appuient donc
 * dessus, et le nom reste accepté pour que les réglages déjà en place
 * (listes de noms) continuent de fonctionner.
 *
 * Le nom, lui, se compare après traduction : « En cours » et « In Progress »
 * désignent le même statut. Sans cela, une liste mémorisée en français bloque
 * tout ticket d'un site anglais — le défaut relevé en production.
 */
import type { IssueContext, IssueLink, StatusCategory } from '../types';
import { normaliserLibelle } from './libelles';

/** Identifiants d'un statut Jira : catégorie, identifiant, nom affiché. */
export interface IdentifiantsStatut {
  /** Catégorie Jira : stable d'un site à l'autre, quelle que soit la langue. */
  categorie?: StatusCategory;
  /** Identifiant du statut dans le site : stable, mais propre au site. */
  id?: string;
  /** Nom affiché du statut : dépend de la langue du site. */
  nom?: string;
}

/** Identifiants du statut d'un ticket. */
export function identifiantsTicket(ticket: IssueContext): IdentifiantsStatut {
  return { categorie: ticket.statusCategory, id: ticket.statusId, nom: ticket.status };
}

/** Identifiants du statut de la cible d'un lien. */
export function identifiantsLien(lien: IssueLink): IdentifiantsStatut {
  return { categorie: lien.targetStatusCategory, id: lien.targetStatusId, nom: lien.targetStatus };
}

/**
 * Clé Jira de chaque catégorie du contrat.
 *
 * Un réglage peut nommer la catégorie comme le contrat l'écrit (`inProgress`)
 * ou comme Jira l'écrit (`indeterminate`) : les deux sont acceptés.
 */
const CLE_JIRA: Record<StatusCategory, string> = {
  toDo: 'new',
  inProgress: 'indeterminate',
  done: 'done',
};

/**
 * Catégories acceptées comme élément de liste blanche.
 *
 * L'écriture est celle du contrat (`toDo`, `inProgress`, `done`) ou celle de
 * Jira (`new`, `indeterminate`) : ces mots-là désignent une famille de
 * statuts, pas un statut nommé.
 */
const CATEGORIES_ENTREE: Record<string, StatusCategory> = {
  todo: 'toDo',
  new: 'toDo',
  inprogress: 'inProgress',
  indeterminate: 'inProgress',
  done: 'done',
};

/** Un statut connu du vocabulaire Jira : sa clé canonique et sa catégorie. */
interface StatutConnu {
  /** Clé canonique, partagée par les traductions d'un même statut. */
  cle: string;
  /** Catégorie du statut, déduite du nom quand Jira ne la donne pas. */
  categorie?: StatusCategory;
}

/**
 * Le vocabulaire des statuts Jira, dans les deux langues du dépôt.
 *
 * Les deux écritures d'un même statut partagent une clé : « À faire » et
 * « To Do » sont le même statut, « En cours » et « In Progress » aussi. Un
 * nom inconnu garde son texte normalisé : il ne se confond alors avec aucun
 * autre statut.
 */
const VOCABULAIRE: Record<string, StatutConnu> = {
  'a faire': { cle: 'todo', categorie: 'toDo' },
  'to do': { cle: 'todo', categorie: 'toDo' },
  'en cours': { cle: 'encours', categorie: 'inProgress' },
  'in progress': { cle: 'encours', categorie: 'inProgress' },
  'en revue': { cle: 'enrevue', categorie: 'inProgress' },
  'in review': { cle: 'enrevue', categorie: 'inProgress' },
  'termine': { cle: 'termine', categorie: 'done' },
  'done': { cle: 'termine', categorie: 'done' },
  'ferme': { cle: 'ferme', categorie: 'done' },
  'closed': { cle: 'ferme', categorie: 'done' },
  'resolu': { cle: 'resolu', categorie: 'done' },
  'resolved': { cle: 'resolu', categorie: 'done' },
  'pret pour la livraison': { cle: 'pretlivraison', categorie: 'done' },
  'ready for release': { cle: 'pretlivraison', categorie: 'done' },
  'ready for delivery': { cle: 'pretlivraison', categorie: 'done' },
  'ouvert': { cle: 'ouvert', categorie: 'toDo' },
  'open': { cle: 'ouvert', categorie: 'toDo' },
  'bloque': { cle: 'bloque', categorie: 'inProgress' },
  'blocked': { cle: 'bloque', categorie: 'inProgress' },
  'suspendu': { cle: 'suspendu', categorie: 'toDo' },
  'on hold': { cle: 'suspendu', categorie: 'toDo' },
};

/**
 * Statuts autorisant la fusion par défaut (R-02).
 *
 * Ce sont des **catégories**, pas des noms : un statut « ouvert » ou « en
 * cours » passe, un statut « terminé » bloque, quelle que soit la langue du
 * site. Un administrateur peut remplacer cette liste par des noms de statuts,
 * des identifiants Jira ou des catégories.
 */
export const STATUTS_AUTORISES_PAR_DEFAUT = ['toDo', 'inProgress'];

/**
 * Normalise un nom de statut : minuscules, sans accents, sans parenthèses.
 *
 * « Terminé(e) » et « Terminé » se rejoignent ainsi.
 */
export function normaliserStatut(nom: string): string {
  return normaliserLibelle(nom.replace(/\s*\(e\)/gi, '').replace(/[()]/g, ''));
}

/** Clé canonique d'un nom de statut : « En cours » et « In Progress » : la même. */
export function cleStatut(nom: string): string {
  const normalise = normaliserStatut(nom);
  const connu = VOCABULAIRE[normalise];
  return `statut:${connu ? connu.cle : normalise}`;
}

/** Catégorie déductible d'un nom de statut, si ce nom est connu. */
export function categorieDeNom(nom: string): StatusCategory | undefined {
  return VOCABULAIRE[normaliserStatut(nom)]?.categorie;
}

/** Catégorie désignée par un élément de liste blanche, si c'en est une. */
export function categorieDEntree(element: string): StatusCategory | undefined {
  return CATEGORIES_ENTREE[element.trim().toLowerCase()];
}

/** Catégorie effective d'un statut : celle de Jira, sinon celle de son nom. */
export function categorieEffective(identifiants: IdentifiantsStatut): StatusCategory | undefined {
  return identifiants.categorie ?? categorieDeNom(identifiants.nom ?? '');
}

/** Valeurs comparables d'un statut : catégorie, identifiant, nom canonique. */
function valeursStatut(identifiants: IdentifiantsStatut): string[] {
  const valeurs: string[] = [];
  // La catégorie fait foi : celle de Jira quand elle est là, celle déduite
  // du nom sinon (« In Progress » → en cours), pour que le même réglage
  // vaille sur un site qui ne renvoie pas la catégorie.
  const categorie = categorieEffective(identifiants);
  if (categorie !== undefined) {
    valeurs.push(normaliserLibelle(categorie), normaliserLibelle(CLE_JIRA[categorie]));
  }
  const id = (identifiants.id ?? '').trim();
  if (id.length > 0) valeurs.push(id);
  const nom = identifiants.nom ?? '';
  if (nom.trim().length > 0) valeurs.push(normaliserLibelle(nom), cleStatut(nom));
  return valeurs;
}

/** Valeurs comparables d'une entrée de liste blanche. */
function valeursEntree(element: string): string[] {
  const brut = element.trim();
  if (brut.length === 0) return [];
  return [normaliserLibelle(brut), cleStatut(brut)];
}

/**
 * Vrai si une entrée de réglage désigne ce statut.
 *
 * L'entrée est comparée à la catégorie, à l'identifiant et au nom du statut ;
 * la comparaison du nom ignore la casse, les accents et la langue : « En
 * cours » et « In Progress » sont le même statut. Une liste de noms (réglages
 * existants) et une liste d'identifiants (catégorie ou id) marchent donc de
 * la même façon.
 */
export function statutCorrespond(identifiants: IdentifiantsStatut, entrees: readonly string[]): boolean {
  const valeurs = valeursStatut(identifiants);
  if (valeurs.length === 0) return false;
  return entrees.some((entree) => {
    const cibles = valeursEntree(entree);
    return cibles.length > 0 && cibles.some((cible) => valeurs.includes(cible));
  });
}

/**
 * Vrai si ce statut vaut livraison.
 *
 * La catégorie `done` fait foi : c'est elle qui dit, sur n'importe quel site
 * et dans n'importe quelle langue, que le travail est livré. Les statuts
 * nommés dans le réglage s'y ajoutent : ils couvrent les sites dont la
 * catégorie n'est pas lisible et les livraisons d'un circuit maison.
 */
export function statutLivre(identifiants: IdentifiantsStatut, entrees: readonly string[]): boolean {
  if (categorieEffective(identifiants) === 'done') return true;
  return statutCorrespond(identifiants, entrees);
}
