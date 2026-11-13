/**
 * Tests du scénario de preuve Bitbucket (`scripts/preuve-bitbucket.ts`).
 *
 * Aucun accès réseau, aucun vrai lancement du CLI Atlassian : la récupération
 * HTTP est injectée (routes doublées) et le lanceur de commande est injecté
 * (doublure qui enregistre les appels). On vérifie la lecture de la
 * configuration, l'opt-in de l'installation, la séquence du scénario, l'attente
 * du merge check et l'affichage du verdict.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DOSSIER_CAPTEUR,
  estInstalleDans,
  executerPreuve,
  lireConfigPreuve,
  operationsManuelles,
  type ExecuteurCommande,
  type OptionsPreuve,
} from '../preuve-bitbucket';
import { API_BASE, type RecuperateurHttp, type ReponseHttp } from '../bitbucket-api';

const ESPACE = 'one-atlas-cndz';
const REPO = 'checkout-api';
const URL_PR = `https://bitbucket.org/${ESPACE}/${REPO}/pull-requests/42`;

/** Corps JSON sérialisé. */
const json = (valeur: unknown): string => JSON.stringify(valeur);

/** Réponse simulée, avec un corps texte. */
function reponse(statut: number, corps: string): ReponseHttp {
  return { ok: statut >= 200 && statut < 300, status: statut, text: async () => corps };
}

/** Une route HTTP doublée : méthode, chemin et réponses successives. */
interface Route {
  methode: string;
  chemin: string;
  reponses: ReponseHttp[];
}

/** Doublure HTTP : sert les routes par (méthode, chemin), la dernière réponse répétée. */
function doublureHttp(routes: Route[]) {
  const appels: Array<{ methode: string; chemin: string }> = [];
  const compteurs = new Map<string, number>();
  const recuperer: RecuperateurHttp = async (url, init) => {
    const methode = String(init?.method ?? 'GET');
    const chemin = url.startsWith(API_BASE) ? url.slice(API_BASE.length) : url;
    appels.push({ methode, chemin });
    const route = routes.find((r) => r.methode === methode && r.chemin === chemin);
    if (!route) return reponse(404, json({ error: { message: 'route inconnue' } }));
    const cle = `${methode} ${chemin}`;
    const rang = compteurs.get(cle) ?? 0;
    compteurs.set(cle, rang + 1);
    return route.reponses[Math.min(rang, route.reponses.length - 1)];
  };
  return { appels, recuperer };
}

/** Doublure du lanceur de commande : enregistre les appels, rend des sorties. */
function doublureCli(sorties: Record<string, string> = {}) {
  const appels: Array<{ commande: string; args: string[]; cwd?: string }> = [];
  const exec: ExecuteurCommande = async (commande, args, options) => {
    appels.push({ commande, args, cwd: options?.cwd });
    return { code: 0, sortie: sorties[args.join(' ')] ?? '' };
  };
  return { appels, exec };
}

/** Routes du scénario complet, du dépôt à la lecture des contrôles. */
function routesScenario(controles: ReponseHttp[]): Route[] {
  const base = `/repositories/${ESPACE}`;
  return [
    { methode: 'GET', chemin: base, reponses: [reponse(200, json({ values: [] }))] },
    { methode: 'POST', chemin: `${base}/${REPO}`, reponses: [reponse(201, json({ slug: REPO }))] },
    { methode: 'POST', chemin: `${base}/${REPO}/src`, reponses: [reponse(201, '')] },
    { methode: 'GET', chemin: `${base}/${REPO}/refs/branches/main`, reponses: [reponse(200, json({ target: { hash: 'abcdef1234567' } }))] },
    { methode: 'POST', chemin: `${base}/${REPO}/refs/branches`, reponses: [reponse(201, json({ name: 'feature/MAC-2-limite-tentatives' }))] },
    { methode: 'POST', chemin: `${base}/${REPO}/pullrequests`, reponses: [reponse(201, json({ id: 42, links: { html: { href: URL_PR } } }))] },
    { methode: 'GET', chemin: `${base}/${REPO}/pullrequests/42`, reponses: [reponse(200, json({ id: 42, state: 'OPEN', title: 'MAC-2' }))] },
    { methode: 'GET', chemin: `${base}/${REPO}/pullrequests/42/mergeability/checks`, reponses: controles },
    { methode: 'GET', chemin: `${base}/${REPO}/access-tokens`, reponses: [reponse(404, json({ error: { message: 'absent' } }))] },
  ];
}

/** Contrôles : vide au premier essai, puis le verdict du Capteur. */
const CONTROLES_ARRIVES: ReponseHttp[] = [
  reponse(200, json({ values: [] })),
  reponse(200, json({
    values: [{
      type: 'custom',
      status: 'SUCCESSFUL',
      blocking: false,
      message: 'Contexte complet : ticket, gels et incidents vérifiés.',
      check: { name: 'Merge avec contexte' },
    }],
  })),
];

