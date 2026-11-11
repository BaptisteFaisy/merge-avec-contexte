import { describe, expect, it } from 'vitest';
import { handlePrCard, handlePrPanel, handleWorkspaceSettings } from '../src/app/resolvers';
import type { BitbucketUiContext, ResolverDeps } from '../src/app/resolvers';
import type { LecturePr } from '../src/bitbucket/api';
import { MemoryPairingStore } from '../src/pairing/store';
import { MemorySettingsStore } from '../src/policy/settings';

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

/** Détail renvoyé par la route `card` du Cerveau (forme réelle du pont). */
const carteBloquee = {
  verdict: 'blocked',
  message: 'Bloqué, 1 raison.',
  reasons: [{ rule: 'R-03', level: 'blocking', text: 'PAY-123 : 2 critères d’acceptation non cochés.' }],
  issueKeys: ['PAY-123'],
  evaluatedAt: '2026-11-27T16:30:00Z',
  durationMs: 40,
  siteUrl: 'https://demo.atlassian.net',
  rules: [{ rule: 'R-03', level: 'blocking', mode: 'active' }],
  waivers: [],
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
    const deps = await depsAvec(carteBloquee);
    const vm = await handlePrCard(contextePr, {}, deps);
    expect(vm.verdict).toBe('bloque');
    expect(vm.raisons).toHaveLength(1);
    expect(vm.message).toContain('Bloqué, 1 raison.');
    expect(vm.jumelage.jumele).toBe(true);
    expect(vm.derogation.disponible).toBe(true);
    expect(vm.ticket.liens[0]?.url).toBe('https://demo.atlassian.net/browse/PAY-123');
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
    const deps = await depsAvec(carteBloquee);
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

  it('dit l’évaluation périmée quand un incident a été clos après elle (§17 cas 6)', async () => {
    const deps = await depsAvec({ ...carteBloquee, service: 'api-paiement' });
    const servicesVus: string[] = [];
    deps.lireIncidents = async (service) => {
      servicesVus.push(service);
      return [
        {
          service,
          incidentKey: 'INC-11',
          openedAt: '2026-11-27T15:00:00Z',
          resolvedAt: '2026-11-27T17:00:00Z', // clos après evaluatedAt (16:30)
        },
      ];
    };
    const vm = await handlePrCard(contextePr, {}, deps);
    expect(servicesVus).toEqual(['api-paiement']);
    expect(vm.perime?.titre).toBe('Évaluation périmée');
    expect(vm.perime?.texte).toContain('relancez le contrôle');
    const panneau = await handlePrPanel(contextePr, deps);
    expect(panneau.perime?.titre).toBe('Évaluation périmée');
  });

  it('reste muet sans incident postérieur, sans source d’incidents, ou si la source tombe', async () => {
    const frais = await depsAvec({ ...carteBloquee, service: 'api-paiement' });
    frais.lireIncidents = async () => [
      { service: 'api-paiement', incidentKey: 'INC-9', openedAt: '2026-11-27T15:00:00Z', resolvedAt: '2026-11-27T16:00:00Z' },
    ];
    expect((await handlePrCard(contextePr, {}, frais)).perime).toBeUndefined();

    const sansSource = await depsAvec({ ...carteBloquee, service: 'api-paiement' });
    expect((await handlePrCard(contextePr, {}, sansSource)).perime).toBeUndefined();

    const enPanne = await depsAvec({ ...carteBloquee, service: 'api-paiement' });
    enPanne.lireIncidents = async () => {
      throw new Error('Jira muet');
    };
    expect((await handlePrCard(contextePr, {}, enPanne)).perime).toBeUndefined();
  });
});
