/**
 * Tests unitaires du client Bitbucket (`scripts/bitbucket-api.ts`), sans réseau.
 *
 * La fonction de récupération est une doublure qui enregistre (URL, méthode,
 * en-têtes, corps) et rend une réponse siméliste : on vérifie que le client
 * construit les bons endpoints, les bons en-têtes d'authentification, que la
 * gestion du 403 « whitelist your IP » et le parsing sont corrects.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  API_BASE,
  ClientBitbucket,
  enTeteAutorisation,
  ErreurBitbucket,
  estBlocageIp,
  estErreurBlocageIp,
  lireConfiguration,
  type ConfigurationBitbucket,
  type RecuperateurHttp,
  type ReponseHttp,
} from '../bitbucket-api';

/** Configuration de test, sans secret réel. */
const CONFIG: ConfigurationBitbucket = {
  token: 'jeton-de-test',
  workspace: 'one-atlas-cndz',
  user: 'x-token-auth',
  baseUrl: API_BASE,
};

/** Réponse simulée, avec un corps texte. */
function reponse(ok: boolean, status: number, corps: string): ReponseHttp {
  return { ok, status, text: async () => corps };
}

/** Doublure de récupération qui enregistre chaque appel et rend une réponse. */
function doublure(reponses: ReponseHttp[]) {
  const appels: Array<{ url: string; init?: RequestInit }> = [];
  const recuperer: RecuperateurHttp = async (url, init) => {
    appels.push({ url, init });
    return reponses[Math.min(appels.length - 1, reponses.length - 1)];
  };
  return { appels, recuperer };
}

const corpsJson = (valeur: unknown): string => JSON.stringify(valeur);

describe('lireConfiguration', () => {
  it('refuse sans jeton ni espace, avec la marche à suivre', () => {
    const erreurs = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(lireConfiguration({})).toBeUndefined();
    const message = erreurs.mock.calls.flat().join(' ');
    expect(message).toContain('MAC_BB_TOKEN');
    expect(message).toContain('MAC_BB_WORKSPACE');
    expect(message).toContain('repository access token');
  });

  it('lit une configuration complète et les valeurs par défaut', () => {
    const config = lireConfiguration({ MAC_BB_TOKEN: ' t ', MAC_BB_WORKSPACE: ' ws ' });
    expect(config).toMatchObject({ token: 't', workspace: 'ws', user: 'x-token-auth', baseUrl: API_BASE });
    expect(lireConfiguration({ MAC_BB_TOKEN: 't', MAC_BB_WORKSPACE: 'ws', MAC_BB_USER: 'u@x.fr' })?.user).toBe('u@x.fr');
  });
});

describe('enTeteAutorisation', () => {
  it('encode « utilisateur:jeton » en Basic base64', () => {
    const enTete = enTeteAutorisation({ ...CONFIG, user: 'alice', token: 'secret' });
    expect(enTete.authorization).toBe(`Basic ${Buffer.from('alice:secret').toString('base64')}`);
  });

  it('ne renvoie jamais le jeton en clair dans les en-têtes', () => {
    const enTete = enTeteAutorisation(CONFIG);
    expect(JSON.stringify(enTete)).not.toContain('jeton-de-test');
  });
});

