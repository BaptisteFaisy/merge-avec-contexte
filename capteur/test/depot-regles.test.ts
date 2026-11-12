/**
 * Règles du dépôt (MC-17, §23 — audit 20) : analyse du fichier
 * `.merge-context.yml` et lecture via l'adaptateur Bitbucket.
 *
 * Un fichier absent, vide ou mal formé ne fait jamais échouer le contrôle :
 * l'analyse rend un motif, la lecture rend `undefined`.
 */
import { describe, expect, it } from 'vitest';
import {
  FICHIER_REGLES_DEPOT,
  lireReglesDepot,
  routeFichierDepot,
  type ReponseFichierBitbucket,
  type RequeteFichierBitbucket,
} from '../src/bitbucket/api';
import { analyserReglesDepot } from '../src/depot-regles';

const FICHIER_VALIDE = `# Règles du dépôt, bornées par celles de l'espace (§23)
version: 1
rules:
  - code: R-05
    level: blocking
    mode: active
    scope:
      repositories:
        - checkout-api
      branches:
        - main
    params:
      jsmProjects:
        - JSM
      mappingSource: settings
  - code: R-01
    level: warning   # durcissement : l'espace est en information
`;

describe('analyserReglesDepot', () => {
  it('lit les règles, leurs niveaux, modes, portées et paramètres', () => {
    const resultat = analyserReglesDepot(FICHIER_VALIDE);
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.regles).toHaveLength(2);
    expect(resultat.regles[0]).toEqual({
      code: 'R-05',
      level: 'blocking',
      mode: 'active',
      scope: { repositories: ['checkout-api'], branches: ['main'] },
      params: { jsmProjects: ['JSM'], mappingSource: 'settings' },
    });
  });

  it('retire les commentaires en fin de ligne', () => {
    const resultat = analyserReglesDepot(FICHIER_VALIDE);
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.regles[1]).toMatchObject({ code: 'R-01', level: 'warning' });
  });

  it('rend un fichier vide ou absent sans règle, sans erreur', () => {
    expect(analyserReglesDepot('')).toEqual({ ok: true, regles: [], ecartees: [] });
    expect(analyserReglesDepot('   \n\n# juste un commentaire\n')).toEqual({
      ok: true,
      regles: [],
      ecartees: [],
    });
  });

  it('rend un fichier sans clé rules sans règle, sans erreur', () => {
    expect(analyserReglesDepot('version: 1\n')).toEqual({ ok: true, regles: [], ecartees: [] });
  });

  it('écarte une règle au code inconnu et le signale', () => {
    const resultat = analyserReglesDepot('rules:\n  - code: R-99\n    level: blocking\n');
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.regles).toHaveLength(0);
    expect(resultat.ecartees.join(' ')).toContain('R-99');
  });

  it('écarte une règle au niveau inconnu et le signale', () => {
    const resultat = analyserReglesDepot('rules:\n  - code: R-05\n    level: urgent\n');
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.regles).toHaveLength(0);
    expect(resultat.ecartees.join(' ')).toContain('niveau inconnu');
  });

  it('écarte une règle au mode inconnu et le signale', () => {
    const resultat = analyserReglesDepot('rules:\n  - code: R-05\n    level: blocking\n    mode: muet\n');
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.ecartees.join(' ')).toContain('mode inconnu');
  });

  it('rend un motif sans lever sur un fichier mal formé', () => {
    const resultat = analyserReglesDepot('rules: ceci n’est pas une liste\n');
    expect(resultat.ok).toBe(false);
    if (resultat.ok) return;
    expect(resultat.motif.length).toBeGreaterThan(0);
  });

  it('rend un motif sur une indentation incohérente', () => {
    const resultat = analyserReglesDepot('rules:\n    - code: R-05\n  level: blocking\n');
    expect(resultat.ok).toBe(false);
  });

  it('lit les nombres et les booléens des paramètres', () => {
    const resultat = analyserReglesDepot(
      'rules:\n  - code: R-08\n    level: warning\n    params:\n      startHour: 8\n      strict: true\n',
    );
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.regles[0].params).toEqual({ startHour: 8, strict: true });
  });
});

describe('lireReglesDepot', () => {
  const IDS = { workspaceUuid: '{ws-1}', depotUuid: '{repo-1}', revision: 'main' };

  /** Double de `requestBitbucket` pour la lecture d'un fichier brut. */
  function requeteFictive(reponse: Partial<ReponseFichierBitbucket> & { leve?: boolean }) {
    const requete: RequeteFichierBitbucket = async () => {
      if (reponse.leve) throw new Error('réseau coupé');
      return {
        ok: reponse.ok ?? true,
        status: reponse.status ?? 200,
        text: async () => reponse.text?.() ?? '',
      } as ReponseFichierBitbucket;
    };
    return requete;
  }

  it('construit le chemin src avec les UUID sans accolades', () => {
    expect(routeFichierDepot('{ws-1}', '{repo-1}', 'main', FICHIER_REGLES_DEPOT).value).toBe(
      '/2.0/repositories/ws-1/repo-1/src/main/.merge-context.yml',
    );
  });

  it('rend le contenu du fichier présent', async () => {
    const contenu = await lireReglesDepot(IDS, requeteFictive({ text: async () => FICHIER_VALIDE }));
    expect(contenu).toBe(FICHIER_VALIDE);
  });

  it('rend undefined quand le fichier est absent (404)', async () => {
    const contenu = await lireReglesDepot(IDS, requeteFictive({ ok: false, status: 404 }));
    expect(contenu).toBeUndefined();
  });

  it('rend undefined quand le fichier est vide', async () => {
    const contenu = await lireReglesDepot(IDS, requeteFictive({ text: async () => '   \n' }));
    expect(contenu).toBeUndefined();
  });

  it('rend undefined sans lever quand la lecture échoue', async () => {
    const contenu = await lireReglesDepot(IDS, requeteFictive({ leve: true }));
    expect(contenu).toBeUndefined();
  });
});
