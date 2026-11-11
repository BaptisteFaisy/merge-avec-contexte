/**
 * Client du pont signé : en-têtes et signature, délai de 4 s, erreurs
 * normalisées, absence de jumelage. `fetch` et l'horloge sont des doublures ;
 * le magasin est l'implémentation mémoire livrée par `pairing/store.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import { appelerPont, type FetchPont, type InitPont, type ReponsePont } from '../src/bridge/client';
import { MemoryPairingStore, type PairingStore } from '../src/pairing/store';
import { computeSignature, HEADER_NAMES, SIGNATURE_VERSION } from '../src/shared';

const SECRET = 'secret-partage-de-test';
const URL_PONT = 'https://cerveau.webtrigger.atlassian.app/mac/bridge';
const SITE = 'https://acme.atlassian.net';
const NOW = 1_800_000_000_000;
const NONCE = 'nonce-fixe-de-test';

/** Magasin jumelé (secret + adresse) ; `null` = aucun secret enregistré. */
async function storeJumele(secret: string | null = SECRET): Promise<PairingStore> {
  const store = new MemoryPairingStore();
  if (secret === null) return store;
  await store.savePairing('ws-1', { bridgeUrl: URL_PONT, siteUrl: SITE, pairedAt: '2026-11-11T09:00:00Z' }, secret);
  return store;
}

/** Magasin avec un secret mais aucune adresse de pont. */
async function storeSansAdresse(): Promise<PairingStore> {
  const store = new MemoryPairingStore();
  await store.setSecret('ws-1', SECRET);
  return store;
}

/** Magasin en panne : la lecture du secret lève, le client ne doit pas suivre. */
class StoreCasse extends MemoryPairingStore {
  override async getSecret(): Promise<string | undefined> {
    throw new Error('KVS indisponible');
  }
}

async function options(surcharges: Partial<Parameters<typeof appelerPont>[1]> = {}) {
  return {
    workspaceUuid: 'ws-1',
    store: await storeJumele(),
    now: () => NOW,
    nonceGenerator: () => NONCE,
    timeoutMs: 50,
    ...surcharges,
  };
}

function reponseOk(corps: unknown): ReponsePont {
  return { ok: true, status: 200, json: async () => corps, text: async () => JSON.stringify(corps) };
}

/** Double de `fetch` qui enregistre l'appel et rend une réponse fixe. */
function fauxFetch(reponse: ReponsePont) {
  const appels: Array<{ url: string; init: InitPont }> = [];
  const fn: FetchPont = async (url, init) => {
    appels.push({ url, init });
    return reponse;
  };
  return { fn, appels };
}

const ENVELOPPE = {
  route: 'evaluate' as const,
  payload: { workspaceUuid: 'ws-1', repositoryUuid: 'repo-1', pullRequestId: 42, issueKeys: ['PAY-123'] },
};

describe('appelerPont — signature et en-têtes', () => {
  it('envoie l’enveloppe en POST sur l’adresse du pont', async () => {
    const { fn, appels } = fauxFetch(reponseOk({ verdict: 'allowed' }));
    await appelerPont(ENVELOPPE, await options({ fetch: fn }));
    expect(appels).toHaveLength(1);
    expect(appels[0]?.url).toBe(URL_PONT);
    expect(appels[0]?.init.method).toBe('POST');
    expect(JSON.parse(appels[0]?.init.body ?? '{}')).toEqual(ENVELOPPE);
  });

  it('signe le corps avec le secret du jumelage (HMAC-SHA256 de la chaîne canonique)', async () => {
    const { fn, appels } = fauxFetch(reponseOk({ verdict: 'allowed' }));
    await appelerPont(ENVELOPPE, await options({ fetch: fn }));
    const entetes = appels[0]?.init.headers ?? {};
    const corps = appels[0]?.init.body ?? '';
    expect(entetes[HEADER_NAMES.version]).toBe(SIGNATURE_VERSION);
    expect(entetes[HEADER_NAMES.timestamp]).toBe(String(NOW));
    expect(entetes[HEADER_NAMES.nonce]).toBe(NONCE);
    expect(entetes[HEADER_NAMES.signature]).toBe(computeSignature(SECRET, String(NOW), NONCE, corps));
    expect(entetes['content-type']).toBe('application/json');
  });

  it('n’envoie jamais le secret dans la requête', async () => {
    const { fn, appels } = fauxFetch(reponseOk({ verdict: 'allowed' }));
    await appelerPont(ENVELOPPE, await options({ fetch: fn }));
    expect(JSON.stringify(appels[0])).not.toContain(SECRET);
  });

  it('rend le corps JSON du Cerveau tel quel', async () => {
    const evaluation = { verdict: 'blocked', reasons: [], issueKeys: [], trigger: 'on-merge' };
    const { fn } = fauxFetch(reponseOk(evaluation));
    const resultat = await appelerPont(ENVELOPPE, await options({ fetch: fn }));
    expect(resultat).toEqual({ ok: true, data: evaluation });
  });
});

