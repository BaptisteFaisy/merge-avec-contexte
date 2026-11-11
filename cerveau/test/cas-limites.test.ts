/**
 * Cas limites du §17 (audit items 26, 29, 31) :
 * - cas 9 : un ticket déplacé de projet change de clé, le cache suit l'identifiant ;
 * - cas 4 : un gel qui commence entre le push et la fusion est rattrapé par `on-merge` ;
 * - §13.4 : un événement sur un incident rafraîchit aussi le cache des incidents du service.
 */
import { describe, expect, it } from 'vitest';
import type { Freeze, Incident, IssueContext, PrContext } from '../src/shared';
import { lireTicket } from '../src/cache/issue-cache';
import type { DepsCacheTicket } from '../src/cache/issue-cache';
import type { EntreeCache, IssueCacheRepository } from '../src/cache/ports';
import { evenementDepuisJira, servicesConcernes } from '../src/cache/evenements';
import type { IssueReader } from '../src/jira/reader';
import { invaliderPourEvenement } from '../src/app/cache-adaptateurs';
import type { DepsEvenement } from '../src/app/cache-adaptateurs';
import { createMemoryStore } from '../src/storage/memory-store';
import { loggerSilencieux } from '../src/app/logger';
import { evaluateAll } from '../src/rules/engine';
import type { EvaluationInput } from '../src/rules/input';
import { defaultRuleConfigs } from '../src/rules/defaults';

/** L'époque : une entrée marquée périmée sans être effacée. */
const EPOQUE = '1970-01-01T00:00:00.000Z';

/** Instantané minimal de ticket. */
function ticket(cle: string, surcharges: Partial<IssueContext> = {}): IssueContext {
  return {
    key: cle,
    id: '1',
    exists: true,
    status: 'In Progress',
    criteria: [],
    links: [],
    fixVersions: [],
    labels: [],
    components: [],
    incidentKeys: [],
    ...surcharges,
  };
}

/** Cache de tickets en mémoire. */
class CacheMemoire implements IssueCacheRepository {
  readonly entrees = new Map<string, EntreeCache<IssueContext>>();

  async lire(cle: string): Promise<EntreeCache<IssueContext> | undefined> {
    return this.entrees.get(cle);
  }

  async ecrire(cle: string, snapshot: IssueContext, now: string): Promise<void> {
    this.entrees.set(cle, { valeur: snapshot, updatedAt: now });
  }
}

/** Lecteur Jira de test : tickets et incidents servis par tables. */
class LecteurTest implements IssueReader {
  readonly appelsLire: string[] = [];
  readonly appelsIncidents: string[] = [];

  constructor(
    private readonly tickets: Map<string, IssueContext> = new Map(),
    private readonly incidents: Map<string, Incident[]> = new Map(),
  ) {}

  async lire(cle: string): Promise<IssueContext> {
    this.appelsLire.push(cle);
    const trouve = this.tickets.get(cle);
    if (!trouve) return ticket(cle, { exists: false });
    return trouve;
  }

  async incidentsOuverts(service: string): Promise<Incident[]> {
    this.appelsIncidents.push(service);
    return this.incidents.get(service) ?? [];
  }
}

/** Dépendances du cache de tickets, horloge figée. */
function depsTicket(cache: CacheMemoire, lecteur: IssueReader, now: string): DepsCacheTicket {
  return { cache, lecteur, now: () => now };
}

describe('§17 cas 9 — ticket déplacé de projet (item 26)', () => {
  it('avant déplacement : la clé rendue est la clé demandée, écrite fraîche', async () => {
    const cache = new CacheMemoire();
    const lecteur = new LecteurTest(new Map([['ABC-1', ticket('ABC-1')]]));
    const now = '2026-11-11T10:00:00.000Z';
    const issue = await lireTicket('ABC-1', depsTicket(cache, lecteur, now));
    expect(issue?.key).toBe('ABC-1');
    expect(cache.entrees.get('ABC-1')?.updatedAt).toBe(now);
    expect(cache.entrees.size).toBe(1);
  });

  it('après déplacement : l’instantané est réécrit sous la nouvelle clé', async () => {
    const cache = new CacheMemoire();
    // Jira redirige OLD-1 vers NEW-2 : le lecteur rend la nouvelle clé.
    const lecteur = new LecteurTest(new Map([['OLD-1', ticket('NEW-2', { id: '42' })]]));
    const now = '2026-11-11T10:00:00.000Z';
    const issue = await lireTicket('OLD-1', depsTicket(cache, lecteur, now));
    expect(issue?.key).toBe('NEW-2');
    expect(issue?.exists).toBe(true);
    expect(cache.entrees.get('NEW-2')?.updatedAt).toBe(now);
    expect(cache.entrees.get('NEW-2')?.valeur.id).toBe('42');
  });

  it('l’ancienne clé est conservée mais marquée périmée, pas effacée', async () => {
    const cache = new CacheMemoire();
    await cache.ecrire('OLD-1', ticket('OLD-1'), '2026-11-11T09:00:00.000Z');
    const lecteur = new LecteurTest(new Map([['OLD-1', ticket('NEW-2')]]));
    await lireTicket('OLD-1', depsTicket(cache, lecteur, '2026-11-11T10:00:00.000Z'));
    expect(cache.entrees.get('OLD-1')?.updatedAt).toBe(EPOQUE);
    expect(cache.entrees.get('OLD-1')?.valeur.key).toBe('NEW-2');
  });

  it('la nouvelle clé est ensuite servie par le cache, sans rappel de Jira', async () => {
    const cache = new CacheMemoire();
    const lecteur = new LecteurTest(new Map([['OLD-1', ticket('NEW-2')]]));
    const deps = depsTicket(cache, lecteur, '2026-11-11T10:00:00.000Z');
    await lireTicket('OLD-1', deps);
    const relu = await lireTicket('NEW-2', deps);
    expect(relu?.key).toBe('NEW-2');
    expect(lecteur.appelsLire).toEqual(['OLD-1']);
  });
});

