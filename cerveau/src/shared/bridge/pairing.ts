/**
 * Jumelage des deux installations (§13.3, MC-01).
 *
 * L'administrateur Jira génère un code à usage unique valable 10 minutes ;
 * l'administrateur Bitbucket le saisit ; les deux côtés enregistrent alors un
 * secret partagé. Un nouveau jumelage remplace le secret et invalide l'ancien.
 */
import { randomBytes } from 'node:crypto';

/** Durée de vie d'un code de jumelage : 10 minutes. */
export const PAIRING_TTL_MS = 10 * 60 * 1000;

/** Alphabet sans caractères ambigus (pas de I, L, O, U). */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Préfixe qui rend le code reconnaissable à l'œil. */
export const CODE_PREFIX = 'MAC';

/** Générateur aléatoire injectable : rend un réel dans [0, 1). */
export type Rng = () => number;

/** Générateur d'octets injectable. */
export type ByteSource = (nombre: number) => Uint8Array;

export interface PairingOffer {
  code: string;
  siteUrl: string;
  createdBy: string;
  issuedAt: string;
  expiresAt: string;
  used: boolean;
}

/** Code à 8 caractères, présenté `MAC-XXXX-XXXX`. */
export function generatePairingCode(rng: Rng = Math.random): string {
  let corps = '';
  for (let i = 0; i < 8; i += 1) {
    corps += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)] ?? '0';
  }
  return `${CODE_PREFIX}-${corps.slice(0, 4)}-${corps.slice(4)}`;
}

/** Normalise une saisie : majuscules, espaces et tirets retirés. */
export function normalizePairingCode(saisie: string): string {
  return saisie.trim().toUpperCase().replace(/[\s-]/g, '');
}

/** Vrai si la saisie a la forme d'un code de jumelage. */
export function isPairingCodeFormat(saisie: string): boolean {
  return /^MAC[0-9A-Z]{8}$/.test(normalizePairingCode(saisie));
}

/** Crée une offre de jumelage horodatée. */
export function createPairingOffer(input: {
  siteUrl: string;
  createdBy: string;
  now: string;
  ttlMs?: number;
  rng?: Rng;
}): PairingOffer {
  const ttl = input.ttlMs ?? PAIRING_TTL_MS;
  const issuedAt = Date.parse(input.now);
  return {
    code: generatePairingCode(input.rng),
    siteUrl: input.siteUrl,
    createdBy: input.createdBy,
    issuedAt: input.now,
    expiresAt: new Date(issuedAt + ttl).toISOString(),
    used: false,
  };
}

/** Une offre est valable tant qu'elle n'est ni consommée ni expirée. */
export function isOfferValid(offer: PairingOffer, now: string): boolean {
  return !offer.used && Date.parse(now) < Date.parse(offer.expiresAt);
}

export type ConsumeResult = { ok: true } | { ok: false; reason: 'used' | 'expired' | 'mismatch' };

/** Consomme une offre : un seul essai gagnant, jamais deux. */
export function consumePairingOffer(offer: PairingOffer, saisie: string, now: string): ConsumeResult {
  if (offer.used) return { ok: false, reason: 'used' };
  if (Date.parse(now) >= Date.parse(offer.expiresAt)) return { ok: false, reason: 'expired' };
  if (normalizePairingCode(offer.code) !== normalizePairingCode(saisie)) return { ok: false, reason: 'mismatch' };
  return { ok: true };
}

/** Secret partagé de 256 bits, en base64 (stocké côté secrets Forge). */
export function generateSharedSecret(bytes: ByteSource = randomBytes): string {
  return Buffer.from(bytes(32)).toString('base64');
}
