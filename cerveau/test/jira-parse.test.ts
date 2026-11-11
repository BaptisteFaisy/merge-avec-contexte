import { describe, expect, it } from 'vitest';
import {
  cleIncident,
  issueInexistante,
  parseCriteres,
  parseCriteresDepuisChamp,
  parseCriteresDepuisSousTaches,
  parseIncidents,
  parseIssue,
} from '../src/jira/parse';

/** Description markdown mêlant toutes les formes de case à cocher. */
const DESCRIPTION = [
  '## Contexte',
  'Rien à cocher ici.',
  '## Critères d’acceptation',
  '- [x] Le paiement passe en carte',
  '* [ ] **Le remboursement** est tracé',
  '1. [x] Les journaux sont lisibles',
  '+ [X]   La documentation est à jour   ',
  '- [ ]',
  '## Notes',
  '- [ ] Hors de la section',
].join('\n');

describe('parseCriteres', () => {
  it('lit les quatre formes de case et ignore le texte hors case', () => {
    const criteres = parseCriteres(DESCRIPTION);
    expect(criteres.map((c) => c.text)).toEqual([
      'Le paiement passe en carte',
      'Le remboursement est tracé',
      'Les journaux sont lisibles',
      'La documentation est à jour',
      'Hors de la section',
    ]);
    expect(criteres.map((c) => c.done)).toEqual([true, false, true, true, false]);
  });

  it('tolère le gras markdown et les espaces autour du libellé', () => {
    const [critere] = parseCriteres('- [ ]   **Critère** `technique`  ');
    expect(critere).toEqual({ text: 'Critère technique', done: false });
  });

  it('rend une liste vide pour une description sans case', () => {
    expect(parseCriteres('Une description en prose.\n- une puce simple')).toEqual([]);
    expect(parseCriteres(undefined)).toEqual([]);
  });

  it('borne la lecture à la section nommée', () => {
    const criteres = parseCriteres(DESCRIPTION, { sousTitre: 'critères' });
    expect(criteres.map((c) => c.text)).toEqual([
      'Le paiement passe en carte',
      'Le remboursement est tracé',
      'Les journaux sont lisibles',
      'La documentation est à jour',
    ]);
  });

  it('garde les cases sans libellé si on le demande', () => {
    const criteres = parseCriteres('- [x]', { garderVides: true });
    expect(criteres).toEqual([{ text: '', done: true }]);
  });

  it('lit aussi une description en ADF (taskItem DONE / TODO)', () => {
    const adf = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Critères' }] },
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { state: 'DONE' },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Le devis est signé' }] }],
            },
            {
              type: 'taskItem',
              attrs: { state: 'TODO' },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'La facture part' }] }],
            },
          ],
        },
      ],
    };
    expect(parseCriteres(adf)).toEqual([
      { text: 'Le devis est signé', done: true },
      { text: 'La facture part', done: false },
    ]);
  });
});

describe('parseCriteresDepuisChamp', () => {
  it('lit une liste de {texte, fait}', () => {
    expect(
      parseCriteresDepuisChamp([
        { texte: 'Relu par la sécurité', fait: true },
        { texte: 'Testé en recette', fait: false },
      ]),
    ).toEqual([
      { text: 'Relu par la sécurité', done: true },
      { text: 'Testé en recette', done: false },
    ]);
  });

  it('accepte les variantes de nommage et une simple liste de textes', () => {
    expect(parseCriteresDepuisChamp([{ text: 'A', done: true }, { text: 'B' }])).toEqual([
      { text: 'A', done: true },
      { text: 'B', done: false },
    ]);
    expect(parseCriteresDepuisChamp(['Un texte'])).toEqual([{ text: 'Un texte', done: false }]);
  });

  it('lit un champ texte comme une description', () => {
    expect(parseCriteresDepuisChamp('- [x] Fait\n- [ ] Reste')).toEqual([
      { text: 'Fait', done: true },
      { text: 'Reste', done: false },
    ]);
  });

  it('rend une liste vide pour un champ absent', () => {
    expect(parseCriteresDepuisChamp(undefined)).toEqual([]);
    expect(parseCriteresDepuisChamp(null)).toEqual([]);
  });
});

