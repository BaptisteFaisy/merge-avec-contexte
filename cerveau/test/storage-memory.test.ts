/**
 * Comportement des ports de stockage, sur l'implémentation mémoire.
 *
 * Ces tests décrivent le contrat que `sql-store.ts` doit honorer : ils ne
 * parlent ni de SQL ni de Forge, seulement de ce qu'un appelant a le droit
 * d'attendre (écriture puis lecture, upsert, expiration, comptages, nonces).
 * Aucun test ne lit l'heure : `now` est toujours fourni.
 */
import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../src/storage/memory-store';
import type { StoredEvaluation, StoredWaiver } from '../src/storage/ports';
import type { WaiverAuditEntry } from '../src/shared/bridge/payload';
import type { Freeze, IssueContext, RuleConfig } from '../src/shared/types';

const NOW = '2026-11-11T10:00:00.000Z';
const WORKSPACE = 'ws-uuid';
const REPO = 'repo-uuid';

/** Réglage de règle minimal. */
function config(rule: RuleConfig['rule'], level: RuleConfig['level'] = 'blocking'): RuleConfig {
  return { rule, level, mode: 'active', scope: { branches: ['main'] }, params: { jours: 2 } };
}

/** Gel d'une journée, ponctuel. */
function gel(id: string, startsAt: string, endsAt: string, services: string[] = []): Freeze {
  return { id, name: `gel ${id}`, startsAt, endsAt, branches: ['main'], services, recurrence: { kind: 'none' } };
}

/** Dérogation en attente. */
function derogation(id: string, over: Partial<StoredWaiver> = {}): StoredWaiver {
  return {
    id, prId: 42, repositoryUuid: REPO, rule: 'R-04', requestedBy: 'alice', reason: 'correctif urgent',
    requestedAt: NOW, status: 'requested', issueKeys: ['ABC-1'],
    ...over,
  };
}

/** Évaluation journalisée. */
function evaluation(id: string, over: Partial<StoredEvaluation> = {}): StoredEvaluation {
  return {
    id, workspaceUuid: WORKSPACE, repositoryUuid: REPO, pullRequestId: 42, issueKeys: ['ABC-1'],
    trigger: 'on-code-pushed', verdict: 'allowed', reasons: [], evaluatedAt: NOW, durationMs: 100,
    ...over,
  };
}

/** Instantané de ticket. */
function ticket(key: string): IssueContext {
  return {
    key, id: `id-${key}`, exists: true, status: 'En cours', criteria: [{ text: 'livré', done: false }],
    links: [], fixVersions: [{ name: '1.4.0', released: false }], labels: [], components: [],
    incidentKeys: [],
  };
}

describe('rule_config', () => {
  it('relit ce qui a été écrit', async () => {
    const store = createMemoryStore();
    await store.ruleConfig.upsert('p1', config('R-04'), NOW);
    expect(await store.ruleConfig.find('p1', 'R-04')).toEqual(config('R-04'));
  });

  it('remplace au lieu de dupliquer (upsert)', async () => {
    const store = createMemoryStore();
    await store.ruleConfig.upsert('p1', config('R-04'), NOW);
    await store.ruleConfig.upsert('p1', { ...config('R-04'), level: 'warning', mode: 'observe' }, NOW);
    const liste = await store.ruleConfig.listByProject('p1');
    expect(liste).toHaveLength(1);
    expect(liste[0]?.level).toBe('warning');
    expect(liste[0]?.mode).toBe('observe');
  });

  it('isole les projets et sait retirer un réglage', async () => {
    const store = createMemoryStore();
    await store.ruleConfig.upsert('p1', config('R-04'), NOW);
    await store.ruleConfig.upsert('p2', config('R-05'), NOW);
    expect(await store.ruleConfig.listByProject('p1')).toHaveLength(1);
    expect(await store.ruleConfig.find('p2', 'R-04')).toBeUndefined();
    await store.ruleConfig.remove('p1', 'R-04');
    expect(await store.ruleConfig.find('p1', 'R-04')).toBeUndefined();
  });
});

