/**
 * Journal, statistiques et rapport d'observation (items 8, 12, 13, 21, 22, 60).
 *
 * - item 8 : le P95 et la durée maximale sont mesurés par le port de
 *   statistiques et affichés au journal (§16 : « 95 % des évaluations en moins
 *   de 5 s, mesurées et affichées dans le journal ») ;
 * - item 12 : les dérogations de la fenêtre apparaissent au journal, avec qui,
 *   quoi, quand, pourquoi, échéance et statut (§12 écran 7) ;
 * - item 13 : blocages par règle, dérogations demandées / accordées / refusées et
 *   délai de déblocage, agrégés par service (§10 MC-16) ;
 * - item 21 : la fenêtre du rapport est configurable depuis l'écran (§7.3) ;
 * - item 22 : le rapport se produit à la demande — pas de module, pas d'horloge ;
 * - item 60 : chaque évaluation porte un identifiant de corrélation, journalisé
 *   et rangé avec elle.
 *
 * Aucun test ne lit l'heure : les instants viennent de l'horloge figée.
 */
import { describe, expect, it } from 'vitest';
import { assemblerCerveau, resolversUi, type Cerveau } from '../src/app/compose';
import { createEvaluateService } from '../src/app/evaluate';
import { horlogeFixe } from '../src/app/horloge';
import { loggerSilencieux, type LoggerCommun } from '../src/app/logger';
import { createMemoryReglagesStore } from '../src/app/reglages';
import type { EvaluationInput } from '../src/bridge/deps';
import type { IssueReader } from '../src/jira/reader';
import { defaultRuleConfigs } from '../src/rules/defaults';
import type { IssueContext, Reason, RuleCode } from '../src/shared';
import { createMemoryStore } from '../src/storage/memory-store';
import { dureeMaximale, percentileDurees } from '../src/storage/ports';
import type { StoredEvaluation, StoredWaiver } from '../src/storage/ports';
import {
  joursFenetre,
  texteRapport,
  vmJournal,
  type DerogationJournalisee,
  type EvaluationJournalisee,
} from '../src/ui/view-model-journal';

const NOW = '2026-11-27T16:00:00.000Z';
const WORKSPACE = 'ws-demo';
const REPO = 'checkout-api';
const UNE_HEURE = 3_600_000;
const JOUR = 86_400_000;

/** Une évaluation journalisée, avec ses valeurs par défaut. */
function evaluation(id: string, over: Partial<StoredEvaluation> = {}): StoredEvaluation {
  return {
    id, workspaceUuid: WORKSPACE, repositoryUuid: REPO, pullRequestId: 42, issueKeys: ['PAY-123'],
    trigger: 'on-code-pushed', verdict: 'allowed', reasons: [], evaluatedAt: NOW, durationMs: 100,
    ...over,
  };
}

/** Une dérogation, avec ses valeurs par défaut. */
function derogation(id: string, over: Partial<StoredWaiver> = {}): StoredWaiver {
  return {
    id, prId: 42, repositoryUuid: REPO, rule: 'R-04', requestedBy: 'lea', reason: 'gel contourné',
    requestedAt: NOW, status: 'requested', issueKeys: ['PAY-123'], ...over,
  };
}

/** Une raison bloquante, pour les comptages par règle. */
function raisonBloquante(rule: RuleCode, over: Partial<Reason> = {}): Reason {
  return { rule, level: 'blocking', text: `${rule} bloque la fusion`, ...over };
}

/** Une évaluation du journal, telle que le resolver les rend. */
function journalisee(id: string, over: Partial<StoredEvaluation> = {}): EvaluationJournalisee {
  const ligne = evaluation(id, over);
  return {
    depot: ligne.repositoryUuid,
    prId: ligne.pullRequestId,
    evaluation: ligne,
    service: ligne.service,
    correlationId: ligne.correlationId,
  };
}

/** Une dérogation du journal, telle que le resolver les rend. */
function tracee(id: string, over: Partial<StoredWaiver> & { service?: string } = {}): DerogationJournalisee {
  const { service, ...reste } = over;
  return { ...derogation(id, reste), service };
}

/** Journal capturé : les messages et leur contexte, pour suivre la corrélation. */
function journalCapture(): LoggerCommun & { lignes: Array<{ message: string; contexte?: Record<string, unknown> }> } {
  const lignes: Array<{ message: string; contexte?: Record<string, unknown> }> = [];
  const noter = (message: string, contexte?: Record<string, unknown>) => {
    lignes.push({ message, contexte });
  };
  return { lignes, info: noter, warn: noter, error: noter };
}

/** Le ticket connu du lecteur factice. */
const ticket: IssueContext = {
  key: 'PAY-123',
  id: '10001',
  exists: true,
  status: 'En cours',
  statusCategory: 'inProgress',
  criteria: [{ text: 'Critère A', done: true }],
  links: [],
  fixVersions: [],
  labels: [],
  components: [],
  incidentKeys: [],
};

