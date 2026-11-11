/**
 * Implémentation mémoire du `TeamworkGraphReader` : tests et démonstrations.
 *
 * Les relations sont des données, jamais des lectures : un test déclare ce que
 * le graphe contiendrait, et la résolution des deux sources du §8 s'exerce sans
 * Forge ni réseau (docs/CONVENTIONS.md §1).
 */
import type { TeamworkGraphReader, TeamworkRelations, TeamworkTeam } from './ports';

/** Une relation du graphe : dépôt, service, composant et équipe reliés. */
export interface RelationTeamwork {
  /** Dépôt alimenté (nom ou identifiant) ; absent = relation sans dépôt. */
  repository?: string;
  /** Service alimenté par le dépôt. */
  service?: string;
  /** Composant Jira rattaché au service. */
  component?: string;
  /** Équipe propriétaire du service ou du composant. */
  team?: TeamworkTeam;
}

/** Nom comparé sans casse ni espace : `Paiement API` vaut `paiement-api`. */
function normalise(valeur: string): string {
  return valeur.trim().toLowerCase();
}

/** Deux noms de dépôt équivalents, tolérance au préfixe d'espace ou de projet. */
export function memeDepot(attendu: string, recu: string): boolean {
  const a = normalise(attendu);
  const r = normalise(recu);
  if (a === '' || r === '') return false;
  return a === r || r.endsWith(`/${a}`) || a.endsWith(`/${r}`);
}

/** Vrai si la relation porte ce service (comparaison insensible à la casse). */
function memeService(attendu: string, recu: string | undefined): boolean {
  return recu !== undefined && normalise(attendu) === normalise(recu);
}

/** Relations d'une déclaration, sans clé `undefined` (sortie sérialisable). */
export function relationsDe(relation: RelationTeamwork): TeamworkRelations {
  const relations: TeamworkRelations = {};
  if (relation.service !== undefined) relations.service = relation.service;
  if (relation.component !== undefined) relations.component = relation.component;
  if (relation.team !== undefined) {
    relations.team = {
      id: relation.team.id,
      name: relation.team.name,
      memberAccountIds: [...relation.team.memberAccountIds],
    };
  }
  return relations;
}

/** Lecteur mémoire : première relation qui correspond, dans l'ordre déclaré. */
export function createMemoryTeamworkReader(relations: RelationTeamwork[] = []): TeamworkGraphReader {
  return {
    async relationsForRepository(repository) {
      const trouvee = relations.find(
        (relation) => relation.repository !== undefined && memeDepot(relation.repository, repository),
      );
      return trouvee ? relationsDe(trouvee) : {};
    },
    async relationsForService(service) {
      const trouvee = relations.find((relation) => memeService(service, relation.service));
      return trouvee ? relationsDe(trouvee) : {};
    },
  };
}
