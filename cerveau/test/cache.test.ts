import { describe, expect, it } from 'vitest';
import type { Incident, IssueContext } from '../src/shared';
import { TTL_MS, invalider, lireTicket } from '../src/cache/issue-cache';
import type { DepsCacheTicket } from '../src/cache/issue-cache';
import { incidentsDuService, serviceIncidentOuvert } from '../src/cache/service-cache';
import type { DepsCacheIncidents } from '../src/cache/service-cache';
import type { EntreeCache, IssueCacheRepository } from '../src/cache/ports';
import type { IssueReader } from '../src/jira/reader';

/** Instantané minimal d'un ticket, suffisant pour distinguer deux lectures. */
function ticket(cle: string, statut: string): IssueContext {
  return {
    key: cle,
    id: '1',
    exists: true,
    status: statut,
    criteria: [],
    links: [],
    fixVersions: [],
    labels: [],
    components: [],
    incidentKeys: [],
  };
}

/** Cache de tickets en mémoire, avec compteurs d'appels et panne pilotable. */
class CacheMemoire implements IssueCacheRepository {
  readonly entrees = new Map<string, EntreeCache<IssueContext>>();
  lectures = 0;
  ecritures = 0;
  panneLecture = false;

  async lire(cle: string): Promise<EntreeCache<IssueContext> | undefined> {
    this.lectures += 1;
    if (this.panneLecture) throw new Error('base indisponible');
    return this.entrees.get(cle);
  }

  async ecrire(cle: string, snapshot: IssueContext, now: string): Promise<void> {
    this.ecritures += 1;
    this.entrees.set(cle, { valeur: snapshot, updatedAt: now });
  }
}

/** Lecteur Jira de test : répond une valeur fixe ou échoue. */
class LecteurFixe implements IssueReader {
  appels = 0;
  constructor(
    private readonly valeur: IssueContext | Error,
    private readonly incidents: Incident[] | Error = [],
  ) {}

  async lire(): Promise<IssueContext> {
    this.appels += 1;
    if (this.valeur instanceof Error) throw this.valeur;
    return this.valeur;
  }

  async incidentsOuverts(): Promise<Incident[]> {
    if (this.incidents instanceof Error) throw this.incidents;
    return this.incidents;
  }
}

/** Dépendances du cache de tickets, horloge figée et journal capturé. */
function depsTicket(
  cache: CacheMemoire,
  lecteur: LecteurFixe,
  now: string,
  ttlMs?: number,
): DepsCacheTicket & { lignes: string[] } {
  const lignes: string[] = [];
  return {
    cache,
    lecteur,
    now: () => now,
    ttlMs,
    journal: (message) => lignes.push(message),
    lignes,
  };
}

describe('lireTicket', () => {
  it('rend le cache frais sans appeler Jira', async () => {
    const cache = new CacheMemoire();
    await cache.ecrire('ABC-1', ticket('ABC-1', 'En cours'), '2026-11-11T10:00:00.000Z');
    const lecteur = new LecteurFixe(ticket('ABC-1', 'Relecture Jira'));
    const issue = await lireTicket('ABC-1', depsTicket(cache, lecteur, '2026-11-11T10:00:30.000Z'));
    expect(issue?.status).toBe('En cours');
    expect(lecteur.appels).toBe(0);
    expect(cache.ecritures).toBe(1);
  });

  it('relit Jira et réécrit le cache quand l’entrée a plus de 60 secondes', async () => {
    const cache = new CacheMemoire();
    await cache.ecrire('ABC-1', ticket('ABC-1', 'En cours'), '2026-11-11T10:00:00.000Z');
    const lecteur = new LecteurFixe(ticket('ABC-1', 'Terminé'));
    const now = '2026-11-11T10:01:00.000Z';
    const issue = await lireTicket('ABC-1', depsTicket(cache, lecteur, now));
    expect(issue?.status).toBe('Terminé');
    expect(lecteur.appels).toBe(1);
    expect(cache.entrees.get('ABC-1')).toEqual({
      valeur: ticket('ABC-1', 'Terminé'),
      updatedAt: now,
    });
  });

  it('lit Jira quand le cache est vide', async () => {
    const cache = new CacheMemoire();
    const lecteur = new LecteurFixe(ticket('ABC-1', 'À faire'));
    const issue = await lireTicket('ABC-1', depsTicket(cache, lecteur, '2026-11-11T10:00:00.000Z'));
    expect(issue?.status).toBe('À faire');
    expect(cache.ecritures).toBe(1);
  });

  it('rend undefined sans exception quand la lecture Jira échoue', async () => {
    const cache = new CacheMemoire();
    const lecteur = new LecteurFixe(new Error('HTTP 502'));
    const deps = depsTicket(cache, lecteur, '2026-11-11T10:00:00.000Z');
    await expect(lireTicket('ABC-1', deps)).resolves.toBeUndefined();
    expect(deps.lignes).toHaveLength(1);
    expect(deps.lignes[0]).toContain('HTTP 502');
  });

  it('rend undefined sans exception quand le cache lui-même est en panne', async () => {
    const cache = new CacheMemoire();
    cache.panneLecture = true;
    const lecteur = new LecteurFixe(new Error('Jira muet'));
    const deps = depsTicket(cache, lecteur, '2026-11-11T10:00:00.000Z');
    await expect(lireTicket('ABC-1', deps)).resolves.toBeUndefined();
    expect(deps.lignes.join(' ')).toContain('base indisponible');
  });

  it('borne le TTL par l’horloge injectée et non par une constante', async () => {
    const cache = new CacheMemoire();
    await cache.ecrire('ABC-1', ticket('ABC-1', 'En cours'), '2026-11-11T10:00:00.000Z');
    const lecteur = new LecteurFixe(ticket('ABC-1', 'Relu'));
    const court = await lireTicket(
      'ABC-1',
      depsTicket(cache, lecteur, '2026-11-11T10:00:00.500Z', 400),
    );
    expect(court?.status).toBe('Relu');
    expect(lecteur.appels).toBe(1);
    const long = await lireTicket('ABC-1', depsTicket(cache, lecteur, '2026-11-11T10:00:01.000Z'));
    expect(long?.status).toBe('Relu');
    expect(lecteur.appels).toBe(1);
    expect(TTL_MS).toBe(60_000);
  });
});

