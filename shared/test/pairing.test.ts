import { describe, expect, it } from 'vitest';
import {
  CODE_PREFIX, PAIRING_TTL_MS, consumePairingOffer, createPairingOffer,
  generatePairingCode, generateSharedSecret, isOfferValid, isPairingCodeFormat, normalizePairingCode,
} from '../src/bridge/pairing';

const NOW = '2026-11-11T09:00:00Z';
const suite = (n: number) => () => n;

describe('jumelage — code à usage unique (§13.3)', () => {
  it('produit un code lisible MAC-XXXX-XXXX', () => {
    const code = generatePairingCode(suite(0.5));
    expect(code).toMatch(/^MAC-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(code.startsWith(CODE_PREFIX)).toBe(true);
  });

  it('reconnaît un code quelle que soit la saisie', () => {
    expect(isPairingCodeFormat('mac abcd efgh')).toBe(true);
    expect(normalizePairingCode(' MAC-ABCD-EFGH ')).toBe('MACABCDEFGH');
    expect(isPairingCodeFormat('MAC-ABCD')).toBe(false);
  });

  it('date l’offre et la garde valable dix minutes', () => {
    const offre = createPairingOffer({ siteUrl: 'https://demo.atlassian.net', createdBy: 'admin', now: NOW });
    expect(Date.parse(offre.expiresAt) - Date.parse(offre.issuedAt)).toBe(PAIRING_TTL_MS);
    expect(isOfferValid(offre, NOW)).toBe(true);
    expect(isOfferValid(offre, '2026-11-11T09:11:00Z')).toBe(false);
  });

  it('refuse un code faux, un code expiré et un code déjà consommé', () => {
    const offre = createPairingOffer({ siteUrl: 'https://demo.atlassian.net', createdBy: 'admin', now: NOW, rng: suite(0.1) });
    expect(consumePairingOffer(offre, 'MAC-ZZZZ-ZZZZ', NOW)).toEqual({ ok: false, reason: 'mismatch' });
    expect(consumePairingOffer(offre, offre.code, '2026-11-11T10:00:00Z')).toEqual({ ok: false, reason: 'expired' });
    expect(consumePairingOffer({ ...offre, used: true }, offre.code, NOW)).toEqual({ ok: false, reason: 'used' });
    expect(consumePairingOffer(offre, offre.code, NOW)).toEqual({ ok: true });
  });

  it('produit un secret de 256 bits en base64', () => {
    const secret = generateSharedSecret(() => new Uint8Array(32).fill(7));
    expect(Buffer.from(secret, 'base64')).toHaveLength(32);
  });
});
