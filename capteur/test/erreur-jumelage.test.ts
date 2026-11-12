/**
 * Messages d'erreur des resolvers : « non jumelé » ne se dit pas « Cerveau
 * injoignable » (item 102). Vérifié dans les modèles de vue, puis au niveau
 * des resolvers avec un pont qui signale un jumelage perdu ou qui ne répond
 * pas.
 */
import { describe, expect, it } from 'vitest';
import {
  derogationVm,
  marcheASuivreVm,
  vmCarte,
} from '../src/ui/view-models';
import { messageErreurCapteur } from '../src/ui/ux';
import { handlePrCard, type ResolverDeps } from '../src/app/resolvers';
import type { Evaluation, FallbackCause } from '../src/shared/types';
import type { LecturePr } from '../src/bitbucket/api';
import { MemoryPairingStore } from '../src/pairing/store';
import { MemorySettingsStore } from '../src/policy/settings';
import type { FetchPont, ReponsePont } from '../src/bridge/client';

const WS = '{b7e6c8d9-1a2b-4c3d-9e8f-0a1b2c3d4e5f}';
const WS_NU = 'b7e6c8d9-1a2b-4c3d-9e8f-0a1b2c3d4e5f';
const URL_PONT = 'https://cerveau.webtrigger.atlassian.app/mac/bridge';
const NOW = Date.parse('2026-11-11T08:00:00Z');

function repli(cause: FallbackCause): Evaluation {
  return {
    verdict: 'inconclusive',
    reasons: [],
    issueKeys: ['PAY-123'],
    trigger: 'on-code-pushed',
    evaluatedAt: new Date(NOW).toISOString(),
    durationMs: 0,
    fallback: 'open',
    cause,
  };
}

describe('modèles de vue — non jumelé vs Cerveau injoignable', () => {
  it('nomme le jumelage absent quand la cause est unpaired', () => {
    const marche = marcheASuivreVm(repli('unpaired'));
    expect(marche?.titre).toBe('Espace non jumelé');
    expect(marche?.texte).toContain('Jumelez cet espace de travail');
    expect(marche?.texte).toContain('la fusion reste possible');
  });

  it('réserve « Cerveau injoignable » aux autres causes', () => {
    expect(marcheASuivreVm(repli('unreachable'))?.titre).toBe('Cerveau injoignable');
    expect(marcheASuivreVm(repli('timeout'))?.titre).toBe('Cerveau injoignable');
    expect(marcheASuivreVm(repli('error'))?.titre).toBe('Cerveau injoignable');
  });

  it('traduit la distinction en anglais', () => {
    expect(marcheASuivreVm(repli('unpaired'), 'en')?.titre).toBe('Workspace not paired');
    expect(marcheASuivreVm(repli('unreachable'), 'en')?.titre).toBe('Brain unreachable');
  });

  it('adapte le motif de la dérogation à la cause du repli', () => {
    expect(derogationVm('nonConcluant', true, 'fr', 'unpaired').motif).toContain('réglages de l’espace de travail');
    expect(derogationVm('nonConcluant', true, 'fr', 'unreachable').motif).toContain('injoignable');
    expect(derogationVm('nonConcluant', true).motif).toContain('injoignable');
  });

  it('propage la cause dans la carte complète', () => {
    const vm = vmCarte({ evaluation: repli('unpaired'), jumelage: { jumele: true, site: 'acme.atlassian.net' } });
    expect(vm.marcheASuivre?.titre).toBe('Espace non jumelé');
    expect(vm.derogation.disponible).toBe(false);
    expect(vm.derogation.motif).toContain('réglages de l’espace de travail');
  });
});

const LECTURE: LecturePr = {
  pr: {
    id: 17,
    title: 'PAY-123 limite les tentatives',
    source: { branch: { name: 'feature/PAY-123-limite-tentatives' } },
    destination: { branch: { name: 'main' } },
    participants: [],
  },
  commits: [{ hash: 'a1', message: 'PAY-123 ajoute le compteur' }],
  diffstat: [{ status: 'added', new: { path: 'src/compteur.ts' } }],
};

async function deps(fetch: FetchPont, jumele = true): Promise<ResolverDeps> {
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
    lirePr: async () => LECTURE,
    fetch,
    now: () => NOW,
    nonceGenerator: () => 'nonce-fixe',
    timeoutMs: 50,
  };
}

