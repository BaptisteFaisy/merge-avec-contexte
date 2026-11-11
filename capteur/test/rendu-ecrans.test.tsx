/**
 * Rendu des trois écrans Bitbucket du Capteur (§AUDIT 4, 37).
 *
 * Chaque écran est rendu dans jsdom avec `@forge/react` et `@forge/bridge`
 * bouchés (tools/test-stubs) et un React unique (alias racine). On vérifie les
 * trois états (chargement, contenu métier, erreur sans écran blanc) et que le
 * bouton principal re-déclenche `invoke` avec la bonne méthode. Les modèles de
 * vue viennent des vraies fonctions `vmCarte`, `vmPanneau`, `vmReglagesEspace`.
 */
// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appelsInvoke, bouchonInvoke, reinitialiserInvoke } from '../../tools/test-stubs/forge-bridge';
import { activerEnvironnementReact, promesseRetardee } from '../../tools/test-stubs/rendu';
import type { Evaluation, IssueContext, Reason, RuleConfig } from '../src/shared/types';
import { vmCarte, vmPanneau, vmReglagesEspace } from '../src/ui/view-models';
import CarteDePr from '../src/frontend/pr-card';
import PanneauDePr from '../src/frontend/pr-panel';
import ReglagesEspace from '../src/frontend/workspace-settings';

const MAINTENANT = '2026-11-27T16:30:00.000Z';

const RAISON: Reason = {
  rule: 'R-03',
  level: 'blocking',
  text: 'PAY-123 : 2 critères d’acceptation non cochés.',
  action: 'Cochez les critères dans le ticket.',
  issueKey: 'PAY-123',
};

function evaluationBloquee(): Evaluation {
  return {
    verdict: 'blocked',
    reasons: [RAISON],
    issueKeys: ['PAY-123'],
    trigger: 'on-code-pushed',
    evaluatedAt: MAINTENANT,
    durationMs: 40,
  };
}

const ISSUE: IssueContext = {
  key: 'PAY-123',
  id: '10042',
  exists: true,
  status: 'En cours',
  criteria: [],
  links: [],
  fixVersions: [],
  labels: [],
  components: [],
  incidentKeys: [],
  url: 'https://demo.atlassian.net/browse/PAY-123',
};

const JUMELAGE = { jumele: true, site: 'demo.atlassian.net', depuis: '2026-11-20T10:00:00.000Z' };
const CONFIG_R03: RuleConfig = { rule: 'R-03', level: 'blocking', mode: 'active', scope: {}, params: {} };

const ENTREE_CARTE = { evaluation: evaluationBloquee(), issues: [ISSUE], jumelage: JUMELAGE };
const ENTREE_PANNEAU = { ...ENTREE_CARTE, regles: [CONFIG_R03], historique: [] };
const ENTREE_REGLAGES = { jumelage: { jumele: false }, politique: 'open' as const, envoyerChemins: true };

beforeAll(activerEnvironnementReact);
beforeEach(reinitialiserInvoke);
afterEach(cleanup);

describe('Capteur — carte de PR (pr-card)', () => {
  it('chargement puis contenu métier', async () => {
    const { promesse, resoudre } = promesseRetardee<unknown>();
    bouchonInvoke(() => promesse);
    render(<CarteDePr />);
    expect(screen.getByText('Chargement du contexte de la PR…')).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy();
    await act(async () => {
      resoudre(vmCarte(ENTREE_CARTE));
    });
    expect(screen.queryByText('Chargement du contexte de la PR…')).toBeNull();
    expect(screen.getAllByText('Bloqué').length).toBeGreaterThan(0);
    expect(screen.getByText(/critères d’acceptation non cochés/)).toBeTruthy();
    expect(screen.getByText('Demander une dérogation')).toBeTruthy();
  });

  it('erreur : message lisible, jamais un écran blanc', async () => {
    bouchonInvoke(() => Promise.reject(new Error('Pont coupé')));
    const { container } = render(<CarteDePr />);
    await screen.findByText('Pont coupé');
    expect(screen.getByText('Réessayer')).toBeTruthy();
    expect(container.textContent ?? '').not.toBe('');
  });

  it('« Demander une dérogation » re-déclenche invoke (request-waiver)', async () => {
    bouchonInvoke(() => Promise.resolve(vmCarte(ENTREE_CARTE)));
    render(<CarteDePr />);
    await screen.findByText('Demander une dérogation');
    fireEvent.click(screen.getByText('Demander une dérogation'));
    await screen.findByText('Demande envoyée : les approbateurs sont notifiés.');
    const appels = appelsInvoke();
    expect(appels[appels.length - 1]).toEqual({ resolver: 'resolverPrCard', payload: { action: 'request-waiver' } });
  });
});

