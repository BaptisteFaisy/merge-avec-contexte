/**
 * Parties pures du script de démonstration : lecture de la configuration,
 * formatage, décision de succès. Aucune requête réseau ici.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { afficherMessage, annonce, etape, lireConfiguration, payloadDe, payloadPr, prParId, PRS_DEMO, raisonsBloquantes } from '../demo-e2e';

describe('démonstration de bout en bout — parties pures', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refuse de démarrer sans adresse ni secret, avec la marche à suivre', () => {
    const erreurs = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(lireConfiguration({})).toBeUndefined();
    const message = erreurs.mock.calls.flat().join(' ');
    expect(message).toContain('MAC_BRIDGE_URL');
    expect(message).toContain('MAC_SHARED_SECRET');
    expect(message).toContain('forge webtrigger create');
  });

  it('accepte une configuration complète et un espace de travail par défaut', () => {
    const config = lireConfiguration({ MAC_BRIDGE_URL: ' https://pont.test ', MAC_SHARED_SECRET: ' secret ' });
    expect(config).toEqual({ url: 'https://pont.test', secret: 'secret', workspace: 'ws-demo' });
    expect(lireConfiguration({ MAC_BRIDGE_URL: 'u', MAC_SHARED_SECRET: 's', MAC_WORKSPACE: 'ws-x' })?.workspace).toBe('ws-x');
  });

  it('construit la charge utile d’une PR du jeu de démonstration', () => {
    const config = { url: 'u', secret: 's', workspace: 'ws-demo' };
    const payload = payloadPr(config, 42, 'PAY-123', 'feature/PAY-123', 'on-merge');
    expect(payload).toMatchObject({
      workspaceUuid: 'ws-demo',
      repositoryUuid: 'checkout-api',
      pullRequestId: 42,
      issueKeys: ['PAY-123'],
      sourceBranch: 'feature/PAY-123',
      targetBranch: 'main',
      trigger: 'on-merge',
    });
  });

  it('compte les blocages réels : ni dérogés, ni en observation', () => {
    const corps = {
      reasons: [
        { rule: 'R-03', level: 'blocking' },
        { rule: 'R-05', level: 'blocking', waived: true },
        { rule: 'R-11', level: 'information' },
        { rule: 'R-02', level: 'blocking', observed: true },
      ],
    };
    expect(raisonsBloquantes(corps)).toBe(1);
    expect(raisonsBloquantes({})).toBe(0);
  });

  it('affiche le message du §9 ligne par ligne, tel que Bitbucket l’affiche', () => {
    const lignes = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    afficherMessage('Bloqué, 1 raison.\n1) PAY-123 : 2 critères.');
    expect(lignes.mock.calls.map((appel) => appel[0])).toEqual([
      '        │ Bloqué, 1 raison.',
      '        │ 1) PAY-123 : 2 critères.',
    ]);
  });

  it('affiche une étape avec sa durée quand elle est mesurée', () => {
    const lignes = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    etape('Le pont répond', true, 'stockage ok', 474);
    etape('Étape ratée', false, 'raison');
    expect(lignes.mock.calls[0]?.[0]).toBe('OK   Le pont répond (474 ms) — stockage ok');
    expect(lignes.mock.calls[1]?.[0]).toBe('ÉCHEC Étape ratée — raison');
  });

  it('annonce un parcours par une ligne de récit', () => {
    const lignes = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    annonce('Parcours de l’astreinte (§3, §7.2)');
    expect(lignes.mock.calls[0]?.[0]).toBe('\n— Parcours de l’astreinte (§3, §7.2) —');
  });

  it('décrit une PR de démonstration complète à partir de son numéro', () => {
    expect(prParId(45)).toMatchObject({ cle: 'PAY-130', target: 'release/1.4', depot: 'pricing-api' });
    expect(prParId(47).cle).toBe('PAY-125');
    expect(PRS_DEMO).toHaveLength(9);
  });

  it('construit la charge utile d’une PR de démonstration listée', () => {
    const config = { url: 'u', secret: 's', workspace: 'ws-demo' };
    const payload = payloadDe(config, prParId(45), 'on-code-pushed');
    expect(payload).toMatchObject({
      repositoryUuid: 'pricing-api',
      repositorySlug: 'pricing-api',
      pullRequestId: 45,
      issueKeys: ['PAY-130'],
      targetBranch: 'release/1.4',
      trigger: 'on-code-pushed',
    });
  });

  it('ne s’exécute pas quand un test l’importe', () => {
  });
});
