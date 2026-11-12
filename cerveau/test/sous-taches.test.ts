/**
 * R-03, source « sous-tâches » (audit item 17) : le lecteur requête les
 * sous-tâches d'un ticket, les traduit en critères (une sous-tâche « Done » =
 * critère coché) et respecte le paramètre `source` de la règle.
 *
 * Aucune requête réelle : `requete` est une doublure qui rend le corps attendu
 * et enregistre les chemins demandés.
 */
import { describe, expect, it } from 'vitest';
import { createJiraReader, ErreurJira, type ReponseJira, type RequeteJira } from '../src/jira/reader';
import { jqlSousTaches, LISTE_CHAMPS_SOUS_TACHE } from '../src/jira/queries';

/** Corps renvoyé par la doublure pour une route (motif dans `route.value`). */
type Routes = Array<{ motif: RegExp; corps: unknown; status?: number }>;

/** Doublure de requête REST : rend le corps associé au chemin, enregistre les appels. */
function doublure(routes: Routes): { requete: RequeteJira; appels: string[] } {
  const appels: string[] = [];
  const requete: RequeteJira = async (chemin) => {
    const value = String((chemin as { value?: string }).value ?? chemin);
    appels.push(value);
    const trouve = routes.find((route) => route.motif.test(value));
    const status = trouve?.status ?? (trouve ? 200 : 404);
    const reponse: ReponseJira = {
      ok: status >= 200 && status < 300,
      status,
      json: async () => trouve?.corps,
    };
    return reponse;
  };
  return { requete, appels };
}

/** Instantané minimal d'un ticket dont la description porte des cases. */
const TICKET = {
  id: '10001',
  key: 'ABC-1',
  fields: {
    summary: 'Ticket',
    status: { name: 'En cours' },
    description: '- [ ] Case de la description',
    customfield_10200: [{ texte: 'Critère du champ', fait: false }],
  },
};

/** Réponse de recherche des sous-tâches : une « Done », une en cours. */
const SOUS_TACHES = {
  issues: [
    { key: 'ABC-2', fields: { summary: 'Migrer la table', status: { name: 'Terminé', statusCategory: { key: 'done' } } } },
    { key: 'ABC-3', fields: { summary: 'Écrire la doc', status: { name: 'En cours', statusCategory: { key: 'indeterminate' } } } },
  ],
};

const ROUTE_TICKET = { motif: /^\/rest\/api\/3\/issue\/ABC-1/, corps: TICKET };
const ROUTE_SOUS_TACHES = { motif: /^\/rest\/api\/3\/search\/jql/, corps: SOUS_TACHES };

describe('jqlSousTaches', () => {
  it('cherche les enfants du ticket, dans l’ordre de création', () => {
    expect(jqlSousTaches('ABC-1')).toBe('parent = "ABC-1" ORDER BY created ASC');
  });

  it('échappe les guillemets d’une clé exotique', () => {
    expect(jqlSousTaches('A"1')).toBe('parent = "A\\"1" ORDER BY created ASC');
  });
});

describe('lecteur : sous-tâches d’un ticket', () => {
  it('requête les sous-tâches et traduit « Done » en critère coché', async () => {
    const { requete, appels } = doublure([ROUTE_SOUS_TACHES]);
    const lecteur = createJiraReader({ requete });
    const criteres = await lecteur.sousTaches?.('ABC-1');
    expect(criteres).toEqual([
      { text: 'Migrer la table', done: true },
      { text: 'Écrire la doc', done: false },
    ]);
    expect(appels).toHaveLength(1);
    expect(appels[0]).toContain('parent%20%3D%20%22ABC-1%22');
    expect(appels[0]).toContain(`fields=${encodeURIComponent(LISTE_CHAMPS_SOUS_TACHE)}`);
  });

  it('propage une erreur HTTP en ErreurJira', async () => {
    const { requete } = doublure([{ motif: /search\/jql/, corps: {}, status: 500 }]);
    const lecteur = createJiraReader({ requete });
    await expect(lecteur.sousTaches?.('ABC-1')).rejects.toThrow(ErreurJira);
  });
});

describe('lecteur : respect du paramètre source de R-03', () => {
  it('source « subtasks » : requête dédiée, la description est ignorée', async () => {
    const { requete, appels } = doublure([ROUTE_TICKET, ROUTE_SOUS_TACHES]);
    const lecteur = createJiraReader({ requete, sourceCriteres: 'subtasks' });
    const ticket = await lecteur.lire('ABC-1');
    expect(ticket.criteria).toEqual([
      { text: 'Migrer la table', done: true },
      { text: 'Écrire la doc', done: false },
    ]);
    expect(appels.filter((appel) => appel.includes('search/jql'))).toHaveLength(1);
  });

  it('source « customfield » : seul le champ personnalisé est lu', async () => {
    const { requete, appels } = doublure([ROUTE_TICKET, ROUTE_SOUS_TACHES]);
    const lecteur = createJiraReader({
      requete,
      sourceCriteres: 'customfield',
      champs: { criteres: 'customfield_10200' },
    });
    const ticket = await lecteur.lire('ABC-1');
    expect(ticket.criteria).toEqual([{ text: 'Critère du champ', done: false }]);
    expect(appels.filter((appel) => appel.includes('search/jql'))).toHaveLength(0);
  });

  it('source « description-checkboxes » : seules les cases sont lues', async () => {
    const { requete } = doublure([ROUTE_TICKET, ROUTE_SOUS_TACHES]);
    const lecteur = createJiraReader({ requete, sourceCriteres: 'description-checkboxes' });
    const ticket = await lecteur.lire('ABC-1');
    expect(ticket.criteria).toEqual([{ text: 'Case de la description', done: false }]);
  });

  it('sans source imposée : cascade historique, aucune requête de sous-tâches', async () => {
    const { requete, appels } = doublure([ROUTE_TICKET, ROUTE_SOUS_TACHES]);
    const lecteur = createJiraReader({ requete });
    const ticket = await lecteur.lire('ABC-1');
    expect(ticket.criteria).toEqual([{ text: 'Case de la description', done: false }]);
    expect(appels.filter((appel) => appel.includes('search/jql'))).toHaveLength(0);
  });

  it('ticket absent (404) : aucune requête de sous-tâches, exists: false', async () => {
    const { requete, appels } = doublure([ROUTE_SOUS_TACHES]);
    const lecteur = createJiraReader({ requete, sourceCriteres: 'subtasks' });
    const ticket = await lecteur.lire('ABC-1');
    expect(ticket.exists).toBe(false);
    expect(appels.filter((appel) => appel.includes('search/jql'))).toHaveLength(0);
  });
});