/** Lecteur Jira factice : un ticket connu, tout le reste inexistant. */
const jiraFactice: IssueReader = {
  async lire(cle) {
    return cle === 'PAY-123' ? ticket : { ...ticket, key: cle, id: cle, exists: false };
  },
  async incidentsOuverts() {
    return [];
  },
};

/** Cerveau assemblé en mémoire, horloge figée, journal muet. */
function cerveau(): Cerveau {
  return assemblerCerveau({
    store: createMemoryStore(),
    reglages: createMemoryReglagesStore({ approbateurs: ['tech-lead'] }),
    config: { siteUrl: 'https://demo.atlassian.net', projectId: 'PAY', bridgeUrl: 'https://pont.demo/v2', locale: 'fr' },
    clock: horlogeFixe(NOW),
    logger: loggerSilencieux(),
    jira: jiraFactice,
  });
}

/** Entrée d'évaluation minimale, horodatée par l'horloge injectée. */
function entreeEvaluation(): EvaluationInput {
  return {
    pr: {
      workspaceUuid: WORKSPACE, repositoryUuid: REPO, repositorySlug: REPO, pullRequestId: 42,
      title: 'PAY-123 correctif', sourceBranch: 'feature/PAY-123', targetBranch: 'main',
      commitMessages: ['PAY-123 correctif'], changedPaths: [], reviewers: [], trigger: 'on-code-pushed',
    },
    issueKeys: ['PAY-123'],
    siteUrl: 'https://demo.atlassian.net',
    freezes: [],
    waivers: [],
    configs: defaultRuleConfigs(),
    now: NOW,
    locale: 'fr',
    fallbackPolicy: 'open',
  };
}

describe('P95 et durée maximale (item 8)', () => {
  it('calcule le percentile au rang le plus proche', () => {
    const durees = Array.from({ length: 20 }, (_, rang) => (rang + 1) * 100);
    expect(percentileDurees(durees, 95)).toBe(1900);
    expect(percentileDurees(durees, 50)).toBe(1000);
    expect(dureeMaximale(durees)).toBe(2000);
  });

  it('rend zéro sur une liste vide', () => {
    expect(percentileDurees([], 95)).toBe(0);
    expect(dureeMaximale([])).toBe(0);
  });

  it('le port de statistiques mesure le P95 et le maximum de la période', async () => {
    const store = createMemoryStore();
    for (let rang = 1; rang <= 20; rang += 1) {
      await store.evaluations.record(evaluation(`e${rang}`, { durationMs: rang * 100 }));
    }
    const stats = await store.evaluations.stats('2026-11-01T00:00:00.000Z');
    expect(stats.total).toBe(20);
    expect(stats.averageDurationMs).toBe(1050);
    expect(stats.p95DurationMs).toBe(1900);
    expect(stats.maxDurationMs).toBe(2000);
  });

  it('le journal affiche le P95 et le maximum', () => {
    const vue = vmJournal({
      locale: 'fr',
      evaluations: [
        journalisee('a', { durationMs: 100 }),
        journalisee('b', { durationMs: 900 }),
        journalisee('c', { durationMs: 5000 }),
      ],
    });
    expect(vue.durees.p95Ms).toBe(5000);
    expect(vue.durees.maxMs).toBe(5000);
  });
});

describe('dérogations au journal (item 12)', () => {
  it('rend qui, quoi, quand, pourquoi, échéance et statut', () => {
    const vue = vmJournal({
      locale: 'fr',
      derogations: [
        tracee('w-1', { status: 'granted', grantedBy: 'tech-lead', expiresAt: '2026-11-28T16:00:00.000Z' }),
      ],
    });
    const entree = vue.derogations.entrees[0];
    expect(entree?.qui).toBe('lea');
    expect(entree?.quand).toBe(NOW);
    expect(entree?.pourquoi).toBe('gel contourné');
    expect(entree?.regle).toBe('R-04');
    expect(entree?.regleTitre.length).toBeGreaterThan(0);
    expect(entree?.echeance).not.toBe('');
    expect(entree?.statut).toBe('granted');
    expect(entree?.statutLabel).toBe('Accordée');
    expect(entree?.decideur).toBe('tech-lead');
  });

  it('traduit le statut dans les deux langues', () => {
    const fr = vmJournal({ locale: 'fr', derogations: [tracee('w-1')] });
    const en = vmJournal({ locale: 'en', derogations: [tracee('w-1')] });
    expect(fr.derogations.entrees[0]?.statutLabel).toBe('Demandée');
    expect(en.derogations.entrees[0]?.statutLabel).toBe('Requested');
  });

  it('rend un journal sans dérogation', () => {
    const vue = vmJournal({ locale: 'fr' });
    expect(vue.derogations.demandees).toBe(0);
    expect(vue.derogations.entrees).toEqual([]);
  });
});