describe('§17 cas 4 — gel commencé entre le push et la fusion (item 29)', () => {
  const GEL: Freeze = {
    id: 'gel-1',
    name: 'Black Friday',
    startsAt: '2026-11-11T10:00:00.000Z',
    endsAt: '2026-11-11T12:00:00.000Z',
    branches: ['main'],
    services: [],
    recurrence: { kind: 'none' },
  };

  function pr(declencheur: PrContext['trigger']): PrContext {
    return {
      workspaceUuid: 'ws-1',
      repositoryUuid: 'repo-1',
      repositorySlug: 'payments-api',
      pullRequestId: 42,
      title: 'PAY-123 limite les tentatives',
      sourceBranch: 'feature/PAY-123-limite',
      targetBranch: 'main',
      commitMessages: [],
      changedPaths: [],
      reviewers: [],
      trigger: declencheur,
    };
  }

  function entree(declencheur: PrContext['trigger'], now: string): EvaluationInput {
    return {
      pr: pr(declencheur),
      issues: [ticket('PAY-123')],
      freezes: [GEL],
      incidents: [],
      waivers: [],
      configs: defaultRuleConfigs(),
      now,
      locale: 'fr',
    };
  }

  it('autorise au push, avant le début du gel', () => {
    const avant = evaluateAll(entree('on-code-pushed', '2026-11-11T09:30:00.000Z'));
    expect(avant.verdict).toBe('allowed');
    expect(avant.reasons.some((raison) => raison.rule === 'R-04')).toBe(false);
  });

  it('bloque à la fusion demandée pendant le gel : la seconde évaluation le rattrape', () => {
    const apres = evaluateAll(entree('on-merge', '2026-11-11T10:30:00.000Z'));
    expect(apres.verdict).toBe('blocked');
    const raison = apres.reasons.find((r) => r.rule === 'R-04');
    expect(raison).toBeDefined();
    expect(raison?.text).toContain('Black Friday');
    expect(apres.evaluatedAt).toBe('2026-11-11T10:30:00.000Z');
  });
});