/** Environnement minimal du scénario. */
const ENV = { MAC_BB_TOKEN: 'jeton-de-test', MAC_BB_WORKSPACE: ESPACE };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('lireConfigPreuve', () => {
  it('refuse sans jeton ni espace', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(lireConfigPreuve({})).toBeUndefined();
  });

  it('lit les surcharges de dépôt, branche, cible et ticket', () => {
    const config = lireConfigPreuve({
      ...ENV,
      MAC_BB_REPO: 'autre',
      MAC_BB_BRANCHE: 'feature/X-1',
      MAC_BB_CIBLE: 'develop',
      MAC_BB_TICKET: 'X-1',
    });
    expect(config).toMatchObject({ repo: 'autre', branche: 'feature/X-1', cible: 'develop', ticket: 'X-1' });
  });

  it('n’installe l’app que sur opt-in explicite (MAC_BB_INSTALLER=1)', () => {
    expect(lireConfigPreuve(ENV)?.installer).toBe(false);
    expect(lireConfigPreuve({ ...ENV, MAC_BB_INSTALLER: '0' })?.installer).toBe(false);
    expect(lireConfigPreuve({ ...ENV, MAC_BB_INSTALLER: '1' })?.installer).toBe(true);
  });
});

describe('estInstalleDans', () => {
  it('reconnaît l’URL d’installation de l’espace', () => {
    expect(estInstalleDans(`Bitbucket: https://bitbucket.org/${ESPACE}`, ESPACE)).toBe(true);
    expect(estInstalleDans(`Bitbucket: https://bitbucket.org/${ESPACE}-2`, ESPACE)).toBe(false);
    expect(estInstalleDans('aucune installation', ESPACE)).toBe(false);
  });
});

describe('scénario de bout en bout', () => {
  it('installe l’app, crée le dépôt et la PR, puis affiche le verdict', async () => {
    const logs = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { recuperer } = doublureHttp(routesScenario(CONTROLES_ARRIVES));
    const { appels, exec } = doublureCli();
    const config = lireConfigPreuve({ ...ENV, MAC_BB_INSTALLER: '1' });
    const options: OptionsPreuve = {
      recuperer,
      exec,
      cli: 'forge-atlassian',
      attente: { attenteMs: 5000, intervalleMs: 100, maintenant: () => 0, pause: async () => undefined },
    };
    const echecs = await executerPreuve(config!, options);
    expect(echecs).toBe(0);
    const sortie = logs.mock.calls.flat().join('\n');
    expect(sortie).toContain(URL_PR);
    expect(sortie).toContain('Merge avec contexte : SUCCESSFUL');
    const installation = appels.find((a) => a.args[0] === 'install' && a.args[1] !== 'list');
    expect(installation?.args).toEqual([
      'install', '-p', 'bitbucket', '-s', `https://bitbucket.org/${ESPACE}`, '--non-interactive', '-e', 'production',
    ]);
    expect(installation?.cwd).toBe(DOSSIER_CAPTEUR);
  });

  it('n’appelle jamais le CLI sans MAC_BB_INSTALLER=1', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { recuperer } = doublureHttp(routesScenario(CONTROLES_ARRIVES));
    const { appels, exec } = doublureCli();
    const config = lireConfigPreuve(ENV);
    const options: OptionsPreuve = {
      recuperer,
      exec,
      cli: 'forge-atlassian',
      attente: { attenteMs: 5000, intervalleMs: 100, maintenant: () => 0, pause: async () => undefined },
    };
    await executerPreuve(config!, options);
    expect(appels).toHaveLength(0);
  });

  it('n’installe pas l’app si elle est déjà dans l’espace', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { recuperer } = doublureHttp(routesScenario(CONTROLES_ARRIVES));
    const { appels, exec } = doublureCli({ 'install list': `Bitbucket: https://bitbucket.org/${ESPACE}` });
    const config = lireConfigPreuve({ ...ENV, MAC_BB_INSTALLER: '1' });
    const options: OptionsPreuve = {
      recuperer,
      exec,
      cli: 'forge-atlassian',
      attente: { attenteMs: 5000, intervalleMs: 100, maintenant: () => 0, pause: async () => undefined },
    };
    await executerPreuve(config!, options);
    expect(appels.map((a) => a.args.join(' '))).toEqual(['install list']);
  });

  it('pousse le commit de déclenchement après l’ouverture de la PR', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { recuperer, appels } = doublureHttp(routesScenario(CONTROLES_ARRIVES));
    const { exec } = doublureCli();
    const config = lireConfigPreuve(ENV);
    const options: OptionsPreuve = {
      recuperer,
      exec,
      cli: 'forge-atlassian',
      attente: { attenteMs: 5000, intervalleMs: 100, maintenant: () => 0, pause: async () => undefined },
    };
    await executerPreuve(config!, options);
    const indexPR = appels.findIndex((a) => a.chemin.endsWith('/pullrequests'));
    const indexDeclenche = appels.findIndex(
      (a, i) => i > indexPR && a.chemin.endsWith('/src'),
    );
    expect(indexPR).toBeGreaterThanOrEqual(0);
    expect(indexDeclenche).toBeGreaterThan(indexPR);
  });

  it('échoue proprement et liste les opérations manuelles si le merge check ne vient pas', async () => {
    const logs = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { recuperer } = doublureHttp(routesScenario([reponse(200, json({ values: [] }))]));
    const { exec } = doublureCli();
    const config = lireConfigPreuve(ENV);
    const options: OptionsPreuve = {
      recuperer,
      exec,
      cli: 'forge-atlassian',
      attente: { attenteMs: 0, intervalleMs: 100, maintenant: () => 0, pause: async () => undefined },
    };
    const echecs = await executerPreuve(config!, options);
    expect(echecs).toBeGreaterThan(0);
    const sortie = logs.mock.calls.flat().join('\n');
    expect(sortie).toContain('Opérations manuelles restantes');
    for (const operation of operationsManuelles(config!)) expect(sortie).toContain(operation);
    expect(sortie).not.toContain('Error: ErreurBitbucket');
  });
});
