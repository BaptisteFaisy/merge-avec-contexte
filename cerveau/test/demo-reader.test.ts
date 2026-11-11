/**
 * Mode démonstration : le site de démo ne contient ni le projet PAY ni de JSM,
 * donc les tickets et incidents du jeu d'exemple doivent être servis localement
 * — sans pour autant masquer les vraies données du site.
 */
import { describe, expect, it } from 'vitest';
import { clesDeDemo, createDemoReader } from '../src/app/demo-reader';
import type { IssueReader } from '../src/jira/reader';
import type { Incident, IssueContext } from '../src/shared';

const NOW = '2026-11-11T16:30:00Z';

const reel: IssueReader = {
  async lire(cle) {
    if (cle === 'VRAI-1') {
      return {
        key: 'VRAI-1', id: '900', exists: true, status: 'En cours', criteria: [], links: [],
        fixVersions: [], labels: [], components: [], incidentKeys: [],
      } satisfies IssueContext;
    }
    return {
      key: cle, id: cle, exists: false, status: '', criteria: [], links: [],
      fixVersions: [], labels: [], components: [], incidentKeys: [],
    };
  },
  async incidentsOuverts(service): Promise<Incident[]> {
    return service === 'vrai-service' ? [{ service, incidentKey: 'VRAI-9', openedAt: NOW }] : [];
  },
};

describe('lecteur de démonstration', () => {
  const lecteur = createDemoReader(reel, NOW);

  it('sert les tickets du jeu d’exemple, avec leurs critères', async () => {
    const ticket = await lecteur.lire('PAY-123');
    expect(ticket.exists).toBe(true);
    expect(ticket.criteria.filter((critere) => !critere.done)).toHaveLength(2);
  });

  it('accepte les minuscules et les espaces', async () => {
    expect((await lecteur.lire('  pay-140 ')).incidentKeys).toContain('INC-52');
  });

  it('délègue au lecteur réel pour une clé hors jeu d’exemple', async () => {
    expect((await lecteur.lire('VRAI-1')).exists).toBe(true);
    expect((await lecteur.lire('INCONNU-9')).exists).toBe(false);
  });

  it('sert l’incident du jeu et délègue sinon', async () => {
    expect(await lecteur.incidentsOuverts('checkout-api')).toEqual([
      { service: 'checkout-api', incidentKey: 'INC-52', openedAt: '2026-11-11T08:30:00.000Z' },
    ]);
    expect((await lecteur.incidentsOuverts('vrai-service'))[0]?.incidentKey).toBe('VRAI-9');
    expect(await lecteur.incidentsOuverts('service-inconnu')).toEqual([]);
  });

  it('annonce les clés servies, pour les écrans et les tests', () => {
    expect(clesDeDemo(NOW)).toContain('PAY-123');
    expect(clesDeDemo(NOW)).toContain('PAY-132');
    expect(clesDeDemo(NOW)).toContain('PAY-133');
    expect(clesDeDemo(NOW)).toHaveLength(8);
  });
});
