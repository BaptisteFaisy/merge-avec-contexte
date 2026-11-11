/**
 * Client HTTP signé du pont Capteur → Cerveau (§13.3, MC-11).
 *
 * Enveloppe chaque appel dans `BridgeEnvelope`, signe avec `signRequest`,
 * borne l'attente à 4 s (une seule tentative, aucune relance) et normalise
 * tout échec en résultat structuré. Ne lève JAMAIS : un contrôle qui lève
 * vaut échec côté Bitbucket (§15), c'est le repli qui décide.
 */
import { type BridgeEnvelope, DEFAULT_BRIDGE_TIMEOUT_MS, signRequest } from '../shared';
import type { PairingStore } from '../pairing/store';

/** Motifs d'échec normalisés, traduits en cause de repli par `check/run.ts`. */
export type BridgeErrorKind = 'timeout' | 'unreachable' | 'http' | 'unpaired' | 'bad-response';

export interface BridgeClientError {
  kind: BridgeErrorKind;
  message: string;
  status?: number;
}

export type BridgeResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: BridgeClientError };

/** Réponse minimale attendue du pont : les tests passent une doublure. */
export interface ReponsePont {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export interface InitPont {
  method: string;
  headers: Record<string, string>;
  body: string;
  signal?: AbortSignal;
}

/** `fetch` injecté : une seule tentative, signal d'annulation fourni. */
export type FetchPont = (url: string, init: InitPont) => Promise<ReponsePont>;

export interface BridgeFetchOptions {
  workspaceUuid: string;
  store: PairingStore;
  fetch?: FetchPont;
  /** Horloge injectée (ms) : la signature porte l'horodatage. */
  now?: () => number;
  nonceGenerator?: () => string;
  timeoutMs?: number;
}

/** Marqueur interne : le délai est écoulé, la requête est abandonnée. */
class ErreurDelai extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/** `fetch` global adapté au port minimal (jamais appelé en test). */
const fetchDefaut: FetchPont = (url, init) =>
  fetch(url, init as RequestInit) as unknown as Promise<ReponsePont>;

/** Un corps d'erreur du pont peut signaler un jumelage perdu (§13.3). */
async function motifHttp(reponse: ReponsePont): Promise<BridgeClientError> {
  let corps = '';
  let code: unknown;
  try {
    corps = (await reponse.text()).slice(0, 300);
    code = (JSON.parse(corps) as { error?: unknown }).error;
  } catch {
    return { kind: 'http', status: reponse.status, message: `HTTP ${reponse.status}` };
  }
  if (code === 'unpaired') {
    return { kind: 'unpaired', status: reponse.status, message: 'Jumelage perdu côté Cerveau' };
  }
  return { kind: 'http', status: reponse.status, message: corps };
}

/** Interprète une réponse HTTP du pont en résultat normalisé. */
async function interpreter<T>(reponse: ReponsePont): Promise<BridgeResponse<T>> {
  if (!reponse.ok) {
    return { ok: false, error: await motifHttp(reponse) };
  }
  try {
    return { ok: true, data: (await reponse.json()) as T };
  } catch {
    return { ok: false, error: { kind: 'bad-response', message: 'Réponse JSON invalide' } };
  }
}

/** Lance la requête en course avec un délai ; annule via AbortController. */
async function requeteAvecDelai(
  fnFetch: FetchPont,
  url: string,
  init: InitPont,
  timeoutMs: number,
): Promise<ReponsePont> {
  const controleur = new AbortController();
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<never>((_ok, rejeter) => {
    minuteur = setTimeout(() => {
      controleur.abort();
      rejeter(new ErreurDelai(`Délai de ${timeoutMs} ms dépassé`));
    }, timeoutMs);
  });
  const requete = fnFetch(url, { ...init, signal: controleur.signal });
  requete.catch(() => undefined);
  try {
    return await Promise.race([requete, delai]);
  } finally {
    if (minuteur) clearTimeout(minuteur);
  }
}

/** Classe une exception réseau en motif normalisé. */
function classifierErreur(err: unknown): BridgeClientError {
  const nom = err instanceof Error ? err.name : '';
  if (nom === 'TimeoutError' || nom === 'AbortError') {
    return { kind: 'timeout', message: err instanceof Error ? err.message : 'Délai dépassé' };
  }
  return { kind: 'unreachable', message: err instanceof Error ? err.message : String(err) };
}

/** Sonde de la route publique `health` du pont : joignable ou non. */
export interface SantePont {
  joignable: boolean;
  /** Statut HTTP, quand le pont a tout de même répondu. */
  status?: number;
}

/**
 * Sonde le pont via sa route publique `health` (§17 cas 10 : pont coupé).
 *
 * Aucune signature : `health` est une route ouverte du Cerveau
 * (`cerveau/src/bridge/handler.ts`, ROUTES_PUBLIQUES). Ne lève jamais —
 * un échec réseau, un délai dépassé ou un HTTP en erreur valent
 * « injoignable », c'est à l'écran d'en faire un bandeau.
 */
export async function sonderSantePont(
  bridgeUrl: string,
  options: { fetch?: FetchPont; timeoutMs?: number } = {},
): Promise<SantePont> {
  try {
    const reponse = await requeteAvecDelai(
      options.fetch ?? fetchDefaut,
      bridgeUrl,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ route: 'health', payload: {} }),
      },
      options.timeoutMs ?? DEFAULT_BRIDGE_TIMEOUT_MS,
    );
    const sante: SantePont = { joignable: reponse.ok, status: reponse.status };
    return sante;
  } catch {
    return { joignable: false };
  }
}

/**
 * Appelle le pont signé du Cerveau avec l'enveloppe donnée.
 *
 * Le secret et l'adresse sont lus via le port `PairingStore` ; sans jumelage,
 * l'appel n'est pas tenté et l'erreur `unpaired` est rendue immédiatement.
 */
export async function appelerPont<T = unknown>(
  requete: BridgeEnvelope,
  options: BridgeFetchOptions,
): Promise<BridgeResponse<T>> {
  try {
    // Lecture séquentielle : sans secret, l'adresse n'est pas demandée, et
    // aucune promesse rejetée ne peut échapper au `catch` ci-dessous.
    const secret = await options.store.getSecret(options.workspaceUuid);
    const bridgeUrl = secret ? await options.store.getBridgeUrl(options.workspaceUuid) : undefined;
    if (!secret || !bridgeUrl) {
      return {
        ok: false,
        error: { kind: 'unpaired', message: 'Espace de travail non jumelé avec un site Jira' },
      };
    }
    const signee = signRequest({
      secret,
      body: JSON.stringify(requete),
      now: options.now,
      nonceGenerator: options.nonceGenerator,
    });
    const reponse = await requeteAvecDelai(
      options.fetch ?? fetchDefaut,
      bridgeUrl,
      { method: 'POST', headers: signee.headers, body: signee.body },
      options.timeoutMs ?? DEFAULT_BRIDGE_TIMEOUT_MS,
    );
    return interpreter<T>(reponse);
  } catch (err) {
    return { ok: false, error: classifierErreur(err) };
  }
}
