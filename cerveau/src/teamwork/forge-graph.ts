/**
 * Adaptateur Forge du Teamwork Graph — le seul module de ce lot qui importe
 * `@forge/*` (comme `jira/reader.ts` pour les lectures Jira).
 *
 * La lecture passe par `requestGraph` de `@forge/api` : l'app elle-même
 * (`asApp()`), jamais l'utilisateur — une action Rovo ou un contrôle de fusion
 * n'a pas d'utilisateur Atlassian associé.
 *
 * Le schéma du Teamwork Graph est en Preview : la forme exacte de la requête
 * est à valider sur le site de démonstration (§15, `docs/FORGE-API-NOTES.md`).
 * Pour que le produit ne dépende pas de cette forme, la normalisation
 * (`graph-normalisation.ts`) reconnaît les entités par leur type, et toute
 * réponse illisible rend des relations vides — le Cerveau continue alors avec
 * la seule table de réglages, comme avant.
 */
import api, { getAppContext } from '@forge/api';
import { normaliserRelations } from './graph-normalisation';
import { relationsVides } from './ports';
import type { TeamworkGraphReader, TeamworkRelations } from './ports';

/**
 * Relations d'un dépôt : service alimenté, composant et équipe propriétaire.
 *
 * `depth: 3` suit dépôt → service → composant → équipe. Si la forme exacte
 * diffère sur le site de démonstration, seule cette requête change : la
 * normalisation reste valable.
 */
export const REQUETE_DEPOT = `
query RelationsDepot($cle: String!) {
  entities(filter: { type: REPOSITORY, name: $cle }) {
    id
    name
    type
    relations(depth: 3) {
      id
      name
      type
      members {
        accountId
        displayName
      }
    }
  }
}`;

/** Relations d'un service : composant Jira et équipe propriétaire. */
export const REQUETE_SERVICE = `
query RelationsService($cle: String!) {
  entities(filter: { type: SERVICE, name: $cle }) {
    id
    name
    type
    relations(depth: 2) {
      id
      name
      type
      members {
        accountId
        displayName
      }
    }
  }
}`;

/** Vrai si l'appel s'exécute sur la plateforme Forge (pas en test, pas en CLI). */
function plateformeDisponible(): boolean {
  try {
    getAppContext();
    return true;
  } catch {
    return false;
  }
}

/** Une requête au graphe ; jamais d'exception vers l'appelant. */
async function interroger(requete: string, variables: Record<string, string>): Promise<TeamworkRelations> {
  if (!plateformeDisponible()) return relationsVides();
  try {
    const reponse = await api.asApp().requestGraph(requete, variables);
    if (!reponse.ok) return relationsVides();
    return normaliserRelations(await reponse.json());
  } catch {
    return relationsVides();
  }
}

/** Lecteur réel : le Teamwork Graph de l'installation Forge courante. */
export function createForgeTeamworkReader(): TeamworkGraphReader {
  return {
    async relationsForRepository(repository) {
      return interroger(REQUETE_DEPOT, { cle: repository });
    },
    async relationsForService(service) {
      return interroger(REQUETE_SERVICE, { cle: service });
    },
  };
}