describe('resolvers — la carte distingue les deux situations', () => {
  const CTX = {
    workspace: { uuid: WS },
    repository: { uuid: '{c9d8e7f6-5a4b-3c2d-1e0f-fedcba987654}' },
    pullRequest: { id: 17 },
  };

  it('dit « Espace non jumelé » quand le Cerveau signale un jumelage perdu', async () => {
    const coupure: FetchPont = async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'unpaired' }),
      text: async () => '{"error":"unpaired"}',
    } as ReponsePont);
    const vm = await handlePrCard(CTX, undefined, await deps(coupure));
    expect(vm.verdict).toBe('nonConcluant');
    expect(vm.marcheASuivre?.titre).toBe('Espace non jumelé');
  });

  it('dit « Cerveau injoignable » quand le pont ne répond pas', async () => {
    const muet: FetchPont = async () => {
      throw new Error('ECONNREFUSED');
    };
    const vm = await handlePrCard(CTX, undefined, await deps(muet));
    expect(vm.marcheASuivre?.titre).toBe('Cerveau injoignable');
  });

  it('dit « Espace non jumelé » sans jamais appeler le réseau quand rien n’est jumelé', async () => {
    let appels = 0;
    const fn: FetchPont = async () => {
      appels += 1;
      throw new Error('ne doit pas être appelé');
    };
    const vm = await handlePrCard(CTX, undefined, await deps(fn, false));
    expect(appels).toBe(0);
    expect(vm.marcheASuivre?.titre).toBe('Espace non jumelé');
    expect(vm.jumelage.jumele).toBe(false);
  });
});

describe('resolvers — item 102, les trois situations sont nommées', () => {
  const CTX = {
    workspace: { uuid: WS },
    repository: { uuid: '{c9d8e7f6-5a4b-3c2d-1e0f-fedcba987654}' },
    pullRequest: { id: 17 },
  };

  it('les trois messages d’erreur sont distincts et donnent la marche à suivre', () => {
    const nonJumele = messageErreurCapteur('non-jumele');
    const injoignable = messageErreurCapteur('injoignable');
    const baseHs = messageErreurCapteur('base-indisponible');
    expect(new Set([nonJumele, injoignable, baseHs]).size).toBe(3);
    expect(nonJumele).toContain('Espace non jumelé');
    expect(injoignable).toContain('Cerveau injoignable');
    expect(baseHs).toContain('Base indisponible');
    // Chacun porte une marche à suivre.
    expect(messageErreurCapteur('non-jumele', 'en')).toContain('Workspace not paired');
    expect(messageErreurCapteur('injoignable', 'en')).toContain('Brain unreachable');
    expect(messageErreurCapteur('base-indisponible', 'en')).toContain('Storage unavailable');
  });

  it('une demande de dérogation dit « non jumelé » quand rien n’est jumelé', async () => {
    const d = await deps(async () => {
      throw new Error('ne doit pas être appelé');
    }, false);
    await expect(handlePrCard(CTX, { action: 'request-waiver' }, d)).rejects.toThrow(/Espace non jumelé/);
  });

  it('une demande de dérogation dit « Cerveau injoignable » quand le pont ne répond pas', async () => {
    const muet: FetchPont = async () => {
      throw new Error('ECONNREFUSED');
    };
    await expect(handlePrCard(CTX, { action: 'request-waiver' }, await deps(muet))).rejects.toThrow(
      /Cerveau injoignable/,
    );
  });

  it('la carte dit « base indisponible » quand le stockage échoue, sans fuir l’erreur brute', async () => {
    const pairingStore = new MemoryPairingStore();
    pairingStore.getPairing = async () => {
      throw new Error('Storage quota exceeded');
    };
    const d: ResolverDeps = {
      pairingStore,
      settingsStore: new MemorySettingsStore(),
      lirePr: async () => LECTURE,
      now: () => NOW,
    };
    await expect(handlePrCard(CTX, undefined, d)).rejects.toThrow(/Base indisponible/);
    await expect(handlePrCard(CTX, undefined, d)).rejects.not.toThrow(/quota/);
  });
});
