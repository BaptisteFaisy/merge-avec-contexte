/**
 * `src/bitbucket/api.ts` avec la fonction de requête injectée (item 35) :
 * chemins construits avec le gabarit `route`, UUID sans accolades, une seule
 * page lue même en pagination partielle, borne à `MAX_COMMITS`, erreurs HTTP.
 * Les réponses viennent des échantillons réalistes de `bitbucket-fixtures.ts`.
 */
import { describe, expect, it } from 'vitest';
import { lirePr, MAX_COMMITS, routePr, type ReponseBitbucket, type RequeteBitbucket } from '../src/bitbucket/api';
import type { PRCheckEvent } from '../src/bitbucket/types';
import {
  COMMITS_PAGE,
  COMMITS_PAGE_PARTIELLE,
  DIFFSTAT_PAGE,
  PR_ECHANTILLON,
  REPO_UUID,
  WS_UUID,
  reponseEchantillon,
} from './bitbucket-fixtures';

const EVENT: PRCheckEvent = {
  workspace: { uuid: WS_UUID },
  repository: { uuid: REPO_UUID },
  pullrequest: { id: 17 },
  trigger: { type: 'on-code-pushed' },
};

const WS_NU = 'b7e6c8d9-1a2b-4c3d-9e8f-0a1b2c3d4e5f';
const REPO_NU = 'c9d8e7f6-5a4b-3c2d-1e0f-fedcba987654';
const CHEMIN_PR = `/2.0/repositories/${WS_NU}/${REPO_NU}/pullrequests/17`;

/** Double de `requestBitbucket` : sert les échantillons selon le chemin. */
function requeteFictive(surcharges: Record<string, ReponseBitbucket> = {}) {
  const chemins: string[] = [];
  const requete: RequeteBitbucket = async (chemin) => {
    chemins.push(chemin.value);
    if (chemin.value in surcharges) return surcharges[chemin.value];
    if (chemin.value.endsWith('/commits?pagelen=100')) return reponseEchantillon(COMMITS_PAGE);
    if (chemin.value.endsWith('/diffstat?pagelen=100')) return reponseEchantillon(DIFFSTAT_PAGE);
    return reponseEchantillon(PR_ECHANTILLON);
  };
  return { requete, chemins };
}

describe('routePr', () => {
  it('construit le chemin avec les UUID sans accolades', () => {
    expect(routePr(EVENT).value).toBe(CHEMIN_PR);
  });
});

describe('lirePr — requête injectée', () => {
  it('lit la PR, ses commits et son diffstat en trois requêtes', async () => {
    const { requete, chemins } = requeteFictive();
    const lecture = await lirePr(EVENT, requete);
    expect(chemins).toEqual([
      CHEMIN_PR,
      `${CHEMIN_PR}/commits?pagelen=100`,
      `${CHEMIN_PR}/diffstat?pagelen=100`,
    ]);
    expect(lecture.pr.id).toBe(17);
    expect(lecture.commits).toHaveLength(3);
    expect(lecture.diffstat).toHaveLength(4);
  });

  it('rend le détail brut de la PR tel que reçu', async () => {
    const { requete } = requeteFictive();
    const lecture = await lirePr(EVENT, requete);
    expect(lecture.pr.title).toBe('PAY-123 limite les tentatives de connexion');
    expect(lecture.pr.participants).toHaveLength(4);
    expect(lecture.pr.source.branch.name).toBe('feature/PAY-123-limite-tentatives');
  });

  it('lève avec le statut et le chemin quand l’API répond en erreur', async () => {
    const { requete } = requeteFictive({
      [CHEMIN_PR]: reponseEchantillon({ type: 'error', error: { message: 'Not Found' } }, 404),
    });
    await expect(lirePr(EVENT, requete)).rejects.toThrow(`Bitbucket a répondu 404 sur ${CHEMIN_PR}`);
  });

  it('tolère une page sans champ values : listes vides', async () => {
    const { requete } = requeteFictive({
      [`${CHEMIN_PR}/commits?pagelen=100`]: reponseEchantillon({ pagelen: 100, page: 1, size: 0 }),
      [`${CHEMIN_PR}/diffstat?pagelen=100`]: reponseEchantillon({ pagelen: 100, page: 1, size: 0 }),
    });
    const lecture = await lirePr(EVENT, requete);
    expect(lecture.commits).toEqual([]);
    expect(lecture.diffstat).toEqual([]);
  });

  it('reste sur la première page même si un lien next existe', async () => {
    const { requete, chemins } = requeteFictive({
      [`${CHEMIN_PR}/commits?pagelen=100`]: reponseEchantillon(COMMITS_PAGE_PARTIELLE),
      [`${CHEMIN_PR}/diffstat?pagelen=100`]: reponseEchantillon(DIFFSTAT_PAGE),
    });
    const lecture = await lirePr(EVENT, requete);
    expect(lecture.commits).toHaveLength(2);
    expect(chemins).toHaveLength(3);
    expect(chemins.some((chemin) => chemin.includes('page=2'))).toBe(false);
  });

  it('borne la liste de commits à MAX_COMMITS', async () => {
    const values = Array.from({ length: MAX_COMMITS + 20 }, (_vide, index) => ({
      type: 'commit' as const,
      hash: `h${index}`,
      message: `PAY-123 correctif ${index}\n`,
    }));
    const { requete } = requeteFictive({
      [`${CHEMIN_PR}/commits?pagelen=100`]: reponseEchantillon({ pagelen: MAX_COMMITS, page: 1, size: values.length, values }),
    });
    const lecture = await lirePr(EVENT, requete);
    expect(lecture.commits).toHaveLength(MAX_COMMITS);
  });
});
