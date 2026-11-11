/**
 * Test d'intégration du réglage « ne pas envoyer les chemins de fichiers »
 * (§13.3, item 40) : réglage désactivé via les vrais magasins mémoire, puis
 * vérification de la charge utile réellement signée et envoyée au pont —
 * aucun `changedPaths`, aucun chemin de fichier — sur les deux voies :
 * le merge check (`executerControle`) et la carte de PR (`handlePrCard`).
 */
import { describe, expect, it } from 'vitest';
import { executerControle, type CheckDependencies } from '../src/check/run';
import { handlePrCard, handleWorkspaceSettings, type ResolverDeps } from '../src/app/resolvers';
import type { LecturePr } from '../src/bitbucket/api';
import type { PRCheckEvent } from '../src/bitbucket/types';
import type { FetchPont, InitPont } from '../src/bridge/client';
import { MemoryPairingStore } from '../src/pairing/store';
import { MemorySettingsStore } from '../src/policy/settings';
import {
  COMMITS_PAGE,
  DIFFSTAT_PAGE,
  PR_ECHANTILLON,
  REPO_UUID,
  WS_UUID,
} from './bitbucket-fixtures';

const WS_NU = 'b7e6c8d9-1a2b-4c3d-9e8f-0a1b2c3d4e5f';
const URL_PONT = 'https://cerveau.webtrigger.atlassian.app/mac/bridge';
const NOW = Date.parse('2026-11-11T08:00:00Z');
const CHEMINS = ['src/paiement.ts', 'src/compteur.ts', 'src/legacy/tentatives.ts', 'src/config/limites.ts'];

const EVENT: PRCheckEvent = {
  workspace: { uuid: WS_UUID },
  repository: { uuid: REPO_UUID },
  pullrequest: { id: 17 },
  trigger: { type: 'on-code-pushed' },
};

const CTX_CARTE = {
  workspace: { uuid: WS_UUID },
  repository: { uuid: REPO_UUID },
  pullRequest: { id: 17 },
};

const LECTURE: LecturePr = {
  pr: PR_ECHANTILLON,
  commits: COMMITS_PAGE.values,
  diffstat: DIFFSTAT_PAGE.values,
};

/** Réponses du pont : évaluation pour `evaluate`, détail pour `card`. */
const EVAL_OK = {
  verdict: 'allowed',
  reasons: [],
  issueKeys: ['PAY-123'],
  trigger: 'on-code-pushed',
  evaluatedAt: new Date(NOW).toISOString(),
  durationMs: 30,
};

const CARTE_OK = {
  ...EVAL_OK,
  message: 'Autorisé.',
  siteUrl: 'https://acme.atlassian.net',
  rules: [],
  waivers: [],
};

/** Pont factice qui enregistre chaque corps signé envoyé. */
function pontCapturant(corps: unknown) {
  const appels: Array<{ url: string; init: InitPont }> = [];
  const fn: FetchPont = async (url, init) => {
    appels.push({ url, init });
    return { ok: true, status: 200, json: async () => corps, text: async () => JSON.stringify(corps) };
  };
  const bodies = () => appels.map((appel) => appel.init.body ?? '');
  return { fn, appels, bodies };
}

async function magasins() {
  const pairingStore = new MemoryPairingStore();
  await pairingStore.savePairing(
    WS_NU,
    { bridgeUrl: URL_PONT, siteUrl: 'https://acme.atlassian.net', pairedAt: '2026-11-01T10:00:00Z' },
    'secret-partage-de-test',
  );
  return { pairingStore, settingsStore: new MemorySettingsStore() };
}

function commun(fetch: FetchPont) {
  return { fetch, now: () => NOW, nonceGenerator: () => 'nonce-fixe', timeoutMs: 50 };
}

describe('merge check — réglage « ne pas envoyer les chemins »', () => {
  it('charge utile sans changedPaths ni aucun chemin quand le réglage est désactivé', async () => {
    const { pairingStore, settingsStore } = await magasins();
    await settingsStore.setEnvoiDesChemins(WS_NU, false);
    const pont = pontCapturant(EVAL_OK);
    const deps: CheckDependencies = { pairingStore, settingsStore, lirePr: async () => LECTURE, ...commun(pont.fn) };
    const reponse = await executerControle(EVENT, deps);
    expect(reponse.success).toBe(true);
    expect(pont.appels).toHaveLength(1);
    const corps = pont.bodies()[0] ?? '';
    expect(corps).not.toContain('changedPaths');
    for (const chemin of CHEMINS) expect(corps).not.toContain(chemin);
    expect(JSON.parse(corps).payload.issueKeys).toEqual(['PAY-123']);
  });

  it('témoin : avec le réglage actif, les chemins partent bien', async () => {
    const { pairingStore, settingsStore } = await magasins();
    const pont = pontCapturant(EVAL_OK);
    const deps: CheckDependencies = { pairingStore, settingsStore, lirePr: async () => LECTURE, ...commun(pont.fn) };
    await executerControle(EVENT, deps);
    const payload = JSON.parse(pont.bodies()[0] ?? '{}').payload as Record<string, unknown>;
    expect(payload.changedPaths).toEqual(CHEMINS);
  });
});

describe('carte de PR — réglage désactivé via l’écran des réglages', () => {
  it('save avec envoyerChemins:false puis carte : aucun chemin sur le pont', async () => {
    const { pairingStore, settingsStore } = await magasins();
    const pont = pontCapturant(CARTE_OK);
    const deps: ResolverDeps = { pairingStore, settingsStore, lirePr: async () => LECTURE, ...commun(pont.fn) };
    await handleWorkspaceSettings(CTX_CARTE, { action: 'save', politique: 'open', envoyerChemins: false }, deps);
    const avant = pont.appels.length;
    const vm = await handlePrCard(CTX_CARTE, undefined, deps);
    expect(vm.verdict).toBe('autorise');
    expect(pont.appels.length).toBe(avant + 1);
    const corps = pont.bodies()[avant] ?? '';
    expect(JSON.parse(corps).route).toBe('card');
    expect(corps).not.toContain('changedPaths');
    for (const chemin of CHEMINS) expect(corps).not.toContain(chemin);
  });

  it('témoin : réglage actif, la carte envoie les chemins', async () => {
    const { pairingStore, settingsStore } = await magasins();
    const pont = pontCapturant(CARTE_OK);
    const deps: ResolverDeps = { pairingStore, settingsStore, lirePr: async () => LECTURE, ...commun(pont.fn) };
    await handlePrCard(CTX_CARTE, undefined, deps);
    const payload = JSON.parse(pont.bodies()[0] ?? '{}').payload as Record<string, unknown>;
    expect(payload.changedPaths).toEqual(CHEMINS);
  });
});
