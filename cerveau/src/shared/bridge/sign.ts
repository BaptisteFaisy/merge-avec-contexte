/**
 * Signature du pont entre le Capteur et le Cerveau (§13.3).
 *
 * Un web trigger Forge n'a aucune authentification : chaque requête porte
 * donc une empreinte HMAC-SHA256 d'un corps canonique (version, horodatage,
 * nonce, empreinte du corps). Le secret ne circule jamais.
 */
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_VERSION = 'v1';

/** Fenêtre de validité d'une requête : 5 minutes (§13.3). */
export const MAX_SKEW_MS = 5 * 60 * 1000;

export const HEADER_NAMES = {
  version: 'x-mac-version',
  timestamp: 'x-mac-timestamp',
  nonce: 'x-mac-nonce',
  signature: 'x-mac-signature',
} as const;

export type BridgeHeaders = Record<string, string>;

/** Empreinte SHA-256 hexadécimale du corps (le corps lui-même n'est pas signé). */
export function hashBody(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

/** Chaîne canonique signée : les quatre éléments, séparés par un saut de ligne. */
export function canonicalString(timestamp: string, nonce: string, bodyHash: string): string {
  return [SIGNATURE_VERSION, timestamp, nonce, bodyHash].join('\n');
}

/** Empreinte HMAC-SHA256 hexadécimale de la chaîne canonique. */
export function computeSignature(secret: string, timestamp: string, nonce: string, body: string): string {
  return createHmac('sha256', secret).update(canonicalString(timestamp, nonce, hashBody(body)), 'utf8').digest('hex');
}

export interface SignRequestInput {
  secret: string;
  body: string;
  /** Horloge injectée : millisecondes depuis l'epoch. */
  now?: () => number;
  nonceGenerator?: () => string;
}

export interface SignedRequest {
  headers: BridgeHeaders;
  body: string;
}

/** Prépare une requête signée : en-têtes + corps à envoyer tel quel. */
export function signRequest(input: SignRequestInput): SignedRequest {
  const now = input.now ?? Date.now;
  const nonceGenerator = input.nonceGenerator ?? randomUUID;
  const timestamp = String(now());
  const nonce = nonceGenerator();
  return {
    headers: {
      [HEADER_NAMES.version]: SIGNATURE_VERSION,
      [HEADER_NAMES.timestamp]: timestamp,
      [HEADER_NAMES.nonce]: nonce,
      [HEADER_NAMES.signature]: computeSignature(input.secret, timestamp, nonce, input.body),
      'content-type': 'application/json',
    },
    body: input.body,
  };
}

/** Comparaison à temps constant de deux empreintes hexadécimales. */
export function signatureEquals(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}