describe('freeze', () => {
  it('écrit, relit et liste par date de début', async () => {
    const store = createMemoryStore();
    await store.freezes.save(gel('g2', '2026-12-01T00:00:00.000Z', '2026-12-02T00:00:00.000Z'));
    await store.freezes.save(gel('g1', '2026-11-20T00:00:00.000Z', '2026-11-21T00:00:00.000Z'));
    expect(await store.freezes.find('g1')).toEqual(gel('g1', '2026-11-20T00:00:00.000Z', '2026-11-21T00:00:00.000Z'));
    expect((await store.freezes.list()).map((f) => f.id)).toEqual(['g1', 'g2']);
  });

  it('distingue en cours et à venir', async () => {
    const store = createMemoryStore();
    await store.freezes.save(gel('encours', '2026-11-11T08:00:00.000Z', '2026-11-11T12:00:00.000Z'));
    await store.freezes.save(gel('avenir', '2026-11-12T08:00:00.000Z', '2026-11-12T12:00:00.000Z'));
    await store.freezes.save(gel('passe', '2026-11-10T08:00:00.000Z', '2026-11-10T12:00:00.000Z'));
    expect((await store.freezes.listActive(NOW)).map((f) => f.id)).toEqual(['encours']);
    expect((await store.freezes.listUpcoming(NOW)).map((f) => f.id)).toEqual(['avenir']);
  });

  it('supprime un gel', async () => {
    const store = createMemoryStore();
    await store.freezes.save(gel('g1', '2026-11-20T00:00:00.000Z', '2026-11-21T00:00:00.000Z'));
    await store.freezes.remove('g1');
    expect(await store.freezes.find('g1')).toBeUndefined();
  });
});

describe('waiver', () => {
  it('accorde une dérogation demandée', async () => {
    const store = createMemoryStore();
    await store.waivers.create(derogation('w1'));
    const accordee = await store.waivers.grant('w1', 'bob', '2026-11-30T00:00:00.000Z');
    expect(accordee?.status).toBe('granted');
    expect(accordee?.grantedBy).toBe('bob');
    expect(accordee?.expiresAt).toBe('2026-11-30T00:00:00.000Z');
  });

  it('refuse une dérogation en gardant la trace', async () => {
    const store = createMemoryStore();
    await store.waivers.create(derogation('w1'));
    const refusee = await store.waivers.refuse('w1', 'bob');
    expect(refusee?.status).toBe('refused');
    expect(refusee?.grantedBy).toBe('bob');
    expect(await store.waivers.find('w1')).toEqual(refusee);
  });

  it('expire les accords dépassés, et seulement eux', async () => {
    const store = createMemoryStore();
    await store.waivers.create(derogation('passee'));
    await store.waivers.grant('passee', 'bob', '2026-11-10T00:00:00.000Z');
    await store.waivers.create(derogation('valide'));
    await store.waivers.grant('valide', 'bob', '2026-11-20T00:00:00.000Z');
    await store.waivers.create(derogation('demande'));
    expect(await store.waivers.expire(NOW)).toBe(1);
    expect((await store.waivers.find('passee'))?.status).toBe('expired');
    expect((await store.waivers.find('valide'))?.status).toBe('granted');
    expect((await store.waivers.find('demande'))?.status).toBe('requested');
  });

  it('retrouve les dérogations par PR et par ticket', async () => {
    const store = createMemoryStore();
    await store.waivers.create(derogation('w1', { issueKeys: ['ABC-1', 'ABC-2'] }));
    await store.waivers.create(derogation('w2', { prId: 43, issueKeys: ['ABC-3'] }));
    expect((await store.waivers.listByPullRequest(REPO, 42)).map((w) => w.id)).toEqual(['w1']);
    expect((await store.waivers.listByIssue('ABC-2')).map((w) => w.id)).toEqual(['w1']);
    expect(await store.waivers.listByIssue('ABC-9')).toEqual([]);
  });
});