describe('parseCriteresDepuisSousTaches', () => {
  it('déduit « fait » de la catégorie de statut', () => {
    const sousTaches = [
      { key: 'ABC-2', fields: { summary: 'Migrer la table', status: { statusCategory: { key: 'done' } } } },
      { key: 'ABC-3', fields: { summary: 'Écrire la doc', status: { statusCategory: { key: 'inprogress' } } } },
    ];
    expect(parseCriteresDepuisSousTaches(sousTaches)).toEqual([
      { text: 'Migrer la table', done: true },
      { text: 'Écrire la doc', done: false },
    ]);
  });

  it('ignore les sous-tâches sans résumé et les formes inattendues', () => {
    expect(parseCriteresDepuisSousTaches([{ key: 'ABC-4' }, 'texte'])).toEqual([]);
    expect(parseCriteresDepuisSousTaches(undefined)).toEqual([]);
  });
});

/** Réponse REST d'un ticket : liens dans les deux sens, versions, incidents. */
const TICKET = {
  id: '10042',
  key: 'ABC-1',
  fields: {
    summary: 'Payer en trois fois',
    status: { name: 'En cours', statusCategory: { key: 'indeterminate' } },
    description: '- [x] Le paiement fractionné marche\n- [ ] La relance est testée',
    labels: ['paiement', 'revue-securite'],
    components: [{ name: 'api-paiement' }, { name: 'front' }],
    fixVersions: [
      { name: '2026.11', released: false },
      { name: '2026.10', released: true },
    ],
    issuelinks: [
      {
        type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
        outwardIssue: { key: 'ABC-7', fields: { status: { name: 'À faire' }, issuetype: { name: 'Story' } } },
      },
      {
        type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
        inwardIssue: { key: 'ABC-9', fields: { status: { name: 'Terminé' }, issuetype: { name: 'Bug' } } },
      },
      {
        type: { name: 'Relates', inward: 'relates to', outward: 'relates to' },
        outwardIssue: { key: 'INC-3', fields: { status: { name: 'En cours' }, issuetype: { name: 'Incident' } } },
      },
    ],
    subtasks: [{ key: 'ABC-2', fields: { summary: 'Sous-tâche', status: { statusCategory: { key: 'done' } } } }],
    customfield_10100: true,
    customfield_10101: { value: 'Yes' },
    customfield_10102: 'Rollback : feature flag `paiement-3x`.',
  },
};

