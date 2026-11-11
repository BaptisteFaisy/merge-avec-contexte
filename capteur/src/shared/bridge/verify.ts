/**
 * Vérification d'une requête du pont : signature, fraîcheur, anti-rejeu.
 *
 * Le Cerveau rejette toute requête de plus de 5 minutes ou déjà vue (§13.3).
 * Cette fonction ne lève jamais : elle rend un verdict exploitable tel quel.
 */
import { computeSignature, HEADER_NAMES, MAX_SKEW_MS, SIGNATURE_VERSION, signatureEquals } from './sign';

/** Mémoire des nonces déjà vus (implémentation réelle : table SQL). */
export interface NonceStore {
  seen(nonce: string): Promise<boolean>;
  remember(nonce: string, expiresAt: string): Promise<void>;
}

export type VerifyFailure = 'missing-header' | 'bad-version' | 'stale-timestamp' | 'bad-signature' | 'replayed-nonce';

export type VerifyResult = { ok: true; nonce: string; timestamp: number } | { ok: false; reason: VerifyFailure };

export interface VerifyInput {
  secret: string;
  /** En-têtes HTTP tels que reçus (la casse est normalisée ici). */
  headers: Record<string, string | undefined>;
  body: string;
  nonces: NonceStore;
  /** Horloge injectée : millisecondes depuis l'epoch. */
  now?: number;
  maxSkewMs?: number;
}

/**
 * Store mémoire, pour les tests et les déploiements sans base.
 *
 * L'horloge est injectée : un test qui vérifie l'anti-rejeu avec un
 * horodatage fixe ne doit pas dépendre de l'heure réelle du moment où il
 * tourne (sinon la purge vide la mémoire et le rejeu passe — bug réel relevé
 * le jour où l'horodatage des tests est devenu passé).
 */
export function createMemoryNonceStore(clock: () => number = Date.now): NonceStore & { size(): number } {
  const vus = new Map<string, number>();
  const purger = () => {
    const maintenant = clock();
    for (const [nonce, expiration] of vus) {
      if (expiration <= maintenant) vus.delete(nonce);
    }
  };
  return {
    async seen(nonce) {
      purger();
      return vus.has(nonce);
    },
    async remember(nonce, expiresAt) {
      vus.set(nonce, Date.parse(expiresAt));
    },
    size() {
      purger();
      return vus.size;
    },
  };
}

/** Lit un en-tête sans tenir compte de la casse. */
function header(headers: Record<string, string | undefined>, nom: string): string | undefined {
  const cherche = Object.keys(headers).find((cle) => cle.toLowerCase() === nom);
  return cherche ? headers[cherche] : undefined;
}

/** Vérifie signature, fenêtre de temps et nouveauté du nonce. */
export async function verifyRequest(input: VerifyInput): Promise<VerifyResult> {
  const now = input.now ?? Date.now();
  const maxSkew = input.maxSkewMs ?? MAX_SKEW_MS;
  const timestamp = header(input.headers, HEADER_NAMES.timestamp);
  const nonce = header(input.headers, HEADER_NAMES.nonce);
  const signature = header(input.headers, HEADER_NAMES.signature);
  const version = header(input.headers, HEADER_NAMES.version);
  if (!timestamp || !nonce || !signature) return { ok: false, reason: 'missing-header' };
  if (version !== SIGNATURE_VERSION) return { ok: false, reason: 'bad-version' };
  const horodatage = Number(timestamp);
  if (!Number.isFinite(horodatage) || Math.abs(now - horodatage) > maxSkew) {
    return { ok: false, reason: 'stale-timestamp' };
  }
  const attendue = computeSignature(input.secret, timestamp, nonce, input.body);
  if (!signatureEquals(attendue, signature)) return { ok: false, reason: 'bad-signature' };
  if (await input.nonces.seen(nonce)) return { ok: false, reason: 'replayed-nonce' };
  await input.nonces.remember(nonce, new Date(horodatage + maxSkew).toISOString());
  return { ok: true, nonce, timestamp: horodatage };
}