describe('statistiques du §10 MC-16 (item 13)', () => {
  it('compte les blocages par règle, la plus bloquante en tête', () => {
    const vue = vmJournal({
      locale: 'fr',
      evaluations: [
        journalisee('a', { verdict: 'blocked', reasons: [raisonBloquante('R-04')] }),
        journalisee('b', { verdict: 'blocked', reasons: [raisonBloquante('R-04'), raisonBloquante('R-03')] }),
        journalisee('c', { verdict: 'allowed' }),
      ],
    });
    expect(vue.blocages.parRegle.map((ligne) => [ligne.regle, ligne.bloquees])).toEqual([
      ['R-04', 2],
      ['R-03', 1],
    ]);
  });

  it('ne compte pas une raison observée comme un blocage', () => {
    const vue = vmJournal({
      locale: 'fr',
      evaluations: [
        journalisee('a', { verdict: 'blocked', reasons: [raisonBloquante('R-04', { observed: true })] }),
      ],
    });
    expect(vue.blocages.parRegle).toEqual([]);
  });

  it('compte les dérogations demandées, accordées et refusées', () => {
    const vue = vmJournal({
      locale: 'fr',
      derogations: [
        tracee('w-1', { status: 'requested' }),
        tracee('w-2', { status: 'granted' }),
        tracee('w-3', { status: 'refused' }),
        tracee('w-4', { status: 'expired' }),
      ],
    });
    expect(vue.derogations.demandees).toBe(4);
    expect(vue.derogations.accordees).toBe(1);
    expect(vue.derogations.refusees).toBe(1);
    expect(vue.derogations.enAttente).toBe(1);
    expect(vue.derogations.expirees).toBe(1);
  });

  it('mesure le délai de déblocage entre la première évaluation bloquée et la première autorisée', () => {
    const vue = vmJournal({
      locale: 'fr',
      evaluations: [
        journalisee('a', { verdict: 'blocked', evaluatedAt: '2026-11-27T10:00:00.000Z' }),
        journalisee('b', { verdict: 'blocked', evaluatedAt: '2026-11-27T11:00:00.000Z' }),
        journalisee('c', { verdict: 'allowed', evaluatedAt: '2026-11-27T12:00:00.000Z' }),
      ],
    });
    const delai = vue.blocages.deblocage;
    expect(delai.prs).toHaveLength(1);
    expect(delai.prs[0]?.delaiMs).toBe(2 * UNE_HEURE);
    expect(delai.prs[0]?.bloqueeLe).toBe('2026-11-27T10:00:00.000Z');
    expect(delai.prs[0]?.autoriseeLe).toBe('2026-11-27T12:00:00.000Z');
    expect(delai.medianMs).toBe(2 * UNE_HEURE);
    expect(delai.maxMs).toBe(2 * UNE_HEURE);
  });

  it('compte à part les PR encore bloquées', () => {
    const vue = vmJournal({
      locale: 'fr',
      evaluations: [
        journalisee('a', { verdict: 'blocked', evaluatedAt: '2026-11-27T10:00:00.000Z' }),
        journalisee('b', { verdict: 'blocked', pullRequestId: 43, evaluatedAt: '2026-11-27T11:00:00.000Z' }),
      ],
    });
    expect(vue.blocages.deblocage.prs).toEqual([]);
    expect(vue.blocages.deblocage.enAttente).toBe(2);
  });

  it('agrège par service et nomme le service inconnu', () => {
    const vue = vmJournal({
      locale: 'fr',
      evaluations: [
        journalisee('a', { verdict: 'blocked', service: 'paiement' }),
        journalisee('b', { verdict: 'blocked', service: 'paiement', pullRequestId: 43 }),
        journalisee('c', { verdict: 'blocked' }),
      ],
      derogations: [tracee('w-1', { service: 'paiement' })],
    });
    const parService = vue.blocages.parService;
    expect(parService[0]?.service).toBe('paiement');
    expect(parService[0]?.bloquees).toBe(2);
    expect(parService[0]?.derogations).toBe(1);
    expect(parService.some((ligne) => ligne.service === 'Service inconnu')).toBe(true);
    expect(vue.derogations.parService[0]?.service).toBe('paiement');
  });
});