describe('client — endpoints et en-têtes', () => {
  it('liste les dépôts sur le bon endpoint', async () => {
    const { appels, recuperer } = doublure([reponse(true, 200, corpsJson({ values: [] }))]);
    const client = new ClientBitbucket(CONFIG, recuperer);
    await client.listerDepots();
    expect(appels[0].url).toBe(`${API_BASE}/repositories/one-atlas-cndz`);
    expect(appels[0].init?.method).toBe('GET');
    expect(appels[0].init?.headers).toMatchObject({ authorization: expect.stringContaining('Basic ') });
  });

  it('crée un dépôt privé avec le corps JSON attendu', async () => {
    const { appels, recuperer } = doublure([reponse(true, 200, corpsJson({ slug: 'checkout-api' }))]);
    const client = new ClientBitbucket(CONFIG, recuperer);
    await client.creerDepot('checkout-api', true);
    expect(appels[0].url).toBe(`${API_BASE}/repositories/one-atlas-cndz/checkout-api`);
    expect(appels[0].init?.method).toBe('POST');
    expect(JSON.parse(String(appels[0].init?.body))).toEqual({ scm: 'git', is_private: true });
  });

  it('crée une branche via l’API des refs', async () => {
    const { appels, recuperer } = doublure([reponse(true, 201, corpsJson({ name: 'feature/MAC-2' }))]);
    const client = new ClientBitbucket(CONFIG, recuperer);
    await client.creerBranche('checkout-api', 'feature/MAC-2', 'abcdef0');
    expect(appels[0].url).toBe(`${API_BASE}/repositories/one-atlas-cndz/checkout-api/refs/branches`);
    expect(JSON.parse(String(appels[0].init?.body))).toEqual({ name: 'feature/MAC-2', target: { hash: 'abcdef0' } });
  });

  it('dépose un fichier en x-www-form-urlencoded sur la branche', async () => {
    const { appels, recuperer } = doublure([reponse(true, 201, '')]);
    const client = new ClientBitbucket(CONFIG, recuperer);
    await client.deposerFichier('checkout-api', 'README.md', 'contenu', 'msg', 'feature/MAC-2');
    expect(appels[0].url).toBe(`${API_BASE}/repositories/one-atlas-cndz/checkout-api/src`);
    expect(appels[0].init?.headers).toMatchObject({ 'content-type': 'application/x-www-form-urlencoded' });
    const corps = new URLSearchParams(String(appels[0].init?.body));
    expect(corps.get('branch')).toBe('feature/MAC-2');
    expect(corps.get('message')).toBe('msg');
    expect(corps.get('README.md')).toBe('contenu');
  });

  it('crée puis lit une pull request', async () => {
    const { appels, recuperer } = doublure([
      reponse(true, 201, corpsJson({ id: 7, title: 'MAC-2 — limite' })),
      reponse(true, 200, corpsJson({ id: 7, state: 'OPEN' })),
    ]);
    const client = new ClientBitbucket(CONFIG, recuperer);
    await client.creerPullRequest('checkout-api', {
      title: 't',
      source: { branch: { name: 'f' } },
      destination: { branch: { name: 'main' } },
    });
    expect(appels[0].url).toBe(`${API_BASE}/repositories/one-atlas-cndz/checkout-api/pullrequests`);
    await client.lirePullRequest('checkout-api', 7);
    expect(appels[1].url).toBe(`${API_BASE}/repositories/one-atlas-cndz/checkout-api/pullrequests/7`);
  });

  it('lit les contrôles de fusion d’une pull request', async () => {
    const { appels, recuperer } = doublure([reponse(true, 200, corpsJson({ values: [] }))]);
    const client = new ClientBitbucket(CONFIG, recuperer);
    await client.lireControlesFusion('checkout-api', 7);
    expect(appels[0].url).toBe(`${API_BASE}/repositories/one-atlas-cndz/checkout-api/pullrequests/7/mergeability/checks`);
  });

  it('liste les jetons d’accès, ou rend undefined si l’endpoint est absent', async () => {
    const avec = doublure([reponse(true, 200, corpsJson({ values: [{ id: '1', name: 'ci' }] }))]);
    const sans = doublure([reponse(false, 404, corpsJson({ error: { message: 'no API' } }))]);
    const client1 = new ClientBitbucket(CONFIG, avec.recuperer);
    const client2 = new ClientBitbucket(CONFIG, sans.recuperer);
    await expect(client1.listerJetonsAcces('checkout-api')).resolves.toEqual([{ id: '1', name: 'ci' }]);
    await expect(client2.listerJetonsAcces('checkout-api')).resolves.toBeUndefined();
  });
});