describe('§13.4 — événement Jira et cache des incidents (item 31)', () => {
  const INCIDENT: Incident = {
    service: 'api-paiement',
    incidentKey: 'INC-11',
    openedAt: '2026-11-11T09:00:00.000Z',
  };

  function depsEvenement(lecteur: IssueReader, now = '2026-11-11T10:05:00.000Z'): DepsEvenement {
    return {
      store: createMemoryStore({ clock: () => Date.parse(now) }),
      jira: lecteur,
      clock: () => now,
      logger: loggerSilencieux(),
    };
  }

  it('extrait la clé et le type du ticket depuis l’événement brut', () => {
    const event = { issue: { key: 'INC-11', fields: { issuetype: { name: 'Incident' } } } };
    expect(evenementDepuisJira(event)).toEqual({ cle: 'INC-11', typeTicket: 'Incident' });
    expect(evenementDepuisJira(undefined)).toEqual({ cle: undefined, typeTicket: undefined });
    expect(evenementDepuisJira({ issue: { key: '' } })).toEqual({ cle: undefined, typeTicket: undefined });
  });

  it('désigne les services d’un incident (composants + table) et d’un ticket lié', () => {
    const lie = ticket('ABC-9', { incidentKeys: ['INC-11'] });
    expect(servicesConcernes('ABC-9', 'Story', lie, [INCIDENT])).toEqual(['api-paiement']);
    const incident = ticket('INC-11', { components: ['api-paiement'] });
    expect(servicesConcernes('INC-11', 'Incident', incident, [])).toEqual(['api-paiement']);
    expect(servicesConcernes('INC-11', undefined, incident, [INCIDENT])).toEqual(['api-paiement']);
  });

  it('ne désigne aucun service pour un ticket sans rapport', () => {
    expect(servicesConcernes('ABC-1', 'Story', ticket('ABC-1'), [INCIDENT])).toEqual([]);
  });

  it('un incident clos côté Jira est rattrapé : la table ne le dit plus ouvert', async () => {
    const deps = depsEvenement(new LecteurTest(
      new Map([['INC-11', ticket('INC-11', { components: ['api-paiement'], status: 'Done' })]]),
      new Map([['api-paiement', []]]), // Jira : plus aucun incident ouvert
    ));
    await deps.store.incidents.open(INCIDENT);
    await deps.store.issueCache.write({
      issueKey: 'INC-11',
      issue: ticket('INC-11'),
      updatedAt: '2026-11-11T10:00:00.000Z',
    });
    await invaliderPourEvenement({ issue: { key: 'INC-11', fields: { issuetype: { name: 'Incident' } } } }, deps);
    expect(await deps.store.incidents.listOpen('api-paiement')).toEqual([]);
    const entree = await deps.store.issueCache.read('INC-11');
    expect(entree?.issue.status).toBe('Done');
    expect(entree?.updatedAt).toBe('2026-11-11T10:05:00.000Z');
  });

  it('un événement sur un ticket lié à l’incident rafraîchit aussi le service', async () => {
    const deps = depsEvenement(new LecteurTest(
      new Map([['ABC-9', ticket('ABC-9', { incidentKeys: ['INC-11'] })]]),
      new Map([['api-paiement', []]]),
    ));
    await deps.store.incidents.open(INCIDENT);
    await invaliderPourEvenement({ issue: { key: 'ABC-9', fields: { issuetype: { name: 'Story' } } } }, deps);
    expect(await deps.store.incidents.listOpen('api-paiement')).toEqual([]);
  });

  it('un incident ouvert côté Jira est ajouté à la table par l’événement', async () => {
    const nouveau: Incident = { ...INCIDENT, incidentKey: 'INC-12', openedAt: '2026-11-11T10:04:00.000Z' };
    const deps = depsEvenement(new LecteurTest(
      new Map([['INC-12', ticket('INC-12', { components: ['api-paiement'] })]]),
      new Map([['api-paiement', [INCIDENT, nouveau]]]),
    ));
    await deps.store.incidents.open(INCIDENT); // la table ne connaît que INC-11
    await invaliderPourEvenement({ issue: { key: 'INC-12', fields: { issuetype: { name: 'Incident' } } } }, deps);
    const ouverts = await deps.store.incidents.listOpen('api-paiement');
    expect(ouverts.map((incident) => incident.incidentKey).sort()).toEqual(['INC-11', 'INC-12']);
  });

  it('un ticket sans rapport ne touche ni la table ni la recherche d’incidents', async () => {
    const lecteur = new LecteurTest(new Map([['ABC-1', ticket('ABC-1', { components: ['autre'] })]]));
    const deps = depsEvenement(lecteur);
    await deps.store.incidents.open(INCIDENT);
    await invaliderPourEvenement({ issue: { key: 'ABC-1', fields: { issuetype: { name: 'Story' } } } }, deps);
    expect(lecteur.appelsIncidents).toEqual([]);
    expect(await deps.store.incidents.listOpen('api-paiement')).toEqual([INCIDENT]);
  });

  it('un événement sans clé exploitable ne fait rien et ne lève pas', async () => {
    const deps = depsEvenement(new LecteurTest());
    await expect(invaliderPourEvenement({ issue: {} }, deps)).resolves.toBeUndefined();
    await expect(invaliderPourEvenement(undefined, deps)).resolves.toBeUndefined();
  });

  it('une recherche d’incidents en panne est journalisée, sans exception', async () => {
    const lecteur = new LecteurTest(
      new Map([['INC-11', ticket('INC-11', { components: ['api-paiement'] })]]),
    );
    lecteur.incidentsOuverts = async () => {
      throw new Error('HTTP 502');
    };
    const deps = depsEvenement(lecteur);
    await deps.store.incidents.open(INCIDENT);
    await expect(
      invaliderPourEvenement({ issue: { key: 'INC-11', fields: { issuetype: { name: 'Incident' } } } }, deps),
    ).resolves.toBeUndefined();
    expect(await deps.store.incidents.listOpen('api-paiement')).toEqual([INCIDENT]);
  });
});