describe('evaluation', () => {
  it('enregistre et relit une évaluation', async () => {
    const store = createMemoryStore();
    await store.evaluations.record(evaluation('e1'));
    expect(await store.evaluations.find('e1')).toEqual(evaluation('e1'));
  });

  it('rend la dernière évaluation d’une PR et d’un ticket', async () => {
    const store = createMemoryStore();
    await store.evaluations.record(evaluation('vieux', { evaluatedAt: '2026-11-10T10:00:00.000Z' }));
    await store.evaluations.record(evaluation('recent', { evaluatedAt: '2026-11-11T09:00:00.000Z' }));
    await store.evaluations.record(evaluation('autre', { pullRequestId: 43, issueKeys: ['XYZ-9'] }));
    expect((await store.evaluations.latestByPullRequest(REPO, 42))?.id).toBe('recent');
    expect((await store.evaluations.latestByIssue('ABC-1'))?.id).toBe('recent');
    expect((await store.evaluations.latestByIssue('XYZ-9'))?.id).toBe('autre');
  });

  it('compte les verdicts, les replis et la durée moyenne sur une période', async () => {
    const store = createMemoryStore();
    await store.evaluations.record(evaluation('a', { verdict: 'allowed', durationMs: 100 }));
    await store.evaluations.record(evaluation('b', { verdict: 'blocked', durationMs: 200 }));
    await store.evaluations.record(evaluation('c', { verdict: 'inconclusive', durationMs: 300, fallback: 'open', cause: 'timeout' }));
    await store.evaluations.record(evaluation('hors', { evaluatedAt: '2026-10-01T10:00:00.000Z', verdict: 'blocked' }));
    const stats = await store.evaluations.stats('2026-11-01T00:00:00.000Z');
    expect(stats.total).toBe(3);
    expect(stats.allowed).toBe(1);
    expect(stats.blocked).toBe(1);
    expect(stats.inconclusive).toBe(1);
    expect(stats.fallbacks).toBe(1);
    expect(stats.averageDurationMs).toBe(200);
  });

  it('borne la période par la date de fin', async () => {
    const store = createMemoryStore();
    await store.evaluations.record(evaluation('dedans'));
    await store.evaluations.record(evaluation('dehors', { evaluatedAt: '2026-11-20T10:00:00.000Z' }));
    const liste = await store.evaluations.listSince('2026-11-01T00:00:00.000Z', '2026-11-12T00:00:00.000Z');
    expect(liste.map((e) => e.id)).toEqual(['dedans']);
  });

  it('rend ce qui aurait été bloqué (raisons bloquantes en observation)', async () => {
    const store = createMemoryStore();
    const observee = evaluation('obs', {
      observedOnly: true,
      reasons: [
        { rule: 'R-04', level: 'blocking', text: 'Gel en cours sur main.', observed: true },
        { rule: 'R-05', level: 'warning', text: 'Incident ouvert.', observed: true },
      ],
    });
    await store.evaluations.record(observee);
    await store.evaluations.record(evaluation('normale', {
      reasons: [{ rule: 'R-04', level: 'blocking', text: 'Gel en cours sur main.' }],
    }));
    const rapport = await store.evaluations.observedBlocks('2026-11-01T00:00:00.000Z');
    expect(rapport).toHaveLength(1);
    expect(rapport[0]).toMatchObject({ rule: 'R-04', pullRequestId: 42, text: 'Gel en cours sur main.' });
  });
});

describe('repo_service', () => {
  it('associe un dépôt à un service et à un composant Jira', async () => {
    const store = createMemoryStore();
    await store.repoService.upsert({ workspaceUuid: WORKSPACE, repoUuid: REPO, service: 'api', jiraComponent: 'API' }, NOW);
    await store.repoService.upsert({ workspaceUuid: WORKSPACE, repoUuid: REPO, service: 'api-v2' }, NOW);
    const mapping = await store.repoService.find(WORKSPACE, REPO);
    expect(mapping?.service).toBe('api-v2');
    expect(mapping?.jiraComponent).toBeUndefined();
    expect((await store.repoService.listByWorkspace(WORKSPACE)).map((m) => m.repoUuid)).toEqual([REPO]);
  });

  it('liste par service et sait retirer une correspondance', async () => {
    const store = createMemoryStore();
    await store.repoService.upsert({ workspaceUuid: WORKSPACE, repoUuid: REPO, service: 'api' }, NOW);
    await store.repoService.upsert({ workspaceUuid: WORKSPACE, repoUuid: 'autre', service: 'api' }, NOW);
    expect((await store.repoService.listByService('api')).map((m) => m.repoUuid).sort()).toEqual(['autre', REPO]);
    await store.repoService.remove(WORKSPACE, REPO);
    expect(await store.repoService.find(WORKSPACE, REPO)).toBeUndefined();
  });
});

