import { describe, expect, it } from 'vitest';
import { handlePrCard, handlePrPanel, handleWorkspaceSettings } from '../src/app/resolvers';
import type { BitbucketUiContext, ResolverDeps } from '../src/app/resolvers';
import type { LecturePr } from '../src/bitbucket/api';
import { MemoryPairingStore } from '../src/pairing/store';
import { MemorySettingsStore } from '../src/policy/settings';
import type { Evaluation } from '../src/shared';

const WS = 'ws-uuid';
const REPO = 'repo-uuid';
const NOW = Date.parse('2026-11-27T16:30:00Z');

const contextePr: BitbucketUiContext = {
  workspace: { uuid: `{${WS}}` },
  repository: { uuid: `{${REPO}}` },
  pullRequest: { id: 42 },
};

const lecture: LecturePr = {
  pr: {
    id: 42,
    title: 'PAY-123 : limiter les tentatives',
    repository: { slug: 'checkout-api' },
    source: { branch: { name: 'feature/PAY-123-limite' } },
    destination: { branch: { name: 'main' } },
    participants: [],
  },
  commits: [{ hash: 'abc123', message: 'PAY-123 : ajout du compteur' }],
  diffstat: [{ new: { path: 'src/limites.ts' } }],
};

const evaluationBloquee: Evaluation = {
  verdict: 'blocked',
  reasons: [{ rule: 'R-03', level: 'blocking', text: 'PAY-123 : 2 critères d’acceptation non cochés.' }],
  issueKeys: ['PAY-123'],
  trigger: 'on-code-pushed',
  evaluatedAt: '2026-11-27T16:30:00Z',
  durationMs: 40,
};

/** Dépôts en mémoire + pont factice ; `reponsePont` est ce que le pont renvoie. */
async function depsAvec(reponsePont: unknown, opts: { fetch?: ResolverDeps['fetch'] } = {}): Promise<ResolverDeps> {
  const pairingStore = new MemoryPairingStore();
  await pairingStore.savePairing(
    WS,
    { bridgeUrl: 'https://pont.example/v2', siteUrl: 'https://demo.atlassian.net', pairedAt: '2026-11-20T10:00:00Z' },
    'secret-de-test-32-octets-0123456789',
  );
  return {
    pairingStore,
    settingsStore: new MemorySettingsStore(),
    lirePr: async () => lecture,
    now: () => NOW,
    nonceGenerator: () => 'nonce-test',
    fetch: opts.fetch ?? (async () => ({
      ok: true,
      status: 200,
      json: async () => reponsePont,
      text: async () => JSON.stringify(reponsePont),
    })),
  };
}

describe('capteur — resolvers d’interface (§12)', () => {
  it('construit la carte de PR depuis la réponse du pont', async () => {
    const deps = await depsAvec({ evaluation: evaluationBloquee, issues: [] });
    const vm = await handlePrCard(contextePr, {}, deps);
    expect(vm.verdict).toBe('bloque');
    expect(vm.raisons).toHaveLength(1);
    expect(vm.message).toContain('Bloqué, 1 raison.');
    expect(vm.jumelage.jumele).toBe(true);
    expect(vm.derogation.disponible).toBe(true);
  });

  it('retombe sur la politique de repli quand le pont ne répond pas', async () => {
    const deps = await depsAvec({}, {
      fetch: async () => {
        throw new Error('réseau coupé');
      },
    });
    const vm = await handlePrPanel(contextePr, deps);
    expect(vm.verdict).toBe('nonConcluant');
    expect(vm.message).toContain('Contexte indisponible');
  });

  it('lit l’espace de travail même avec des accolades dans les UUID', async () => {
    const deps = await depsAvec({ evaluation: evaluationBloquee });
    const vm = await handleWorkspaceSettings({ workspace: { uuid: `{${WS}}` } }, undefined, deps);
    expect(vm.liaison.jumele).toBe(true);
    expect(vm.politique.valeur).toBe('open');
    expect(vm.envoyerChemins.actif).toBe(true);
  });

  it('enregistre la politique de repli et l’envoi des chemins', async () => {
    const deps = await depsAvec({});
    const vm = await handleWorkspaceSettings(
      { workspace: { uuid: `{${WS}}` } },
      { action: 'save', politique: 'closed', envoyerChemins: false },
      deps,
    );
    expect(vm.politique.valeur).toBe('closed');
    expect(vm.envoyerChemins.actif).toBe(false);
  });
});