describe('invalider', () => {
  it('marque l’entrée périmée sans la perdre, et la prochaine lecture relit Jira', async () => {
    const cache = new CacheMemoire();
    await cache.ecrire('ABC-1', ticket('ABC-1', 'En cours'), '2026-11-11T10:00:00.000Z');
    const lecteur = new LecteurFixe(ticket('ABC-1', 'Après événement'));
    const deps = depsTicket(cache, lecteur, '2026-11-11T10:00:05.000Z');
    await invalider('ABC-1', deps);
    expect(cache.entrees.get('ABC-1')?.valeur.status).toBe('En cours');
    const issue = await lireTicket('ABC-1', deps);
    expect(issue?.status).toBe('Après événement');
    expect(lecteur.appels).toBe(1);
  });

  it('ne fait rien pour un ticket absent du cache', async () => {
    const cache = new CacheMemoire();
    const deps = depsTicket(cache, new LecteurFixe(ticket('ABC-1', 'x')), '2026-11-11T10:00:00.000Z');
    await invalider('ABC-9', deps);
    expect(cache.ecritures).toBe(0);
  });
});

/** Cache d'incidents en mémoire : une entrée par service. */
class IncidentsMemoire {
  readonly entrees = new Map<string, EntreeCache<Incident[]>>();
  panne = false;

  async incidentsOuverts(service: string): Promise<EntreeCache<Incident[]> | undefined> {
    if (this.panne) throw new Error('table illisible');
    return this.entrees.get(service);
  }
}

/** Dépendances du cache d'incidents. */
function depsIncidents(
  cache: IncidentsMemoire,
  lecteur: LecteurFixe,
  now: string,
): DepsCacheIncidents & { lignes: string[] } {
  const lignes: string[] = [];
  return { cache, lecteur, now: () => now, journal: (m) => lignes.push(m), lignes };
}

const INCIDENT: Incident = {
  service: 'api-paiement',
  incidentKey: 'INC-11',
  openedAt: '2026-11-11T09:00:00.000Z',
};

describe('incidentsDuService', () => {
  it('rend le cache frais sans interroger Jira', async () => {
    const cache = new IncidentsMemoire();
    cache.entrees.set('api-paiement', {
      valeur: [INCIDENT],
      updatedAt: '2026-11-11T10:00:00.000Z',
    });
    const lecteur = new LecteurFixe(ticket('ABC-1', 'x'), []);
    const incidents = await incidentsDuService(
      'api-paiement',
      depsIncidents(cache, lecteur, '2026-11-11T10:00:30.000Z'),
    );
    expect(incidents).toEqual([INCIDENT]);
  });

  it('relit Jira quand le cache est périmé, et rend undefined si Jira échoue', async () => {
    const cache = new IncidentsMemoire();
    cache.entrees.set('api-paiement', {
      valeur: [INCIDENT],
      updatedAt: '2026-11-11T09:00:00.000Z',
    });
    const lecteur = new LecteurFixe(ticket('ABC-1', 'x'), new Error('HTTP 500'));
    const deps = depsIncidents(cache, lecteur, '2026-11-11T10:00:00.000Z');
    const incidents = await incidentsDuService('api-paiement', deps);
    expect(incidents).toEqual([INCIDENT]);
    expect(deps.lignes.join(' ')).toContain('HTTP 500');
  });

  it('rend undefined sans exception quand la table est en panne', async () => {
    const cache = new IncidentsMemoire();
    cache.panne = true;
    const lecteur = new LecteurFixe(ticket('ABC-1', 'x'), new Error('Jira muet'));
    const deps = depsIncidents(cache, lecteur, '2026-11-11T10:00:00.000Z');
    await expect(incidentsDuService('api-paiement', deps)).resolves.toBeUndefined();
  });
});

describe('serviceIncidentOuvert', () => {
  const now = '2026-11-11T10:00:00.000Z';

  it('reconnaît un incident ouvert sur le service demandé', () => {
    expect(serviceIncidentOuvert([INCIDENT], 'api-paiement', now)).toBe(true);
  });

  it('ignore un autre service, un incident futur ou déjà résolu', () => {
    expect(serviceIncidentOuvert([INCIDENT], 'front', now)).toBe(false);
    expect(
      serviceIncidentOuvert([{ ...INCIDENT, openedAt: '2026-11-11T11:00:00.000Z' }], 'api-paiement', now),
    ).toBe(false);
    expect(
      serviceIncidentOuvert(
        [{ ...INCIDENT, resolvedAt: '2026-11-11T09:30:00.000Z' }],
        'api-paiement',
        now,
      ),
    ).toBe(false);
  });

  it('considère ouvert un incident résolu dans le futur, et rend faux sans horloge lisible', () => {
    expect(
      serviceIncidentOuvert(
        [{ ...INCIDENT, resolvedAt: '2026-11-11T12:00:00.000Z' }],
        'api-paiement',
        now,
      ),
    ).toBe(true);
    expect(serviceIncidentOuvert([INCIDENT], 'api-paiement', 'pas une date')).toBe(false);
    expect(serviceIncidentOuvert([], 'api-paiement', now)).toBe(false);
  });
});
