/**
 * Rendu des trois écrans Jira du Cerveau (§AUDIT 4, 37).
 *
 * Mêmes garanties que côté Capteur : `@forge/react` et `@forge/bridge` bouchés,
 * React unique (alias racine), trois états vérifiés et bouton principal qui
 * re-déclenche `invoke` avec la bonne méthode. Les modèles de vue viennent des
 * vraies fonctions `vmReglages`, `vmEncart`, `vmConsole`, `vmJournal`.
 */
// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appelsInvoke, bouchonInvoke, reinitialiserInvoke } from '../../tools/test-stubs/forge-bridge';
import { activerEnvironnementReact, promesseRetardee } from '../../tools/test-stubs/rendu';
import { vmConsole, vmEncart, vmJournal, vmReglages } from '../src/ui/view-models';
import ReglagesProjet from '../src/frontend/reglages-projet';
import EncartTicket from '../src/frontend/encart-ticket';
import ConsoleJournal from '../src/frontend/console-journal';

const MAINTENANT = '2026-11-27T16:30:00.000Z';

const RAISON = {
  rule: 'R-03',
  level: 'blocking',
  text: 'PAY-123 : 2 critères d’acceptation non cochés.',
  action: 'Cochez les critères dans le ticket.',
  issueKey: 'PAY-123',
};

function evaluationBloquee() {
  return {
    verdict: 'blocked',
    reasons: [RAISON],
    issueKeys: ['PAY-123'],
    trigger: 'on-code-pushed',
    evaluatedAt: MAINTENANT,
    durationMs: 40,
  };
}

const CONFIG_R03 = { rule: 'R-03', level: 'blocking', mode: 'active', scope: {}, params: {} };

const VUE_REGLAGES = vmReglages({ locale: 'fr' });
const VUE_ENCARTE = vmEncart({
  locale: 'fr',
  prs: [{ prId: 42, depot: 'checkout-api', evaluation: evaluationBloquee() }],
  configs: [CONFIG_R03],
});
const VUE_CONSOLE = vmConsole({
  locale: 'fr',
  ticket: 'PAY-123',
  brancheCible: 'main',
  depot: 'checkout-api',
  evaluation: evaluationBloquee(),
});
const VUE_JOURNAL = vmJournal({
  locale: 'fr',
  evaluations: [{ depot: 'checkout-api', prId: 42, evaluation: evaluationBloquee() }],
});

const REPONSE_REGLAGES = { locale: 'fr', vue: VUE_REGLAGES };
const REPONSE_ENCARTE = { locale: 'fr', vue: VUE_ENCARTE };
const REPONSE_CONSOLE = { locale: 'fr', console: VUE_CONSOLE, journal: VUE_JOURNAL };

beforeAll(activerEnvironnementReact);
beforeEach(reinitialiserInvoke);
afterEach(cleanup);

describe('Cerveau — réglages du projet (reglages-projet)', () => {
  it('chargement puis contenu métier (libellé de règle)', async () => {
    const { promesse, resoudre } = promesseRetardee<unknown>();
    bouchonInvoke(() => promesse);
    render(<ReglagesProjet />);
    expect(screen.getByText('Chargement…')).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy();
    await act(async () => {
      resoudre(REPONSE_REGLAGES);
    });
    expect(screen.getByText('Règles')).toBeTruthy();
    expect(screen.getByText('Jumelage Bitbucket')).toBeTruthy();
    expect(screen.getByText(/^R-01 —/)).toBeTruthy();
  });

  it('erreur : bandeau lisible, jamais un écran blanc', async () => {
    bouchonInvoke(() => Promise.reject(new Error('SQL hors ligne')));
    const { container } = render(<ReglagesProjet />);
    await screen.findByText(/SQL hors ligne/);
    expect(screen.getByText('Données indisponibles')).toBeTruthy();
    expect(container.textContent ?? '').not.toBe('');
  });

  it('« Générer un code » re-déclenche invoke (genererCode)', async () => {
    bouchonInvoke(() => Promise.resolve(REPONSE_REGLAGES));
    render(<ReglagesProjet />);
    await screen.findByText('Générer un code à usage unique');
    fireEvent.click(screen.getByText('Générer un code à usage unique'));
    await act(async () => {});
    const appels = appelsInvoke();
    expect(appels[appels.length - 1]).toEqual({ resolver: 'resolverReglages', payload: { method: 'genererCode' } });
  });
});

