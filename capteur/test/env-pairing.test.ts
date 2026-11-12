/**
 * Jumelage par variables d'environnement : repli seulement, l'écran de
 * réglages garde la priorité, et le secret n'apparaît dans aucun message.
 */
import { describe, expect, it } from 'vitest';
import { avecRepliEnvironnement, envPret, lireEnvPairing, reglagesAvecRepliEnvironnement } from '../src/app/env-pairing';
import { MemoryPairingStore } from '../src/pairing/store';
import { MemorySettingsStore } from '../src/policy/settings';

const WS = 'ws-1';
const ENV = {
  MAC_BRIDGE_URL: 'https://pont.exemple.test/v2',
  MAC_SHARED_SECRET: 'secret-de-test',
  MAC_SITE_URL: 'https://site.exemple.test',
  MAC_FALLBACK_POLICY: 'closed',
  MAC_ENVOI_CHEMINS: '0',
};

describe('lecture des variables', () => {
  it('lit le jumelage et les réglages, valeurs vides ignorées', () => {
    const env = lireEnvPairing(ENV);
    expect(env).toMatchObject({
      bridgeUrl: ENV.MAC_BRIDGE_URL,
      secret: ENV.MAC_SHARED_SECRET,
      siteUrl: ENV.MAC_SITE_URL,
      fallbackPolicy: 'closed',
      envoiDesChemins: false,
    });
    expect(envPret(env)).toBe(true);
    expect(envPret(lireEnvPairing({ MAC_BRIDGE_URL: '  ' }))).toBe(false);
  });

  it('accepte open/fermé et true/false pour les drapeaux', () => {
    expect(lireEnvPairing({ MAC_FALLBACK_POLICY: 'open' }).fallbackPolicy).toBe('open');
    expect(lireEnvPairing({ MAC_FALLBACK_POLICY: 'nimporte' }).fallbackPolicy).toBeUndefined();
    expect(lireEnvPairing({ MAC_ENVOI_CHEMINS: 'false' }).envoiDesChemins).toBe(false);
    expect(lireEnvPairing({ MAC_ENVOI_CHEMINS: '1' }).envoiDesChemins).toBe(true);
  });
});

describe('repli de jumelage', () => {
  it('sert le jumelage de l’environnement quand rien n’est enregistré', async () => {
    const store = avecRepliEnvironnement(new MemoryPairingStore(), lireEnvPairing(ENV));
    expect(await store.getSecret(WS)).toBe('secret-de-test');
    expect(await store.getBridgeUrl(WS)).toBe(ENV.MAC_BRIDGE_URL);
    const pairing = await store.getPairing(WS);
    expect(pairing).toMatchObject({ siteUrl: ENV.MAC_SITE_URL, pairedBy: 'environnement' });
  });

  it('laisse la priorité au jumelage saisi dans l’écran', async () => {
    const memoire = new MemoryPairingStore();
    await memoire.savePairing(WS, { bridgeUrl: 'https://ecran.exemple', siteUrl: 's', pairedAt: 'a' }, 'secret-ecran');
    const store = avecRepliEnvironnement(memoire, lireEnvPairing(ENV));
    expect(await store.getSecret(WS)).toBe('secret-ecran');
    expect(await store.getBridgeUrl(WS)).toBe('https://ecran.exemple');
  });

  it('restreint le repli à l’espace demandé quand MAC_WORKSPACE est posé', async () => {
    const store = avecRepliEnvironnement(new MemoryPairingStore(), lireEnvPairing({ ...ENV, MAC_WORKSPACE: 'ws-attendu' }));
    expect(await store.getSecret('ws-attendu')).toBe('secret-de-test');
    expect(await store.getSecret('autre-ws')).toBeUndefined();
  });

  it('applique la politique de repli et l’envoi des chemins posés par variable', async () => {
    const store = reglagesAvecRepliEnvironnement(new MemorySettingsStore(), lireEnvPairing(ENV));
    expect(await store.getSettings(WS)).toEqual({ fallbackPolicy: 'closed', envoiDesChemins: false });
  });

  it('n’écrase pas un réglage enregistré depuis l’écran', async () => {
    const memoire = new MemorySettingsStore();
    await memoire.setFallbackPolicy(WS, 'open');
    const store = reglagesAvecRepliEnvironnement(memoire, lireEnvPairing(ENV));
    expect((await store.getSettings(WS)).fallbackPolicy).toBe('open');
  });
});
