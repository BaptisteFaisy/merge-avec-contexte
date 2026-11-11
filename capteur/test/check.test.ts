/**
 * Orchestration du contrôle (§13.2) et réponse Bitbucket (§9, §13.5).
 *
 * Toutes les sorties sont des doublures : lecteur de PR, `fetch` et horloge ;
 * le jumelage et les réglages utilisent les implémentations mémoire livrées.
 * Aucun test ne touche le réseau ni l'heure réelle.
 */
import { describe, expect, it } from 'vitest';
import { executerControle, type CheckDependencies } from '../src/check/run';
import type { LecturePr } from '../src/bitbucket/api';
import type { PRCheckEvent } from '../src/bitbucket/types';
import type { FetchPont, InitPont, ReponsePont } from '../src/bridge/client';
import { MemoryPairingStore, type PairingStore } from '../src/pairing/store';
import { MemorySettingsStore, type SettingsStore, type WorkspaceSettings } from '../src/policy/settings';
import { t } from '../src/shared';

const INSTANT = 1_800_000_000_000;
const URL_PONT = 'https://cerveau.webtrigger.atlassian.app/mac/bridge';
const WS = '{11111111-2222-3333-4444-555555555555}';
const WS_NU = '11111111-2222-3333-4444-555555555555';

const EVENT: PRCheckEvent = {
  workspace: { uuid: WS },
  repository: { uuid: '{aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee}' },
  pullrequest: { id: 42 },
  trigger: { type: 'on-code-pushed' },
};

function lectureFixe(): LecturePr {
  return {
    pr: {
      id: 42,
      title: 'PAY-123 limite les tentatives',
      repository: { slug: 'acme/checkout' },
      source: { branch: { name: 'feature/PAY-123-limite-tentatives' } },
      destination: { branch: { name: 'main' } },
      participants: [
        { role: 'REVIEWER', state: 'approved', user: { account_id: 'acc-1', display_name: 'Léa' } },
      ],
    },
    commits: [
      { hash: 'a1', message: 'PAY-123 ajoute le compteur' },
      { hash: 'a2', message: 'SEC-9 durcit le contrôle' },
    ],
    diffstat: [{ status: 'modified', new: { path: 'src/paiement.ts' } }],
  };
}

const EVAL_BLOQUEE = {
  verdict: 'blocked',
  reasons: [
    {
      rule: 'R-03',
      level: 'blocking',
      text: 'PAY-123 : 2 critères d’acceptation non cochés.',
      action: 'Cochez les critères après vérification.',
      issueKey: 'PAY-123',
    },
    {
      rule: 'R-04',
      level: 'blocking',
      text: 'Gel « Black Friday » sur main jusqu’au 30/11, 9 h.',
      action: 'Attendez la fin du gel ou demandez une dérogation.',
    },
  ],
  issueKeys: ['PAY-123'],
  trigger: 'on-code-pushed',
  evaluatedAt: new Date(INSTANT).toISOString(),
  durationMs: 120,
};

function fauxFetch(corps: unknown, ok = true, status = 200) {
  const appels: Array<{ url: string; init: InitPont }> = [];
  const reponse: ReponsePont = {
    ok,
    status,
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  };
  const fn: FetchPont = async (url, init) => {
    appels.push({ url, init });
    return reponse;
  };
  return { fn, appels };
}

function fetchInjoignable(): FetchPont {
  return async () => {
    throw new Error('ECONNREFUSED');
  };
}

async function jumelage(secret: string | null = 'secret-partage'): Promise<PairingStore> {
  const store = new MemoryPairingStore();
  if (secret === null) return store;
  await store.savePairing(WS_NU, { bridgeUrl: URL_PONT, siteUrl: 'https://acme.atlassian.net', pairedAt: '2026-11-11T09:00:00Z' }, secret);
  return store;
}

async function reglages(surcharges: Partial<WorkspaceSettings> = {}): Promise<SettingsStore> {
  const store = new MemorySettingsStore();
  if (surcharges.fallbackPolicy) await store.setFallbackPolicy(WS_NU, surcharges.fallbackPolicy);
  if (surcharges.envoiDesChemins === false) await store.setEnvoiDesChemins(WS_NU, false);
  return store;
}

