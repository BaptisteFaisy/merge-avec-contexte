/**
 * Teamwork Graph (§8, source n°2) — items 15 et 16 de l'audit.
 *
 * Trois niveaux sont couverts : la résolution pure des deux sources (la table de
 * réglages prime), la normalisation d'une réponse de graphe inconnue, et le
 * branchement réel — `serviceDuDepot`, `reglesEffectives` et R-10, qui devient
 * jouable sans saisir la moindre équipe dans les réglages.
 *
 * Aucun test ne touche Forge ni le réseau : le graphe est une doublure mémoire.
 */
import { describe, expect, it } from 'vitest';
import { configParDefaut } from '../src/app/config';
import { reglesEffectives, serviceDuDepot } from '../src/app/context-repo';
import { horlogeFixe } from '../src/app/horloge';
import { loggerSilencieux } from '../src/app/logger';
import { createRovoContext } from '../src/app/rovo-adaptateurs';
import type { IssueReader } from '../src/jira/reader';
import { evaluateAll } from '../src/rules/engine';
import type { EvaluationInput } from '../src/rules/input';
import { createMemoryStore } from '../src/storage/memory-store';
import type { PrContext, Reviewer, RuleConfig } from '../src/shared';
import {
  createMemoryTeamworkReader,
  normaliserRelations,
  resoudreEquipe,
  resoudreService,
} from '../src/teamwork';
import type { RelationTeamwork } from '../src/teamwork';

const NOW = '2026-11-11T10:00:00Z';
const WORKSPACE = 'ws-demo';

/** L'équipe propriétaire du service, telle que le graphe la porte. */
const equipePaiement = { id: 'team-1', name: 'Paiement', memberAccountIds: ['acc-sam', 'acc-lea'] };

/** Graphe de référence : dépôt → service → composant → équipe. */
const graphe: RelationTeamwork[] = [
  { repository: 'paiement/paiement-api', service: 'paiement-api', component: 'Paiement', team: equipePaiement },
  { repository: 'inconnu', service: 'autre-service' },
];

/** Lecteur mémoire du graphe de référence. */
function lecteur() {
  return createMemoryTeamworkReader(graphe);
}

/** Store jumelé, avec ou sans correspondance dépôt → service dans les réglages. */
async function storeAvec(reglages?: { depot: string; service: string }) {
  const store = createMemoryStore();
  await store.pairing.recordPairing({
    workspaceUuid: WORKSPACE,
    secretRef: 'ref-secret',
    pairedAt: NOW,
    pairedBy: 'admin',
  });
  if (reglages) {
    await store.repoService.upsert(
      { workspaceUuid: WORKSPACE, repoUuid: reglages.depot, service: reglages.service },
      NOW,
    );
  }
  return store;
}

/** Lecteur Jira factice : aucun ticket connu, aucun incident. */
const jiraVide: IssueReader = {
  async lire(cle) {
    return {
      key: cle, id: cle, exists: false, status: '', statusCategory: 'toDo', summary: '',
      criteria: [], links: [], fixVersions: [], labels: [], components: [], incidentKeys: [],
    };
  },
  async incidentsOuverts() {
    return [];
  },
};

/** PR minimale : seuls les relecteurs comptent pour R-10. */
function pr(relecteurs: Reviewer[]): PrContext {
  return {
    workspaceUuid: WORKSPACE,
    repositoryUuid: 'paiement/paiement-api',
    repositorySlug: 'paiement-api',
    pullRequestId: 42,
    title: 'PAY-123 paiement en trois fois',
    sourceBranch: 'feature/PAY-123',
    targetBranch: 'main',
    commitMessages: [],
    changedPaths: [],
    reviewers: relecteurs,
    trigger: 'on-merge',
  };
}

/** Réglage R-10 d'une liste de configurations. */
function regleR10(configs: RuleConfig[]): RuleConfig {
  const trouve = configs.find((config) => config.rule === 'R-10');
  if (!trouve) throw new Error('R-10 absente des réglages effectifs');
  return trouve;
}

describe('résolution des deux sources (§8)', () => {
  it('donne la priorité à la table de réglages', () => {
    expect(resoudreService('paiement-api', 'autre-service')).toEqual({
      service: 'paiement-api',
      source: 'settings',
    });
  });

  it('retombe sur le Teamwork Graph quand les réglages ne disent rien', () => {
    expect(resoudreService(undefined, 'paiement-api')).toEqual({
      service: 'paiement-api',
      source: 'teamwork-graph',
    });
    expect(resoudreService('   ', 'paiement-api').source).toBe('teamwork-graph');
  });

  it('dit qu’aucune source ne connaît le dépôt', () => {
    expect(resoudreService(undefined, undefined)).toEqual({ service: null, source: 'none' });
  });

  it('laisse l’équipe des réglages l’emporter sur celle du graphe', () => {
    const equipe = resoudreEquipe({ team: ['acc-regie'], teamName: 'Régie' }, { team: equipePaiement }, 'paiement-api');
    expect(equipe).toEqual({ team: ['acc-regie'], teamName: 'Régie', source: 'settings' });
  });

  it('complète l’équipe avec le graphe quand les réglages sont vides', () => {
    const equipe = resoudreEquipe({ team: [], teamName: '' }, { team: equipePaiement }, 'paiement-api');
    expect(equipe).toEqual({ team: ['acc-sam', 'acc-lea'], teamName: 'Paiement', source: 'teamwork-graph' });
  });

  it('ignore une équipe du graphe sans membre', () => {
    const equipe = resoudreEquipe({}, { team: { id: 't', name: 'Vide', memberAccountIds: [] } }, 's');
    expect(equipe.team).toEqual([]);
    expect(equipe.source).toBe('none');
    expect(equipe.teamName).toBe('s');
  });
});