describe('issue_cache', () => {
  it('écrit et relit un instantané avec sa date', async () => {
    const store = createMemoryStore();
    await store.issueCache.write({ issueKey: 'ABC-1', issue: ticket('ABC-1'), updatedAt: NOW });
    const entree = await store.issueCache.read('ABC-1');
    expect(entree?.updatedAt).toBe(NOW);
    expect(entree?.issue.status).toBe('En cours');
  });

  it('lit en lot, écrit en lot et supprime', async () => {
    const store = createMemoryStore();
    await store.issueCache.writeMany([
      { issueKey: 'ABC-1', issue: ticket('ABC-1'), updatedAt: NOW },
      { issueKey: 'ABC-2', issue: ticket('ABC-2'), updatedAt: NOW },
    ]);
    expect((await store.issueCache.readMany(['ABC-1', 'ABC-2', 'ABC-3'])).map((e) => e.issueKey)).toEqual(['ABC-1', 'ABC-2']);
    await store.issueCache.remove('ABC-1');
    expect(await store.issueCache.read('ABC-1')).toBeUndefined();
  });
});

describe('service_incident', () => {
  it('ouvre puis clôt un incident', async () => {
    const store = createMemoryStore();
    await store.incidents.open({ service: 'api', incidentKey: 'INC-1', openedAt: NOW });
    expect((await store.incidents.listOpen('api')).map((i) => i.incidentKey)).toEqual(['INC-1']);
    await store.incidents.resolve('api', 'INC-1', '2026-11-11T11:00:00.000Z');
    expect(await store.incidents.listOpen('api')).toEqual([]);
  });

  it('liste plusieurs services d’un coup', async () => {
    const store = createMemoryStore();
    await store.incidents.open({ service: 'api', incidentKey: 'INC-1', openedAt: NOW });
    await store.incidents.open({ service: 'web', incidentKey: 'INC-2', openedAt: NOW });
    await store.incidents.open({ service: 'batch', incidentKey: 'INC-3', openedAt: NOW });
    expect((await store.incidents.listOpenMany(['api', 'web'])).map((i) => i.incidentKey).sort()).toEqual(['INC-1', 'INC-2']);
    expect(await store.incidents.listOpenAll()).toHaveLength(3);
  });
});

describe('pairing', () => {
  const offre = { code: 'MAC-ABCD-EFGH', siteUrl: 'https://exemple.atlassian.net', createdBy: 'admin',
    issuedAt: NOW, expiresAt: '2026-11-11T10:10:00.000Z', used: false };

  it('enregistre une offre de jumelage, consommable une seule fois', async () => {
    const store = createMemoryStore();
    await store.pairing.saveOffer(offre);
    expect(await store.pairing.currentOffer()).toEqual(offre);
    expect(await store.pairing.markOfferUsed(offre.code)).toBe(true);
    expect(await store.pairing.markOfferUsed(offre.code)).toBe(false);
    expect((await store.pairing.currentOffer())?.used).toBe(true);
  });

  it('enregistre le jumelage, puis le défait', async () => {
    const store = createMemoryStore();
    expect(await store.pairing.current()).toBeUndefined();
    await store.pairing.recordPairing({ workspaceUuid: WORKSPACE, secretRef: 'secrets/bridge', pairedAt: NOW, pairedBy: 'admin' });
    expect((await store.pairing.current())?.secretRef).toBe('secrets/bridge');
    await store.pairing.unpair();
    expect(await store.pairing.current()).toBeUndefined();
  });

  it('part d’une politique de repli ouverte et la retient', async () => {
    const store = createMemoryStore();
    expect(await store.pairing.fallbackPolicy()).toBe('open');
    await store.pairing.setFallbackPolicy('closed', NOW);
    expect(await store.pairing.fallbackPolicy()).toBe('closed');
  });
});

describe('nonces', () => {
  it('reconnaît un nonce déjà vu, une fois mémorisé', async () => {
    const store = createMemoryStore({ clock: () => Date.parse('2026-11-11T10:00:00.000Z') });
    expect(await store.nonces.seen('n1')).toBe(false);
    await store.nonces.remember('n1', '2026-11-11T10:05:00.000Z');
    expect(await store.nonces.seen('n1')).toBe(true);
    expect(await store.nonces.seen('n2')).toBe(false);
  });

  it('oublie un nonce dont la fenêtre est passée', async () => {
    const store = createMemoryStore();
    await store.nonces.remember('vieux', '2020-01-01T00:00:00.000Z');
    expect(await store.nonces.seen('vieux')).toBe(false);
  });

  it('purge les nonces expirés et rend leur nombre', async () => {
    const store = createMemoryStore({ clock: () => Date.parse(NOW) });
    await store.nonces.remember('perime', '2026-11-11T09:59:59.000Z');
    await store.nonces.remember('frais', '2026-11-11T10:05:00.000Z');
    expect(await store.nonces.purge?.(NOW)).toBe(1);
    expect(await store.nonces.seen('frais')).toBe(true);
    expect(await store.nonces.purge?.(NOW)).toBe(0);
  });
});

