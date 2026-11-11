/**
 * Amorçage d'une installation neuve : jumelage posé par variable
 * d'environnement et jeu de démonstration, sans navigateur (§20).
 */
import { describe, expect, it } from 'vitest';
import { amorcerInstallation } from '../src/app/bootstrap';
import { horlogeFixe } from '../src/app/horloge';
import { loggerSilencieux } from '../src/app/logger';
import { createMemorySecretVault } from '../src/app/secrets';
import { configParDefaut } from '../src/app/config';
import { serviceDuDepot } from '../src/app/context-repo';
import { createMemoryStore } from '../src/storage/memory-store';

const NOW = '2026-11-27T16:30:00Z';
const SECRET = 'secret-de-demo-32-octets-0123456';

function deps(env: Parameters<typeof amorcerInstallation>[0]['env']) {
  const store = createMemoryStore();
  const vault = createMemorySecretVault();
  return {
    deps: { store, vault, config: configParDefaut({ projectId: 'DEMO' }), clock: horlogeFixe(NOW), logger: loggerSilencieux(), env },
    store,
    vault,
  };
}

describe('amorçage d’une installation', () => {
  it('ne fait rien sans variable d’environnement', async () => {
    const { deps: d, store } = deps({ jeuDeDemo: false });
    const resume = await amorcerInstallation(d);
    expect(resume).toEqual({ jumelage: 'non-demande', demo: 'non-demande', demoResume: undefined });
    expect(await store.pairing.current()).toBeUndefined();
  });

  it('jumelle l’espace demandé et range le secret dans le coffre', async () => {
    const { deps: d, store, vault } = deps({ workspaceUuid: 'ws-demo', secret: SECRET, jeuDeDemo: false });
    const resume = await amorcerInstallation(d);
    expect(resume.jumelage).toBe('cree');
    const jumelage = await store.pairing.current();
    expect(jumelage?.workspaceUuid).toBe('ws-demo');
    expect(jumelage?.secretRef).not.toBe(SECRET);
    expect(await vault.read(jumelage?.secretRef ?? '')).toBe(SECRET);
  });

  it('est idempotent : un second amorçage conserve le jumelage', async () => {
    const env = { workspaceUuid: 'ws-demo', secret: SECRET, jeuDeDemo: false };
    const { deps: d } = deps(env);
    await amorcerInstallation(d);
    expect((await amorcerInstallation(d)).jumelage).toBe('existant');
  });

  it('charge le jeu de démonstration et le rend exploitable', async () => {
    const { deps: d, store } = deps({ workspaceUuid: 'ws-demo', secret: SECRET, jeuDeDemo: true });
    const resume = await amorcerInstallation(d);
    expect(resume.demo).toBe('charge');
    expect(resume.demoResume).toEqual({ tickets: 6, gels: 2, incidents: 1, regles: 7 });
    expect(await store.issueCache.read('PAY-123')).toBeDefined();
    expect(await store.incidents.listOpen('checkout-api')).toHaveLength(1);
  });

  it('relie le dépôt au service dans l’espace jumelé', async () => {
    const { deps: d, store } = deps({ workspaceUuid: 'ws-demo', secret: SECRET, jeuDeDemo: true });
    await amorcerInstallation(d);
    expect(await serviceDuDepot(store, 'checkout-api')).toBe('checkout-api');
  });

  it('ne recharge pas le jeu s’il est déjà là', async () => {
    const env = { workspaceUuid: 'ws-demo', secret: SECRET, jeuDeDemo: true };
    const { deps: d } = deps(env);
    await amorcerInstallation(d);
    expect((await amorcerInstallation(d)).demo).toBe('deja-present');
  });
});
