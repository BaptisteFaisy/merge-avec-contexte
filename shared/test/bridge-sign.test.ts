import { describe, expect, it } from 'vitest';
import { computeSignature, HEADER_NAMES, SIGNATURE_VERSION, signRequest, signatureEquals } from '../src/bridge/sign';
import { createMemoryNonceStore, verifyRequest } from '../src/bridge/verify';

const SECRET = 'secret-de-test-32-octets-0123456789';
const CORPS = JSON.stringify({ route: 'evaluate', payload: { pullRequestId: 42 } });
const T0 = Date.parse('2026-11-11T09:00:00Z');

describe('pont signé — signature', () => {
  it('signe et vérifie une requête fraîche', async () => {
    const requete = signRequest({ secret: SECRET, body: CORPS, now: () => T0, nonceGenerator: () => 'nonce-1' });
    const resultat = await verifyRequest({
      secret: SECRET, headers: requete.headers, body: CORPS, nonces: createMemoryNonceStore(), now: T0,
    });
    expect(resultat.ok).toBe(true);
  });

  it('refuse une signature falsifiée', async () => {
    const requete = signRequest({ secret: SECRET, body: CORPS, now: () => T0, nonceGenerator: () => 'n' });
    const headers = { ...requete.headers, [HEADER_NAMES.signature]: 'a'.repeat(64) };
    const resultat = await verifyRequest({ secret: SECRET, headers, body: CORPS, nonces: createMemoryNonceStore(), now: T0 });
    expect(resultat).toEqual({ ok: false, reason: 'bad-signature' });
  });

  it('refuse un corps modifié après signature', async () => {
    const requete = signRequest({ secret: SECRET, body: CORPS, now: () => T0, nonceGenerator: () => 'n2' });
    const resultat = await verifyRequest({
      secret: SECRET, headers: requete.headers, body: CORPS.replace('42', '43'),
      nonces: createMemoryNonceStore(), now: T0,
    });
    expect(resultat).toEqual({ ok: false, reason: 'bad-signature' });
  });

  it('refuse une requête de plus de 5 minutes', async () => {
    const requete = signRequest({ secret: SECRET, body: CORPS, now: () => T0, nonceGenerator: () => 'n3' });
    const resultat = await verifyRequest({
      secret: SECRET, headers: requete.headers, body: CORPS, nonces: createMemoryNonceStore(), now: T0 + 301_000,
    });
    expect(resultat).toEqual({ ok: false, reason: 'stale-timestamp' });
  });

  it('refuse un rejeu du même nonce', async () => {
    const nonces = createMemoryNonceStore();
    const requete = signRequest({ secret: SECRET, body: CORPS, now: () => T0, nonceGenerator: () => 'unique' });
    await verifyRequest({ secret: SECRET, headers: requete.headers, body: CORPS, nonces, now: T0 });
    const second = await verifyRequest({ secret: SECRET, headers: requete.headers, body: CORPS, nonces, now: T0 + 1000 });
    expect(second).toEqual({ ok: false, reason: 'replayed-nonce' });
  });

  it('refuse une requête sans en-tête de signature', async () => {
    const resultat = await verifyRequest({
      secret: SECRET, headers: { [HEADER_NAMES.timestamp]: String(T0) }, body: CORPS,
      nonces: createMemoryNonceStore(), now: T0,
    });
    expect(resultat).toEqual({ ok: false, reason: 'missing-header' });
  });

  it('refuse une version inconnue', async () => {
    const requete = signRequest({ secret: SECRET, body: CORPS, now: () => T0, nonceGenerator: () => 'n4' });
    const headers = { ...requete.headers, [HEADER_NAMES.version]: 'v0' };
    const resultat = await verifyRequest({ secret: SECRET, headers, body: CORPS, nonces: createMemoryNonceStore(), now: T0 });
    expect(resultat).toEqual({ ok: false, reason: 'bad-version' });
  });

  it('lit les en-têtes sans tenir compte de la casse', async () => {
    const requete = signRequest({ secret: SECRET, body: CORPS, now: () => T0, nonceGenerator: () => 'n5' });
    const headers = Object.fromEntries(Object.entries(requete.headers).map(([cle, valeur]) => [cle.toUpperCase(), valeur]));
    const resultat = await verifyRequest({ secret: SECRET, headers, body: CORPS, nonces: createMemoryNonceStore(), now: T0 });
    expect(resultat.ok).toBe(true);
  });

  it('produit une empreinte stable et versionnée', () => {
    expect(computeSignature(SECRET, String(T0), 'n', CORPS)).toBe(computeSignature(SECRET, String(T0), 'n', CORPS));
    expect(SIGNATURE_VERSION).toBe('v1');
    expect(signatureEquals('abc', 'abc')).toBe(true);
    expect(signatureEquals('abc', 'abd')).toBe(false);
    expect(signatureEquals('', '')).toBe(false);
  });
});