describe('Cerveau — encart ticket (encart-ticket)', () => {
  it('chargement puis contenu métier (message du §9)', async () => {
    const { promesse, resoudre } = promesseRetardee<unknown>();
    bouchonInvoke(() => promesse);
    render(<EncartTicket />);
    expect(screen.getByText('Chargement…')).toBeTruthy();
    await act(async () => {
      resoudre(REPONSE_ENCARTE);
    });
    expect(screen.getByText('checkout-api #42 — Bloqué')).toBeTruthy();
    expect(screen.getAllByText(/critères d’acceptation non cochés/).length).toBeGreaterThan(0);
    expect(screen.getByText('Demander une dérogation')).toBeTruthy();
  });

  it('erreur : bandeau lisible, jamais un écran blanc', async () => {
    bouchonInvoke(() => Promise.reject(new Error('Lecture Jira impossible')));
    const { container } = render(<EncartTicket />);
    await screen.findByText(/Lecture Jira impossible/);
    expect(screen.getByText('Données indisponibles')).toBeTruthy();
    expect(container.textContent ?? '').not.toBe('');
  });

  it('« Demander une dérogation » puis envoi re-déclenche invoke (demanderDerogation)', async () => {
    bouchonInvoke(() => Promise.resolve(REPONSE_ENCARTE));
    render(<EncartTicket />);
    await screen.findByText('Demander une dérogation');
    fireEvent.click(screen.getByText('Demander une dérogation'));
    const motif = screen.getAllByRole('textbox')[0];
    fireEvent.change(motif, { target: { value: 'gel urgent' } });
    fireEvent.click(screen.getByText('Envoyer la demande'));
    await act(async () => {});
    const appels = appelsInvoke();
    const dernier = appels[appels.length - 1];
    expect(dernier?.resolver).toBe('resolverEncart');
    // `toMatchObject` : l'écran peut enrichir la charge utile (identité de
    // l'utilisateur, projet…) sans que ce test cesse de vérifier l'essentiel.
    expect(dernier?.payload).toMatchObject({
      method: 'demanderDerogation',
      rule: VUE_ENCARTE.reglesDerogables[0].code,
      reason: 'gel urgent',
      hours: 2,
    });
  });
});

describe('Cerveau — console et journal (console-journal)', () => {
  it('chargement puis contenu métier (aperçu et journal)', async () => {
    const { promesse, resoudre } = promesseRetardee<unknown>();
    bouchonInvoke(() => promesse);
    render(<ConsoleJournal />);
    expect(screen.getByText('Chargement…')).toBeTruthy();
    await act(async () => {
      resoudre(REPONSE_CONSOLE);
    });
    expect(screen.getByText('Console de test')).toBeTruthy();
    expect(screen.getAllByText(/critères d’acceptation non cochés/).length).toBeGreaterThan(0);
    expect(screen.getByText('Journal des évaluations')).toBeTruthy();
    expect(screen.getByText('Simuler la PR')).toBeTruthy();
  });

  it('erreur : bandeau lisible, jamais un écran blanc', async () => {
    bouchonInvoke(() => Promise.reject(new Error('Console indisponible')));
    const { container } = render(<ConsoleJournal />);
    await screen.findByText(/Console indisponible/);
    expect(screen.getByText('Données indisponibles')).toBeTruthy();
    expect(container.textContent ?? '').not.toBe('');
  });

  it('« Simuler la PR » re-déclenche invoke (simuler)', async () => {
    bouchonInvoke(() => Promise.resolve(REPONSE_CONSOLE));
    render(<ConsoleJournal />);
    await screen.findByText('Simuler la PR');
    fireEvent.click(screen.getByText('Simuler la PR'));
    await act(async () => {});
    const appels = appelsInvoke();
    expect(appels[appels.length - 1]).toEqual({
      resolver: 'resolverConsole',
      payload: { method: 'simuler', ticket: 'PAY-123', brancheCible: 'main', depot: 'checkout-api' },
    });
  });
});