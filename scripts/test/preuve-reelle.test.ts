/**
 * Tests de l'étape « côté Bitbucket » de la démonstration réelle, sans réseau.
 *
 * Le récupérateur HTTP est injecté (comme dans `bitbucket-api.test.ts`) :
 * l'étape lit une vraie pull request quand un jeton est présent, et retombe
 * sur l'affichage honnête sinon — sans jamais annoncer une pull request qui
 * n'a pas été lue, ni s'interrompre sur une erreur réseau.
 */
import { describe, expect, it, vi } from 'vitest';
import { casBitbucket, ESPACE_BITBUCKET } from '../preuve-reelle';
import { type RecuperateurHttp, type ReponseHttp } from '../bitbucket-api';

/** Environnement d'un accès écriture complet. */
const ENV_JETON = {
  MAC_BB_TOKEN: 'jeton-de-test',
  MAC_BB_WORKSPACE: 'one-atlas-cndz',
  MAC_BB_REPO: 'checkout-api',
} as const;

/** Pull request réelle renvoyée par l'API. */
const PR = {
  id: 42,
  state: 'OPEN',
  title: 'MAC-2 — limite de tentatives',
  links: { html: { href: 'https://bitbucket.org/one-atlas-cndz/checkout-api/pull-requests/42' } },
};

/** Contrôle de fusion produit par l'app déployée. */
const CONTROLES = {
  values: [
    {
      type: 'custom',
      status: 'SUCCESSFUL',
      blocking: false,
      check: { id: 'capteur', name: 'Merge avec contexte', kind: 'app' },
      message: 'Contexte respecté : la fusion est autorisée.',
    },
  ],
};

/** Réponse simulée, avec un corps texte. */
function reponse(ok: boolean, status: number, corps: string): ReponseHttp {
  return { ok, status, text: async () => corps };
}

/**
 * Doublure de récupération : elle répond selon le fragment d'URL demandé, et
 * enregistre les URL appelées. Aucun accès réseau, aucun jeton réel.
 */
function doublure(routes: Array<[string, ReponseHttp]>): { recuperer: RecuperateurHttp; urls: string[] } {
  const urls: string[] = [];
  const recuperer: RecuperateurHttp = async (url) => {
    urls.push(url);
    const trouve = routes.find(([fragment]) => url.includes(fragment));
    return trouve ? trouve[1] : reponse(false, 404, '{"error":{"message":"not found"}}');
  };
  return { recuperer, urls };
}

/** Capture ce que l'étape écrit sur la sortie ; rend les lignes et le résultat. */
async function capturer(
  action: () => Promise<{ prLue: boolean }>,
): Promise<{ sortie: string; resultat: { prLue: boolean } }> {
  const lignes: string[] = [];
  const log = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lignes.push(args.map((argument) => String(argument)).join(' '));
  });
  const erreur = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    const resultat = await action();
    return { sortie: lignes.join('\n'), resultat };
  } finally {
    log.mockRestore();
    erreur.mockRestore();
  }
}