describe('attendreControles', () => {
  it('rend le premier jeu de contrôles non vide (arrivé au 2e essai)', async () => {
    const { appels, recuperer } = doublure([
      reponse(true, 200, corpsJson({ values: [] })),
      reponse(true, 200, corpsJson({ values: [{ type: 'custom', status: 'SUCCESSFUL' }] })),
    ]);
    const client = new ClientBitbucket(CONFIG, recuperer);
    let temps = 0;
    const controles = await client.attendreControles('checkout-api', 7, {
      attenteMs: 60_000,
      intervalleMs: 1000,
      maintenant: () => temps,
      pause: async (ms) => { temps += ms; },
    });
    expect(controles?.values?.[0]?.status).toBe('SUCCESSFUL');
    expect(appels).toHaveLength(2);
    expect(appels[1].url).toBe(`${API_BASE}/repositories/one-atlas-cndz/checkout-api/pullrequests/7/mergeability/checks`);
  });

  it('rend undefined quand le délai est dépassé sans contrôle', async () => {
    const { appels, recuperer } = doublure([reponse(true, 200, corpsJson({ values: [] }))]);
    const client = new ClientBitbucket(CONFIG, recuperer);
    let temps = 0;
    const controles = await client.attendreControles('checkout-api', 7, {
      attenteMs: 2000,
      intervalleMs: 1000,
      maintenant: () => temps,
      pause: async (ms) => { temps += ms; },
    });
    expect(controles).toBeUndefined();
    expect(appels).toHaveLength(3);
  });

  it('ne dort jamais : la pause est injectée', async () => {
    const { recuperer } = doublure([reponse(true, 200, corpsJson({ values: [] }))]);
    const client = new ClientBitbucket(CONFIG, recuperer);
    const pauses: number[] = [];
    await client.attendreControles('checkout-api', 7, {
      attenteMs: 0,
      intervalleMs: 1000,
      pause: async (ms) => { pauses.push(ms); },
    });
    expect(pauses).toEqual([]);
  });

  it('tolère un 404 passager (contrôles pas encore prêts)', async () => {
    const { recuperer } = doublure([reponse(false, 404, corpsJson({ error: { message: 'not found' } }))]);
    const client = new ClientBitbucket(CONFIG, recuperer);
    await expect(client.attendreControles('checkout-api', 7, { attenteMs: 0 })).resolves.toBeUndefined();
  });
});

describe('gestion du 403 « whitelist your IP »', () => {
  it('détecte le message de liste blanche', () => {
    expect(estBlocageIp('To access this workspace, an admin must whitelist your IP.')).toBe(true);
    expect(estBlocageIp('bad credentials')).toBe(false);
  });

  it('lève une ErreurBitbucket identifiable comme blocage IP', async () => {
    const { recuperer } = doublure([reponse(false, 403, corpsJson({ error: { message: 'whitelist your IP' } }))]);
    const client = new ClientBitbucket(CONFIG, recuperer);
    await expect(client.lireEspace()).rejects.toSatisfy(estErreurBlocageIp);
  });

  it('lève une ErreurBitbucket avec statut et corps pour les autres erreurs', async () => {
    const { recuperer } = doublure([reponse(false, 401, corpsJson({ error: { message: 'unauthorized' } }))]);
    const client = new ClientBitbucket(CONFIG, recuperer);
    const erreur = await client.lireEspace().catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ErreurBitbucket);
    expect((erreur as ErreurBitbucket).statut).toBe(401);
    expect(estErreurBlocageIp(erreur)).toBe(false);
  });
});

describe('parsing', () => {
  it('parse un dépôt et renvoie son slug', async () => {
    const { recuperer } = doublure([reponse(true, 200, corpsJson({ slug: 'checkout-api', is_private: true }))]);
    const client = new ClientBitbucket(CONFIG, recuperer);
    await expect(client.lireDepot('checkout-api')).resolves.toMatchObject({ slug: 'checkout-api', is_private: true });
  });

  it('tolère un corps vide (réponses 201 sans contenu)', async () => {
    const { recuperer } = doublure([reponse(true, 201, '')]);
    const client = new ClientBitbucket(CONFIG, recuperer);
    await expect(client.deposerFichier('checkout-api', 'README.md', 'x', 'm', 'b')).resolves.toBeUndefined();
  });
});