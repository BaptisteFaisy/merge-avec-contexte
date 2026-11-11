/**
 * Tests du jumelage (§13.3, MC-01).
 *
 * Le dépôt de jumelages est une doublure en mémoire, écrite ici : rien ne
 * touche à `storage/`.
 */
import { describe, expect, it } from 'vitest';
import { normalizePairingCode, type PairingOffer } from '../src/shared';
import { creerOffre, jumeler } from '../src/bridge/pairing';
import type { BridgeDeps, PairingRecord } from '../src/bridge/deps';

const MAINTENANT = '2026-11-11T10:00:00.000Z';
const SITE = 'https://jira.exemple.test';

/** Dépôt de jumelages en mémoire : offres et jumelages. */
class PairingMemoire {
  readonly offers = new Map<string, PairingOffer>();
  readonly records = new Map<string, PairingRecord>();

  async saveOffer(offer: PairingOffer): Promise<void> {
    this.offers.set(normalizePairingCode(offer.code), offer);
  }

  async findOffer(code: string): Promise<PairingOffer | undefined> {
    return this.offers.get(normalizePairingCode(code));
  }

  async markOfferUsed(code: string): Promise<void> {
    const offre = this.offers.get(normalizePairingCode(code));
    if (offre) this.offers.set(normalizePairingCode(code), { ...offre, used: true });
  }

  async savePairing(pairing: PairingRecord): Promise<void> {
    this.records.set(pairing.workspaceUuid, pairing);
  }

  async pairingForWorkspace(workspaceUuid: string): Promise<PairingRecord | undefined> {
    return this.records.get(workspaceUuid);
  }

  async pairings(): Promise<PairingRecord[]> {
    return [...this.records.values()];
  }

  async fallbackPolicy(): Promise<'open' | 'closed'> {
    return 'open';
  }
}

/** Dépendances de test, avec une horloge fixe. */
function deps(clock: () => string = () => MAINTENANT): BridgeDeps {
  return {
    pairing: new PairingMemoire(),
    context: {
      rules: async () => [],
      serviceForRepository: async () => undefined,
      freezes: async () => [],
    },
    waivers: {
      demander: async () => { throw new Error('inutilisé'); },
      decider: async () => { throw new Error('inutilisé'); },
      lister: async () => [],
    },
    nonces: { seen: async () => false, remember: async () => undefined },
    evaluate: async () => { throw new Error('inutilisé'); },
    clock,
    logger: { info: () => undefined, error: () => undefined },
    config: {
      bridgeUrl: 'https://pont.exemple.test',
      version: '0.1.0',
      siteUrl: SITE,
      adminAccountId: 'admin-1',
      locale: 'fr',
    },
  };
}

/** Offre de code fixe, valable dix minutes ou déjà expirée. */
function offre(expiree = false): PairingOffer {
  return {
    code: 'MAC-ABCD-EFGH',
    siteUrl: SITE,
    createdBy: 'admin-1',
    issuedAt: MAINTENANT,
    expiresAt: expiree
      ? '2026-11-11T09:00:00.000Z'
      : '2026-11-11T10:10:00.000Z',
    used: false,
  };
}

describe('jumelage', () => {
  it('crée une offre valable dix minutes', async () => {
    const base = deps();
    const cree = await creerOffre(base);
    const ecart = Date.parse(cree.expiresAt) - Date.parse(cree.issuedAt);
    expect(ecart).toBe(10 * 60 * 1000);
    expect(cree.used).toBe(false);
    expect(cree.siteUrl).toBe(SITE);
  });

  it('dépose l\'offre dans le dépôt', async () => {
    const base = deps();
    const cree = await creerOffre(base);
    const trouvee = await base.pairing.findOffer(cree.code);
    expect(trouvee?.code).toBe(cree.code);
  });

  it('refuse un code faux sans consommer l\'offre', async () => {
    const base = deps();
    const cree = await creerOffre(base);
    const outcome = await jumeler('MAC-0000-0000', 'ws-1', base);
    expect(outcome.ok).toBe(false);
    const apres = await base.pairing.findOffer(cree.code);
    expect(apres?.used).toBe(false);
  });

  it('refuse un code inconnu', async () => {
    const base = deps();
    const outcome = await jumeler('MAC-ABCD-EFGH', 'ws-1', base);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('mismatch');
  });

  it('refuse un code expiré', async () => {
    const base = deps();
    await base.pairing.saveOffer(offre(true));
    const outcome = await jumeler('MAC-ABCD-EFGH', 'ws-1', base);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('expired');
  });

  it('refuse un code déjà utilisé', async () => {
    const base = deps();
    await base.pairing.saveOffer(offre());
    const premier = await jumeler('MAC-ABCD-EFGH', 'ws-1', base);
    const second = await jumeler('MAC-ABCD-EFGH', 'ws-1', base);
    expect(premier.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('used');
  });

  it('rend le secret, l\'adresse du pont, le site et l\'instant', async () => {
    const base = deps();
    const cree = await creerOffre(base);
    const outcome = await jumeler(cree.code, 'ws-1', base);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.secret.length).toBeGreaterThan(20);
    expect(outcome.result.bridgeUrl).toBe('https://pont.exemple.test');
    expect(outcome.result.siteUrl).toBe(SITE);
    expect(outcome.result.pairedAt).toBe(MAINTENANT);
  });

  it('enregistre le jumelage avec le secret rendu', async () => {
    const base = deps();
    const cree = await creerOffre(base);
    const outcome = await jumeler(cree.code, 'ws-1', base);
    if (!outcome.ok) throw new Error('jumelage attendu');
    const record = await base.pairing.pairingForWorkspace('ws-1');
    expect(record?.secret).toBe(outcome.result.secret);
    expect(record?.siteUrl).toBe(SITE);
  });

  it('accepte un code saisi avec des tirets et des espaces', async () => {
    const base = deps();
    const cree = await creerOffre(base);
    const outcome = await jumeler(` ${cree.code.toLowerCase()} `, 'ws-1', base);
    expect(outcome.ok).toBe(true);
  });

  it('remplace le secret lors d\'un nouveau jumelage', async () => {
    const base = deps();
    const premiere = await creerOffre(base);
    const premier = await jumeler(premiere.code, 'ws-1', base);
    const seconde = await creerOffre(base);
    const deuxieme = await jumeler(seconde.code, 'ws-1', base);
    if (!premier.ok || !deuxieme.ok) throw new Error('jumelages attendus');
    expect(deuxieme.result.secret).not.toBe(premier.result.secret);
    const record = await base.pairing.pairingForWorkspace('ws-1');
    expect(record?.secret).toBe(deuxieme.result.secret);
  });

  it('n\'affiche qu\'un seul jumelage actif par espace de travail', async () => {
    const base = deps();
    const premiere = await creerOffre(base);
    await jumeler(premiere.code, 'ws-1', base);
    const seconde = await creerOffre(base);
    await jumeler(seconde.code, 'ws-1', base);
    const records = await base.pairing.pairings();
    expect(records).toHaveLength(1);
  });
});