describe('étape 6 — côté Bitbucket', () => {
  it('affiche la vraie pull request et son verdict quand le jeton est présent', async () => {
    const { recuperer } = doublure([
      ['/mergeability/checks', reponse(true, 200, JSON.stringify(CONTROLES))],
      ['/pullrequests/42', reponse(true, 200, JSON.stringify(PR))],
    ]);
    const { sortie, resultat } = await capturer(() => casBitbucket({ env: { ...ENV_JETON, MAC_BB_PR_ID: '42' }, recuperer }));

    expect(resultat.prLue).toBe(true);
    expect(sortie).toContain('https://bitbucket.org/one-atlas-cndz/checkout-api/pull-requests/42');
    expect(sortie).toContain('#42');
    expect(sortie).toContain('OPEN');
    expect(sortie).toContain('SUCCESSFUL');
    expect(sortie).toContain('Merge avec contexte');
    expect(sortie).toContain('Contexte respecté');
  });

  it('affiche le refus du contrôle de fusion quand l’app bloque la PR', async () => {
    const { recuperer } = doublure([
      ['/mergeability/checks', reponse(true, 200, JSON.stringify({
        values: [
          {
            type: 'custom',
            status: 'FAILED',
            blocking: true,
            check: { id: 'capteur', name: 'Merge avec contexte', kind: 'app' },
            message: 'Critères d’acceptation non cochés (MAC-2).',
          },
        ],
      }))],
      ['/pullrequests/42', reponse(true, 200, JSON.stringify(PR))],
    ]);
    const { sortie, resultat } = await capturer(() => casBitbucket({ env: { ...ENV_JETON, MAC_BB_PR_ID: '42' }, recuperer }));

    expect(resultat.prLue).toBe(true);
    expect(sortie).toContain('FAILED');
    expect(sortie).toContain('bloquant');
    expect(sortie).toContain('Critères d’acceptation non cochés');
  });

  it('prend la pull request la plus récemment mise à jour quand aucun identifiant n’est donné', async () => {
    const { recuperer, urls } = doublure([
      ['/mergeability/checks', reponse(true, 200, JSON.stringify(CONTROLES))],
      ['/pullrequests/7', reponse(true, 200, JSON.stringify({ ...PR, id: 7, links: { html: { href: 'https://bitbucket.org/one-atlas-cndz/checkout-api/pull-requests/7' } } }))],
      ['/pullrequests?', reponse(true, 200, JSON.stringify({ values: [{ id: 3, updated_on: '2026-10-01T10:00:00Z' }, { id: 7, updated_on: '2026-11-02T10:00:00Z' }] }))],
    ]);
    const { sortie, resultat } = await capturer(() => casBitbucket({ env: ENV_JETON, recuperer }));

    expect(resultat.prLue).toBe(true);
    expect(urls.some((url) => url.includes('/pullrequests?sort=-updated_on'))).toBe(true);
    expect(sortie).toContain('pull-requests/7');
  });

  it('retombe sur l’affichage honnête quand aucun jeton n’est présent', async () => {
    const { recuperer } = doublure([
      ['/workspaces/', reponse(true, 200, JSON.stringify({ uuid: ESPACE_BITBUCKET, slug: 'one-atlas-cndz' }))],
      ['/repositories/', reponse(true, 200, JSON.stringify({ values: [] }))],
    ]);
    const { sortie, resultat } = await capturer(() => casBitbucket({ env: {}, recuperer }));

    expect(resultat.prLue).toBe(false);
    expect(sortie).toContain('MAC_BB_TOKEN');
    expect(sortie).toContain('aucune pull request');
    expect(sortie).toContain(ESPACE_BITBUCKET);
    expect(sortie).not.toContain('pull-requests/');
  });

  it('retombe sur l’affichage honnête avec la raison quand l’IP de l’espace est bloquée', async () => {
    const { recuperer } = doublure([
      ['/pullrequests/42', reponse(false, 403, '{"error":{"message":"To access this workspace, an admin must whitelist your IP."}}')],
      ['/workspaces/', reponse(false, 403, '{"error":{"message":"To access this workspace, an admin must whitelist your IP."}}')],
    ]);
    const { sortie, resultat } = await capturer(() => casBitbucket({ env: { ...ENV_JETON, MAC_BB_PR_ID: '42' }, recuperer }));

    expect(resultat.prLue).toBe(false);
    expect(sortie).toContain('whitelist your IP');
    expect(sortie).toContain('liste blanche');
    expect(sortie).not.toContain('pull-requests/42');
  });

  it('ne s’interrompt pas quand l’API est injoignable', async () => {
    const recuperer: RecuperateurHttp = async () => {
      throw new Error('ECONNREFUSED');
    };
    const { sortie, resultat } = await capturer(() => casBitbucket({ env: ENV_JETON, recuperer }));

    expect(resultat.prLue).toBe(false);
    expect(sortie).toContain('lecture impossible');
    expect(sortie).toContain('ECONNREFUSED');
  });
});
