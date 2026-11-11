/**
 * Ports du Teamwork Graph (§8, source n°2 de la correspondance dépôt → service).
 *
 * R-05 (incidents du service) et R-10 (équipe propriétaire) ont besoin de
 * savoir quel service un dépôt alimente, et quelle équipe possède ce service.
 * Le cahier des charges prévoit deux sources, dans l'ordre : la table de
 * correspondance des réglages, puis les relations du Teamwork Graph entre
 * service, dépôt, composant et équipe.
 *
 * Ce fichier ne définit que des contrats : aucune lecture réelle ici
 * (l'adaptateur Forge vit dans `forge-graph.ts`, la doublure dans
 * `memoire.ts`), et la priorité entre les deux sources est décidée par la
 * logique pure de `resolution.ts` (docs/CONVENTIONS.md §1).
 */

/** Une équipe propriétaire, telle que le graphe la décrit. */
export interface TeamworkTeam {
  /** Identifiant de l'équipe dans le graphe. */
  id: string;
  /** Nom affiché, utilisé comme nom d'équipe par R-10. */
  name: string;
  /** Comptes Atlassian des membres : ce que R-10 compare aux relecteurs. */
  memberAccountIds: string[];
}

/**
 * Relations lues pour un dépôt ou pour un service.
 *
 * Tout champ est optionnel : le graphe peut ne porter que le service, ou que
 * l'équipe. Une absence vaut « inconnu », jamais « aucun ».
 */
export interface TeamworkRelations {
  /** Service alimenté par le dépôt. */
  service?: string;
  /** Composant Jira rattaché au service. */
  component?: string;
  /** Équipe propriétaire du service ou du composant. */
  team?: TeamworkTeam;
}

/** Lecture du Teamwork Graph : deux entrées, aucune écriture. */
export interface TeamworkGraphReader {
  /** Relations d'un dépôt (nom ou identifiant) : service, composant, équipe. */
  relationsForRepository(repository: string): Promise<TeamworkRelations>;
  /** Relations d'un service : composant et équipe propriétaire. */
  relationsForService(service: string): Promise<TeamworkRelations>;
}

/** Relations vides : ce que rend un graphe muet ou injoignable. */
export function relationsVides(): TeamworkRelations {
  return {};
}

/** Lecteur qui ne trouve jamais rien : repli documenté, jamais d'exception. */
export function lecteurTeamworkVide(): TeamworkGraphReader {
  return {
    async relationsForRepository() {
      return relationsVides();
    },
    async relationsForService() {
      return relationsVides();
    },
  };
}

/** Vrai si les relations portent au moins une information exploitable. */
export function relationsExploitables(relations: TeamworkRelations): boolean {
  return relations.service !== undefined
    || relations.component !== undefined
    || relations.team !== undefined;
}