describe('parseIssue', () => {
  const options = {
    champs: {
      revueSecurite: 'customfield_10100',
      approbationSecurite: 'customfield_10101',
      planRetour: 'customfield_10102',
    },
    baseUrl: 'https://exemple.atlassian.net/',
  };

  it('mappe statut, catégorie, résumé et critères de la description', () => {
    const issue = parseIssue(TICKET, options);
    expect(issue).toMatchObject({
      key: 'ABC-1',
      id: '10042',
      exists: true,
      status: 'En cours',
      statusCategory: 'inProgress',
      summary: 'Payer en trois fois',
      url: 'https://exemple.atlassian.net/browse/ABC-1',
    });
    expect(issue.criteria).toEqual([
      { text: 'Le paiement fractionné marche', done: true },
      { text: 'La relance est testée', done: false },
    ]);
  });

  it('lit les liens entrants et sortants avec la cible et son statut', () => {
    const issue = parseIssue(TICKET, options);
    expect(issue.links).toEqual([
      { type: 'Blocks', direction: 'outward', targetKey: 'ABC-7', targetStatus: 'À faire' },
      { type: 'Blocks', direction: 'inward', targetKey: 'ABC-9', targetStatus: 'Terminé' },
      { type: 'Relates', direction: 'outward', targetKey: 'INC-3', targetStatus: 'En cours' },
    ]);
  });

  it('relève les versions publiées et non publiées', () => {
    expect(parseIssue(TICKET, options).fixVersions).toEqual([
      { name: '2026.11', released: false },
      { name: '2026.10', released: true },
    ]);
  });

  it('relève étiquettes, composants, incidents liés, revue et plan de retour', () => {
    const issue = parseIssue(TICKET, options);
    expect(issue.labels).toEqual(['paiement', 'revue-securite']);
    expect(issue.components).toEqual(['api-paiement', 'front']);
    expect(issue.incidentKeys).toEqual(['INC-3']);
    expect(issue.securityReviewRequired).toBe(true);
    expect(issue.securityReviewApproved).toBe(true);
    expect(issue.rollbackPlanAttached).toBe(true);
  });

  it('déduit l’exigence de revue de sécurité d’une étiquette', () => {
    const issue = parseIssue(TICKET, { etiquetteRevueSecurite: 'revue-securite' });
    expect(issue.securityReviewRequired).toBe(true);
    expect(issue.securityReviewApproved).toBeUndefined();
  });

  it('retombe sur le champ des critères puis sur les sous-tâches', () => {
    const sansDescription = { ...TICKET, fields: { ...TICKET.fields, description: undefined } };
    const parSousTaches = parseIssue(sansDescription, { champs: { criteres: 'customfield_10200' } });
    expect(parSousTaches.criteria).toEqual([{ text: 'Sous-tâche', done: true }]);
    const avecChamp = parseIssue(
      {
        ...TICKET,
        fields: {
          ...TICKET.fields,
          description: undefined,
          customfield_10200: [{ texte: 'Champ', fait: true }],
        },
      },
      { champs: { criteres: 'customfield_10200' } },
    );
    expect(avecChamp.criteria).toEqual([{ text: 'Champ', done: true }]);
  });

  it('décrit un ticket inexistant sans lever', () => {
    expect(issueInexistante('ZZZ-1', { baseUrl: 'https://exemple.atlassian.net' })).toMatchObject({
      key: 'ZZZ-1',
      exists: false,
      criteria: [],
      links: [],
      url: 'https://exemple.atlassian.net/browse/ZZZ-1',
    });
  });
});

describe('cleIncident', () => {
  it('reconnaît un incident par le type de la cible ou du lien', () => {
    expect(
      cleIncident({
        type: { name: 'Relates' },
        outwardIssue: { key: 'INC-1', fields: { issuetype: { name: 'Incident' } } },
      }),
    ).toBe('INC-1');
    expect(
      cleIncident({ type: { name: 'is caused by' }, inwardIssue: { key: 'INC-2', fields: {} } }),
    ).toBe('INC-2');
  });

  it('ignore un lien ordinaire', () => {
    expect(
      cleIncident({ type: { name: 'Blocks' }, outwardIssue: { key: 'ABC-2', fields: { issuetype: { name: 'Story' } } } }),
    ).toBeUndefined();
    expect(cleIncident(undefined)).toBeUndefined();
  });
});

describe('parseIncidents', () => {
  it('mappe une réponse de recherche JSM', () => {
    const reponse = {
      issues: [
        {
          key: 'INC-11',
          fields: {
            created: '2026-11-10T08:00:00.000+0000',
            components: [{ name: 'api-paiement' }],
            status: { name: 'En cours' },
          },
        },
        { key: 'INC-12', fields: { created: '2026-11-09T07:00:00.000+0000', service: 'front' } },
      ],
    };
    expect(parseIncidents(reponse)).toEqual([
      {
        service: 'api-paiement',
        incidentKey: 'INC-11',
        openedAt: '2026-11-10T08:00:00.000+0000',
        resolvedAt: undefined,
      },
      {
        service: 'front',
        incidentKey: 'INC-12',
        openedAt: '2026-11-09T07:00:00.000+0000',
        resolvedAt: undefined,
      },
    ]);
  });

  it('rend une liste vide pour une réponse vide ou illisible', () => {
    expect(parseIncidents({ issues: [] })).toEqual([]);
    expect(parseIncidents(undefined)).toEqual([]);
  });
});