describe('Capteur — panneau de PR (pr-panel)', () => {
  it('chargement puis contenu métier', async () => {
    const { promesse, resoudre } = promesseRetardee<unknown>();
    bouchonInvoke(() => promesse);
    render(<PanneauDePr />);
    expect(screen.getByText('Chargement du détail…')).toBeTruthy();
    await act(async () => {
      resoudre(vmPanneau(ENTREE_PANNEAU));
    });
    expect(screen.getByText('Règles évaluées')).toBeTruthy();
    expect(screen.getByText('R-03')).toBeTruthy();
    expect(screen.getAllByText('Bloqué').length).toBeGreaterThan(0);
  });

  it('erreur : message lisible, jamais un écran blanc', async () => {
    bouchonInvoke(() => Promise.reject(new Error('Réseau coupé')));
    const { container } = render(<PanneauDePr />);
    await screen.findByText('Réseau coupé');
    expect(screen.getByText('Réessayer')).toBeTruthy();
    expect(container.textContent ?? '').not.toBe('');
  });

  it('« Relancer le contrôle » re-déclenche invoke', async () => {
    bouchonInvoke(() => Promise.resolve(vmPanneau(ENTREE_PANNEAU)));
    render(<PanneauDePr />);
    await screen.findByText('Relancer le contrôle');
    const avant = appelsInvoke().length;
    fireEvent.click(screen.getByText('Relancer le contrôle'));
    await act(async () => {});
    const appels = appelsInvoke();
    expect(appels.length).toBe(avant + 1);
    expect(appels[avant]).toEqual({ resolver: 'resolverPrPanel', payload: undefined });
  });
});

describe('Capteur — réglages de l’espace (workspace-settings)', () => {
  it('chargement puis contenu métier', async () => {
    const { promesse, resoudre } = promesseRetardee<unknown>();
    bouchonInvoke(() => promesse);
    render(<ReglagesEspace />);
    expect(screen.getByText('Chargement des réglages…')).toBeTruthy();
    await act(async () => {
      resoudre(vmReglagesEspace(ENTREE_REGLAGES));
    });
    expect(screen.getByText('Code de jumelage')).toBeTruthy();
    expect(screen.getByText('Non jumelé')).toBeTruthy();
    expect(screen.getByText('Enregistrer')).toBeTruthy();
  });

  it('erreur : message lisible, jamais un écran blanc', async () => {
    bouchonInvoke(() => Promise.reject(new Error('Storage indisponible')));
    const { container } = render(<ReglagesEspace />);
    await screen.findByText('Storage indisponible');
    expect(screen.getByText('Réessayer')).toBeTruthy();
    expect(container.textContent ?? '').not.toBe('');
  });

  it('« Enregistrer » re-déclenche invoke (action save)', async () => {
    bouchonInvoke(() => Promise.resolve(vmReglagesEspace(ENTREE_REGLAGES)));
    const { container } = render(<ReglagesEspace />);
    await screen.findByText('Enregistrer');
    const avant = appelsInvoke().length;
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    await screen.findByText('Réglages enregistrés.');
    const appels = appelsInvoke();
    expect(appels.length).toBe(avant + 1);
    expect(appels[avant]).toEqual({
      resolver: 'resolverWorkspaceSettings',
      payload: { action: 'save', codeJumelage: '', politique: 'open', envoyerChemins: true },
    });
  });
});