describe('lecteur mémoire du graphe', () => {
  it('reconnaît un dépôt avec ou sans son préfixe de projet', async () => {
    const relations = await lecteur().relationsForRepository('paiement-api');
    expect(relations.service).toBe('paiement-api');
    expect(relations.component).toBe('Paiement');
    expect(relations.team?.memberAccountIds).toEqual(['acc-sam', 'acc-lea']);
  });

  it('rend les relations d’un service, et rien d’inconnu', async () => {
    expect((await lecteur().relationsForService('paiement-api')).team?.name).toBe('Paiement');
    expect(await lecteur().relationsForRepository('jamais-vu')).toEqual({});
    expect(await lecteur().relationsForService('jamais-vu')).toEqual({});
  });
});

describe('normalisation d’une réponse de graphe', () => {
  const reponse = {
    data: {
      entities: [
        {
          id: 'repo-1',
          name: 'paiement-api',
          type: 'REPOSITORY',
          relations: [
            { id: 'svc-1', name: 'paiement-api', type: 'SERVICE' },
            { id: 'cmp-1', name: 'Paiement', type: 'COMPONENT' },
            { id: 'team-1', name: 'Paiement', type: 'TEAM', members: [{ accountId: 'acc-sam' }, 'acc-lea'] },
          ],
        },
      ],
    },
  };

  it('retient service, composant et équipe quelle que soit la forme', () => {
    expect(normaliserRelations(reponse)).toEqual({
      service: 'paiement-api',
      component: 'Paiement',
      team: { id: 'team-1', name: 'Paiement', memberAccountIds: ['acc-sam', 'acc-lea'] },
    });
  });

  it('rend des relations vides sur une réponse en erreur ou absente', () => {
    expect(normaliserRelations({ errors: [{ message: 'boom' }], data: null })).toEqual({});
    expect(normaliserRelations(undefined)).toEqual({});
    expect(normaliserRelations('texte')).toEqual({});
  });

  it('ignore une équipe sans membre exploitable', () => {
    const sansMembre = { data: { entities: [{ id: 't', name: 'Paiement', type: 'TEAM', members: [] }] } };
    expect(normaliserRelations(sansMembre)).toEqual({});
  });
});

describe('correspondance dépôt → service branchée sur les deux sources', () => {
  it('lit la table de réglages en premier', async () => {
    const store = await storeAvec({ depot: 'paiement-api', service: 'service-des-reglages' });
    expect(await serviceDuDepot(store, 'paiement-api', lecteur())).toBe('service-des-reglages');
  });

  it('complète avec le Teamwork Graph quand la table ne connaît pas le dépôt', async () => {
    const store = await storeAvec();
    expect(await serviceDuDepot(store, 'paiement-api', lecteur())).toBe('paiement-api');
  });

  it('rend undefined quand aucune source ne connaît le dépôt', async () => {
    const store = await storeAvec();
    expect(await serviceDuDepot(store, 'jamais-vu', lecteur())).toBeUndefined();
  });

  it('se passe de jumelage pour la source n°2', async () => {
    const store = createMemoryStore();
    expect(await serviceDuDepot(store, 'paiement-api', lecteur())).toBe('paiement-api');
  });
});

describe('R-10 branchée sur le Teamwork Graph', () => {
  it('complète l’équipe du réglage R-10 avec le graphe', async () => {
    const store = await storeAvec();
    const configs = await reglesEffectives(store, 'DEMO', { depot: 'paiement-api', teamwork: lecteur() });
    const r10 = regleR10(configs);
    expect(r10.params.team).toEqual(['acc-sam', 'acc-lea']);
    expect(r10.params.teamName).toBe('Paiement');
  });

  it('laisse intacte une équipe déjà saisie dans les réglages', async () => {
    const store = await storeAvec();
    await store.ruleConfig.upsert(
      'DEMO',
      { rule: 'R-10', level: 'warning', mode: 'active', scope: {}, params: { team: ['acc-regie'], teamName: 'Régie' } },
      NOW,
    );
    const configs = await reglesEffectives(store, 'DEMO', { depot: 'paiement-api', teamwork: lecteur() });
    expect(regleR10(configs).params.team).toEqual(['acc-regie']);
  });

  it('ne change rien sans dépôt connu', async () => {
    const store = await storeAvec();
    const configs = await reglesEffectives(store, 'DEMO', { teamwork: lecteur() });
    expect(regleR10(configs).params.team).toEqual([]);
  });

  it('rend R-10 jouable : un membre du graphe approuve, la règle passe', async () => {
    const store = await storeAvec();
    const contexte = createRovoContext(store, configParDefaut(), {
      store,
      jira: jiraVide,
      clock: horlogeFixe(NOW),
      logger: loggerSilencieux(),
    }, lecteur());
    const charge = await contexte.load('PAY-123', 'paiement-api');
    expect(charge.service).toBe('paiement-api');

    const entree = (relecteurs: Reviewer[]): EvaluationInput => ({
      pr: pr(relecteurs),
      issues: [],
      freezes: [],
      incidents: [],
      waivers: [],
      service: charge.service,
      configs: charge.configs,
      now: NOW,
      locale: 'fr',
    });

    const approuvee = evaluateAll(entree([{ accountId: 'acc-lea', state: 'approved' }]));
    expect(approuvee.reasons.filter((raison) => raison.rule === 'R-10')).toEqual([]);

    const refuser = evaluateAll(entree([{ accountId: 'acc-inconnu', state: 'approved' }]));
    const raisons = refuser.reasons.filter((raison) => raison.rule === 'R-10');
    expect(raisons).toHaveLength(1);
    expect(raisons[0]?.text).toContain('Paiement');
    expect(raisons[0]?.level).toBe('warning');
  });
});