describe('fenêtre configurable (item 21)', () => {
  it('borne la fenêtre : trente jours par défaut, un an au maximum', () => {
    expect(joursFenetre(undefined)).toBe(30);
    expect(joursFenetre(0)).toBe(1);
    expect(joursFenetre(7.4)).toBe(7);
    expect(joursFenetre(9999)).toBe(365);
  });

  it('propose la fenêtre courante parmi les choix', () => {
    const vue = vmJournal({ locale: 'fr', fenetreJours: 60 });
    expect(vue.fenetre.jours).toBe(60);
    expect(vue.fenetre.joursDisponibles).toContain(60);
    expect(vue.fenetre.joursDisponibles).toContain(30);
  });

  it('le resolver applique la fenêtre demandée', async () => {
    const c = cerveau();
    await c.store.evaluations.record(evaluation('recent', { evaluatedAt: new Date(Date.parse(NOW) - 2 * JOUR).toISOString() }));
    await c.store.evaluations.record(evaluation('vieux', { evaluatedAt: new Date(Date.parse(NOW) - 20 * JOUR).toISOString() }));
    const large = await resolversUi(c).console({ method: 'charger' });
    expect(large.journal.fenetre.jours).toBe(30);
    expect(large.journal.evaluations).toHaveLength(2);
    const etroit = await resolversUi(c).console({ method: 'charger', fenetre: '7' });
    expect(etroit.journal.fenetre.jours).toBe(7);
    expect(etroit.journal.evaluations.map((ligne) => ligne.prId)).toEqual([42]);
  });

  it('le resolver résout le service du dépôt par la correspondance', async () => {
    const c = cerveau();
    await c.store.pairing.recordPairing({ workspaceUuid: WORKSPACE, secretRef: 'secret', pairedAt: NOW, pairedBy: 'admin' });
    await c.store.repoService.upsert({ workspaceUuid: WORKSPACE, repoUuid: REPO, service: 'paiement' }, NOW);
    await c.store.evaluations.record(evaluation('e1', { verdict: 'blocked', reasons: [raisonBloquante('R-04')] }));
    const reponse = await resolversUi(c).console({ method: 'charger' });
    expect(reponse.journal.evaluations[0]?.service).toBe('paiement');
    expect(reponse.journal.blocages.parService[0]?.service).toBe('paiement');
  });
});

describe('rapport à la demande (item 22)', () => {
  it('produit le texte du rapport sur la fenêtre retenue', async () => {
    const c = cerveau();
    await c.store.evaluations.record(evaluation('e1', { durationMs: 120, verdict: 'blocked', reasons: [raisonBloquante('R-04')] }));
    const reponse = await resolversUi(c).console({ method: 'rapport' });
    expect(reponse.rapport?.genereLe).toBe(NOW);
    expect(reponse.rapport?.fenetreJours).toBe(30);
    expect(reponse.rapport?.texte).toContain('Rapport d’observation');
    expect(reponse.rapport?.texte).toContain('P95');
  });

  it('ne produit pas de rapport pour un autre appel', async () => {
    const c = cerveau();
    const reponse = await resolversUi(c).console({ method: 'charger' });
    expect(reponse.rapport).toBeNull();
  });

  it('le rapport est bilingue', () => {
    const vue = vmJournal({ locale: 'fr', evaluations: [journalisee('a')] });
    const en = vmJournal({ locale: 'en', evaluations: [journalisee('a')] });
    expect(texteRapport(vue, 'fr')).toContain('Rapport d’observation');
    expect(texteRapport(en, 'en')).toContain('Observation report');
    expect(texteRapport(en, 'en')).toContain('Evaluations');
  });
});

describe('identifiant de corrélation (item 60)', () => {
  it('journalise et range le même identifiant pour toute l’évaluation', async () => {
    const store = createMemoryStore();
    const journal = journalCapture();
    const service = createEvaluateService({ store, jira: jiraFactice, clock: horlogeFixe(NOW), logger: journal });
    await service(entreeEvaluation());
    const ligne = await store.evaluations.latestByPullRequest(REPO, 42);
    expect(ligne?.correlationId).toMatch(/^corr-42-/);
    const porteurs = journal.lignes.filter((entree) => entree.contexte?.correlationId === ligne?.correlationId);
    expect(porteurs.map((entree) => entree.message)).toEqual([
      'évaluation : début',
      'évaluation : décomposition des durées',
    ]);
  });

  it('garde le même identifiant sur le chemin du repli', async () => {
    const store = createMemoryStore();
    const journal = journalCapture();
    const jiraEnPanne: IssueReader = {
      async lire() {
        throw new Error('Jira injoignable');
      },
      async incidentsOuverts() {
        return [];
      },
    };
    const service = createEvaluateService({ store, jira: jiraEnPanne, clock: horlogeFixe(NOW), logger: journal });
    const repli = await service(entreeEvaluation());
    expect(repli.fallback).toBe('open');
    const ligne = await store.evaluations.latestByPullRequest(REPO, 42);
    expect(ligne?.correlationId).toMatch(/^corr-42-/);
    const porteuse = journal.lignes.find((entree) => entree.message === 'évaluation en échec : repli appliqué');
    expect(porteuse?.contexte?.correlationId).toBe(ligne?.correlationId);
  });
});