describe('waiver_audit', () => {
  /** Ligne d'audit du journal des dérogations. */
  function ligne(id: string, over: Partial<WaiverAuditEntry> = {}): WaiverAuditEntry {
    return {
      id, waiverId: 'w-1', prId: 42, repositoryUuid: REPO, rule: 'R-04', requestedBy: 'lea',
      decision: 'requested', reason: 'correctif urgent', identity: 'declared', createdAt: NOW, ...over,
    };
  }

  it('relit la trace d’une dérogation dans l’ordre chronologique', async () => {
    const store = createMemoryStore();
    await store.waiverAudit.record(ligne('a2', {
      decision: 'granted', decidedBy: 'tech-lead', identity: 'verified', createdAt: '2026-11-11T11:00:00.000Z',
    }));
    await store.waiverAudit.record(ligne('a1', { createdAt: '2026-11-11T10:30:00.000Z' }));
    const trace = await store.waiverAudit.listByWaiver('w-1');
    expect(trace.map((e) => e.id)).toEqual(['a1', 'a2']);
    expect(trace[1]?.identity).toBe('verified');
    expect(trace[1]?.decidedBy).toBe('tech-lead');
  });

  it('remplace au lieu de dupliquer, et retrouve une ligne par identifiant', async () => {
    const store = createMemoryStore();
    await store.waiverAudit.record(ligne('a1'));
    await store.waiverAudit.record(ligne('a1', { decision: 'refused' }));
    expect(await store.waiverAudit.listByWaiver('w-1')).toHaveLength(1);
    expect((await store.waiverAudit.find('a1'))?.decision).toBe('refused');
    expect(await store.waiverAudit.find('a9')).toBeUndefined();
  });

  it('liste par PR et par période, les plus récents d’abord', async () => {
    const store = createMemoryStore();
    await store.waiverAudit.record(ligne('a1', { createdAt: '2026-11-11T09:00:00.000Z' }));
    await store.waiverAudit.record(ligne('a2', { prId: 43, createdAt: '2026-11-11T11:00:00.000Z' }));
    await store.waiverAudit.record(ligne('a3', { repositoryUuid: 'autre', createdAt: '2026-11-11T12:00:00.000Z' }));
    expect(await store.waiverAudit.listByPullRequest(REPO, 42)).toHaveLength(1);
    const periode = await store.waiverAudit.listSince('2026-11-11T10:00:00.000Z');
    expect(periode.map((e) => e.id)).toEqual(['a3', 'a2']);
    const borne = await store.waiverAudit.listSince('2026-11-11T10:00:00.000Z', '2026-11-11T11:30:00.000Z');
    expect(borne.map((e) => e.id)).toEqual(['a2']);
  });

  it('n’offre aucune méthode d’effacement : la trace est durable (§16)', () => {
    const store = createMemoryStore();
    expect(Object.keys(store.waiverAudit).some((cle) => /purge|remove|delete|expire/i.test(cle))).toBe(false);
  });
});

describe('magasin complet', () => {
  it('rend des copies : muter un résultat ne corrompt pas le magasin', async () => {
    const store = createMemoryStore();
    await store.ruleConfig.upsert('p1', config('R-04'), NOW);
    const lu = await store.ruleConfig.find('p1', 'R-04');
    if (lu !== undefined) lu.level = 'information';
    expect((await store.ruleConfig.find('p1', 'R-04'))?.level).toBe('blocking');
  });

  it('expose les dix ports', () => {
    const store = createMemoryStore();
    expect(Object.keys(store).sort()).toEqual([
      'evaluations', 'freezes', 'incidents', 'issueCache', 'nonces', 'pairing', 'repoService',
      'ruleConfig', 'waiverAudit', 'waivers',
    ]);
  });
});
