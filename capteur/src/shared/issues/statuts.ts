/**
 * Comparaison de statuts, indépendante de la langue du site.
 *
 * Un statut Jira se désigne de trois façons : sa catégorie (`toDo`,
 * `inProgress`, `done`), son identifiant dans le site (`3`, `10001`) et son
 * nom affiché (« In Progress », « En cours »). Les deux premiers ne dépendent
 * pas de la langue : les règles qui comparent des statuts s'appuient donc
 * dessus, et le nom reste accepté pour que les réglages déjà en place
 * (listes de noms) continuent de fonctionner.
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

/** Identifiants non vides d'un statut, prêts à être comparés. */
function valeurs(identifiants: IdentifiantsStatut): string[] {
  const base = [identifiants.categorie, identifiants.id, identifiants.nom].filter(
    (valeur): valeur is string => typeof valeur === 'string' && valeur.length > 0,
  );
  if (identifiants.categorie === undefined) return base;
  return [...base, CLE_JIRA[identifiants.categorie]];
}

/**
 * Vrai si une entrée de réglage désigne ce statut.
 *
 * L'entrée est comparée à la catégorie, à l'identifiant et au nom du statut ;
 * la comparaison du nom ignore la casse et les accents. Une liste de noms
 * (réglages existants) et une liste d'identifiants (catégorie ou id) marchent
 * donc de la même façon.
 */
export function statutCorrespond(identifiants: IdentifiantsStatut, entrees: readonly string[]): boolean {
  const cibles = entrees.map(normaliserLibelle).filter((entree) => entree.length > 0);
  if (cibles.length === 0) return false;
  return valeurs(identifiants).some((valeur) => cibles.includes(normaliserLibelle(valeur)));
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
  if (identifiants.categorie === 'done') return true;
  return statutCorrespond(identifiants, entrees);
}