describe('appelerPont — délai', () => {
  it('renonce au bout du délai imposé et rend timeout', async () => {
    const fn: FetchPont = () => new Promise<ReponsePont>(() => undefined);
    const resultat = await appelerPont(ENVELOPPE, await options({ fetch: fn, timeoutMs: 30 }));
    expect(resultat).toMatchObject({ ok: false, error: { kind: 'timeout' } });
  });

  it('borne le délai à 4 s par défaut', async () => {
    vi.useFakeTimers();
    const fn: FetchPont = () => new Promise<ReponsePont>(() => undefined);
    const appel = appelerPont(ENVELOPPE, {
      workspaceUuid: 'ws-1',
      store: await storeJumele(),
      fetch: fn,
      now: () => NOW,
      nonceGenerator: () => NONCE,
    });
    let resolu = false;
    void appel.then(() => {
      resolu = true;
    });
    await vi.advanceTimersByTimeAsync(3_999);
    expect(resolu).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const resultat = await appel;
    vi.useRealTimers();
    expect(resultat).toMatchObject({ ok: false, error: { kind: 'timeout' } });
  });

  it('annule la requête en cours via AbortController', async () => {
    let signalVu: AbortSignal | undefined;
    const fn: FetchPont = (_url, init) => {
      signalVu = init.signal;
      return new Promise<ReponsePont>(() => undefined);
    };
    await appelerPont(ENVELOPPE, await options({ fetch: fn, timeoutMs: 20 }));
    expect(signalVu?.aborted).toBe(true);
  });

  it('ne tente qu’une seule fois : aucune relance après échec', async () => {
    const fn = vi.fn<FetchPont>(async () => {
      throw new Error('réseau coupé');
    });
    await appelerPont(ENVELOPPE, await options({ fetch: fn }));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('appelerPont — erreurs normalisées', () => {
  it('rend unpaired sans appeler le réseau quand le workspace n’est pas jumelé', async () => {
    const fn = vi.fn<FetchPont>(async () => reponseOk({}));
    const resultat = await appelerPont(ENVELOPPE, await options({ fetch: fn, store: await storeJumele(null) }));
    expect(resultat).toMatchObject({ ok: false, error: { kind: 'unpaired' } });
    expect(fn).not.toHaveBeenCalled();
  });

  it('rend unpaired quand l’adresse du pont est absente', async () => {
    const resultat = await appelerPont(ENVELOPPE, await options({ store: await storeSansAdresse() }));
    expect(resultat).toMatchObject({ ok: false, error: { kind: 'unpaired' } });
  });

  it('rend unreachable quand fetch rejette', async () => {
    const fn: FetchPont = async () => {
      throw new Error('ENOTFOUND cerveau.webtrigger.atlassian.app');
    };
    const resultat = await appelerPont(ENVELOPPE, await options({ fetch: fn }));
    expect(resultat).toMatchObject({ ok: false, error: { kind: 'unreachable' } });
  });

  it('rend http avec le statut quand le Cerveau répond en erreur', async () => {
    const reponse: ReponsePont = {
      ok: false,
      status: 503,
      json: async () => ({}),
      text: async () => '{"error":"internal","message":"indisponible"}',
    };
    const { fn } = fauxFetch(reponse);
    const resultat = await appelerPont(ENVELOPPE, await options({ fetch: fn }));
    expect(resultat).toMatchObject({ ok: false, error: { kind: 'http', status: 503 } });
  });

  it('rend bad-response quand le corps n’est pas du JSON', async () => {
    const reponse: ReponsePont = {
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('Unexpected token <');
      },
      text: async () => '<html>',
    };
    const { fn } = fauxFetch(reponse);
    const resultat = await appelerPont(ENVELOPPE, await options({ fetch: fn }));
    expect(resultat).toMatchObject({ ok: false, error: { kind: 'bad-response' } });
  });

  it('rend unpaired quand le Cerveau signale un jumelage perdu', async () => {
    const reponse: ReponsePont = {
      ok: false,
      status: 401,
      json: async () => ({ error: 'unpaired' }),
      text: async () => '{"error":"unpaired"}',
    };
    const { fn } = fauxFetch(reponse);
    const resultat = await appelerPont(ENVELOPPE, await options({ fetch: fn }));
    expect(resultat).toMatchObject({ ok: false, error: { kind: 'unpaired', status: 401 } });
  });

  it('ne lève jamais, même si le magasin de jumelage jette', async () => {
    const resultat = await appelerPont(ENVELOPPE, await options({ store: new StoreCasse() }));
    expect(resultat).toMatchObject({ ok: false, error: { kind: 'unreachable' } });
  });
});