/** Magasin en panne : la lecture du secret lève, le contrôle doit replier. */
class StoreCasse extends MemoryPairingStore {
  override async getSecret(): Promise<string | undefined> {
    throw new Error('panne de KVS');
  }
}

async function deps(surcharges: Partial<CheckDependencies> = {}): Promise<CheckDependencies> {
  return {
    pairingStore: await jumelage(),
    settingsStore: await reglages(),
    lirePr: async () => lectureFixe(),
    fetch: fetchInjoignable(),
    now: () => INSTANT,
    nonceGenerator: () => 'nonce-fixe',
    timeoutMs: 50,
    ...surcharges,
  };
}

/** Charge utile réellement envoyée sur le pont. */
function payloadEnvoye(appels: Array<{ init: InitPont }>): Record<string, unknown> {
  const enveloppe = JSON.parse(appels[0]?.init.body ?? '{}') as { payload?: Record<string, unknown> };
  return enveloppe.payload ?? {};
}

describe('executerControle — verdict du Cerveau', () => {
  it('rend un message conforme au §9 quand le verdict est bloqué', async () => {
    const { fn, appels } = fauxFetch(EVAL_BLOQUEE);
    const reponse = await executerControle(EVENT, await deps({ fetch: fn }));
    expect(reponse.success).toBe(false);
    expect(reponse.message).toBe(
      [
        'Bloqué, 2 raisons.',
        '1) PAY-123 : 2 critères d’acceptation non cochés.',
        '2) Gel « Black Friday » sur main jusqu’au 30/11, 9 h.',
        t('fr', 'verdict.card'),
      ].join('\n'),
    );
  });

  it('laisse passer un verdict autorisé', async () => {
    const { fn } = fauxFetch({ ...EVAL_BLOQUEE, verdict: 'allowed', reasons: [] });
    const reponse = await executerControle(EVENT, await deps({ fetch: fn }));
    expect(reponse.success).toBe(true);
    expect(reponse.message).toContain('Autorisé');
  });

  it('appelle le pont une seule fois, signé, sur l’adresse du jumelage', async () => {
    const { fn, appels } = fauxFetch(EVAL_BLOQUEE);
    await executerControle(EVENT, await deps({ fetch: fn }));
    expect(appels).toHaveLength(1);
    expect(appels[0]?.url).toBe(URL_PONT);
    expect(appels[0]?.init.headers['x-mac-signature']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('envoie les clés extraites de la branche, du titre et des commits', async () => {
    const { fn, appels } = fauxFetch(EVAL_BLOQUEE);
    await executerControle(EVENT, await deps({ fetch: fn }));
    expect(payloadEnvoye(appels).issueKeys).toEqual(['PAY-123', 'SEC-9']);
  });

  it('n’envoie que des métadonnées : aucun diff, chemins et avis seulement', async () => {
    const { fn, appels } = fauxFetch(EVAL_BLOQUEE);
    await executerControle(EVENT, await deps({ fetch: fn }));
    const payload = payloadEnvoye(appels);
    expect(payload.changedPaths).toEqual(['src/paiement.ts']);
    expect(payload.reviewers).toEqual([{ accountId: 'acc-1', state: 'approved' }]);
    expect(JSON.stringify(payload)).not.toContain('lines_added');
  });

  it('omet les chemins quand l’administrateur a désactivé leur envoi', async () => {
    const { fn, appels } = fauxFetch(EVAL_BLOQUEE);
    const d = await deps({ fetch: fn, settingsStore: await reglages({ envoiDesChemins: false }) });
    await executerControle(EVENT, d);
    expect(payloadEnvoye(appels).changedPaths).toBeUndefined();
  });

  it('retire les accolades des UUID et transmet le déclencheur traduit', async () => {
    const { fn, appels } = fauxFetch(EVAL_BLOQUEE);
    await executerControle({ ...EVENT, trigger: { type: 'on-merge' } }, await deps({ fetch: fn }));
    const payload = payloadEnvoye(appels);
    expect(payload.workspaceUuid).toBe(WS_NU);
    expect(payload.repositoryUuid).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(payload.trigger).toBe('on-merge');
  });

  it('transmet le message de commit de fusion au déclencheur on-merge', async () => {
    const { fn, appels } = fauxFetch(EVAL_BLOQUEE);
    const event: PRCheckEvent = {
      ...EVENT,
      trigger: { type: 'on-merge' },
      mergeProperties: {
        commitMessage: 'Merged in feature/PAY-123 (pull request #42)',
        commitMessageTruncated: false,
        mergeStrategy: 'merge_commit',
        closeSourceBranch: true,
      },
    };
    await executerControle(event, await deps({ fetch: fn }));
    expect(payloadEnvoye(appels).mergeCommitMessage).toContain('pull request #42');
  });
});

describe('executerControle — politique de repli (§13.5)', () => {
  it('laisse passer avec « Contexte indisponible » si le pont est injoignable en politique ouverte', async () => {
    const reponse = await executerControle(EVENT, await deps());
    expect(reponse.success).toBe(true);
    expect(reponse.message).toContain('Contexte indisponible');
    expect(reponse.message).toContain('Politique de repli : ouvert');
  });

  it('bloque en politique fermée quand le pont est injoignable', async () => {
    const d = await deps({ settingsStore: await reglages({ fallbackPolicy: 'closed' }) });
    const reponse = await executerControle(EVENT, d);
    expect(reponse.success).toBe(false);
    expect(reponse.message).toContain('Politique de repli : fermé');
  });

  it('tombe en repli quand le workspace n’est pas jumelé, sans appeler le réseau', async () => {
    const { fn, appels } = fauxFetch(EVAL_BLOQUEE);
    const reponse = await executerControle(EVENT, await deps({ fetch: fn, pairingStore: await jumelage(null) }));
    expect(appels).toHaveLength(0);
    expect(reponse.success).toBe(true);
    expect(reponse.message).toContain('Contexte indisponible');
  });

  it('tombe en repli fermé quand le workspace n’est pas jumelé et la politique est fermée', async () => {
    const d = await deps({
      pairingStore: await jumelage(null),
      settingsStore: await reglages({ fallbackPolicy: 'closed' }),
    });
    const reponse = await executerControle(EVENT, d);
    expect(reponse.success).toBe(false);
  });

  it('tombe en repli quand le Cerveau dépasse le délai', async () => {
    const lent: FetchPont = () => new Promise<ReponsePont>(() => undefined);
    const reponse = await executerControle(EVENT, await deps({ fetch: lent, timeoutMs: 20 }));
    expect(reponse.success).toBe(true);
    expect(reponse.message).toContain('Contexte indisponible');
  });

  it('tombe en repli quand la réponse du pont n’est pas une évaluation', async () => {
    const { fn } = fauxFetch({ unexpected: true });
    const reponse = await executerControle(EVENT, await deps({ fetch: fn }));
    expect(reponse.success).toBe(true);
    expect(reponse.message).toContain('Contexte indisponible');
  });
});

describe('executerControle — ne lève jamais (§15)', () => {
  it('rend un repli quand le lecteur de PR jette', async () => {
    const d = await deps({
      lirePr: async () => {
        throw new Error('Bitbucket a répondu 404');
      },
    });
    const reponse = await executerControle(EVENT, d);
    expect(reponse.success).toBe(true);
    expect(reponse.message).toContain('Contexte indisponible');
  });

  it('rend un repli ouvert par défaut quand les réglages eux-mêmes jettent', async () => {
    const d = await deps({
      settingsStore: {
        getSettings: async () => {
          throw new Error('KVS indisponible');
        },
        setFallbackPolicy: async () => undefined,
        setEnvoiDesChemins: async () => undefined,
      },
    });
    const reponse = await executerControle(EVENT, d);
    expect(reponse).toEqual({
      success: true,
      message: expect.stringContaining('Contexte indisponible'),
    });
  });

  it('rend un repli quand l’événement est incomplet', async () => {
    const reponse = await executerControle({} as PRCheckEvent, await deps());
    expect(reponse.success).toBe(true);
    expect(typeof reponse.message).toBe('string');
  });

  it('ne propage aucune exception, même si le magasin de jumelage jette', async () => {
    const d = await deps({ pairingStore: new StoreCasse() });
    await expect(executerControle(EVENT, d)).resolves.toMatchObject({ success: true });
  });
});
