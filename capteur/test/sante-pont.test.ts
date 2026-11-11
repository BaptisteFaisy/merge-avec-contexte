/**
 * Sonde de la route `health` du pont et bandeau « pont coupé » des réglages
 * de l'espace de travail (§17 cas 10). `fetch` est une doublure, l'horloge
 * n'intervient pas : aucun test ne touche le réseau réel.
 */
import { describe, expect, it } from 'vitest';
import {
  sonderSantePont,
  type FetchPont,
  type InitPont,
  type ReponsePont,
} from '../src/bridge/client';
import { handleWorkspaceSettings, type ResolverDeps } from '../src/app/resolvers';
import { MemoryPairingStore } from '../src/pairing/store';
import { MemorySettingsStore } from '../src/policy/settings';

const URL_PONT = 'https://cerveau.webtrigger.atlassian.app/mac/bridge';
const WS = '{b7e6c8d9-1a2b-4c3d-9e8f-0a1b2c3d4e5f}';
const WS_NU = 'b7e6c8d9-1a2b-4c3d-9e8f-0a1b2c3d4e5f';

/** Réponse réelle de la route `health` du Cerveau (routes.ts, routeHealth). */
const SANTE_OK = { status: 'ok', version: '0.2.0', date: '2026-11-11T08:00:00.000Z', stockage: 'ok' };

function reponse(ok: boolean, status: number, corps: unknown): ReponsePont {
  return { ok, status, json: async () => corps, text: async () => JSON.stringify(corps) };
}

/** Double de `fetch` qui enregistre les appels et rend une réponse fixe. */
function fauxFetch(reponseFixe: ReponsePont) {
  const appels: Array<{ url: string; init: InitPont }> = [];
  const fn: FetchPont = async (url, init) => {
    appels.push({ url, init });
    return reponseFixe;
  };
  return { fn, appels };
}

describe('sonderSantePont', () => {
  it('sonde la route publique health en POST, sans signature', async () => {
    const { fn, appels } = fauxFetch(reponse(true, 200, SANTE_OK));
    const sante = await sonderSantePont(URL_PONT, { fetch: fn, timeoutMs: 50 });
    expect(sante).toEqual({ joignable: true, status: 200 });
    expect(appels[0]?.url).toBe(URL_PONT);
    expect(appels[0]?.init.method).toBe('POST');
    expect(JSON.parse(appels[0]?.init.body ?? '{}')).toEqual({ route: 'health', payload: {} });
    expect(appels[0]?.init.headers['x-mac-signature']).toBeUndefined();
  });

  it('dit injoignable quand le réseau rejette', async () => {
    const fn: FetchPont = async () => {
      throw new Error('ECONNREFUSED');
    };
    expect(await sonderSantePont(URL_PONT, { fetch: fn, timeoutMs: 50 })).toEqual({ joignable: false });
  });

  it('dit injoignable quand le pont répond en erreur HTTP', async () => {
    const { fn } = fauxFetch(reponse(false, 503, { error: 'internal', message: 'indisponible' }));
    const sante = await sonderSantePont(URL_PONT, { fetch: fn, timeoutMs: 50 });
    expect(sante).toEqual({ joignable: false, status: 503 });
  });

  it('borne l’attente : un pont muet vaut injoignable', async () => {
    const fn: FetchPont = () => new Promise<ReponsePont>(() => undefined);
    const sante = await sonderSantePont(URL_PONT, { fetch: fn, timeoutMs: 20 });
    expect(sante.joignable).toBe(false);
  });
});

async function depsReglages(fetch: FetchPont, jumele = true): Promise<ResolverDeps> {
  const pairingStore = new MemoryPairingStore();
  if (jumele) {
    await pairingStore.savePairing(
      WS_NU,
      { bridgeUrl: URL_PONT, siteUrl: 'https://acme.atlassian.net', pairedAt: '2026-11-01T10:00:00Z' },
      'secret-partage-de-test',
    );
  }
  return {
    pairingStore,
    settingsStore: new MemorySettingsStore(),
    lirePr: async () => {
      throw new Error('la sonde des réglages ne lit pas la PR');
    },
    fetch,
    now: () => Date.parse('2026-11-11T08:00:00Z'),
    nonceGenerator: () => 'nonce-fixe',
    timeoutMs: 50,
  };
}

describe('réglages de l’espace — bandeau pont coupé (§17 cas 10)', () => {
  it('affiche le bandeau quand la sonde échoue au chargement', async () => {
    const fn: FetchPont = async () => {
      throw new Error('ECONNREFUSED');
    };
    const vm = await handleWorkspaceSettings({ workspace: { uuid: WS } }, undefined, await depsReglages(fn));
    expect(vm.pontInjoignable).toBe(true);
    expect(vm.bandeauPont?.titre).toBe('Pont interrompu');
    expect(vm.bandeauPont?.texte).toContain('politique de repli');
  });

  it('n’affiche aucun bandeau quand le pont répond à la sonde', async () => {
    const { fn, appels } = fauxFetch(reponse(true, 200, SANTE_OK));
    const vm = await handleWorkspaceSettings({ workspace: { uuid: WS } }, undefined, await depsReglages(fn));
    expect(vm.pontInjoignable).toBe(false);
    expect(vm.bandeauPont).toBeUndefined();
    expect(appels).toHaveLength(1);
  });

  it('ne sonde rien sans jumelage : l’écran dit déjà « Non jumelé »', async () => {
    const { fn, appels } = fauxFetch(reponse(true, 200, SANTE_OK));
    const vm = await handleWorkspaceSettings(
      { workspace: { uuid: WS } },
      undefined,
      await depsReglages(fn, false),
    );
    expect(appels).toHaveLength(0);
    expect(vm.pontInjoignable).toBe(false);
    expect(vm.liaison.texte).toContain('Non jumelé');
  });
});
