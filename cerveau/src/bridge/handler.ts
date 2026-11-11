/**
 * Handler du pont signé (§13.3).
 *
 * Un web trigger Forge n'a aucune authentification : la signature HMAC, la
 * fenêtre de cinq minutes et le nonce sont la seule défense. Ce module ne
 * lève jamais — toute exception devient un 500 `internal` journalisé — parce
 * qu'une exception Forge rend à Bitbucket une erreur opaque.
 */
import {
  BRIDGE_ROUTES,
  parseEnvelope,
  verifyRequest,
  type BridgeRoute,
} from '../shared';
import type { BridgeDeps } from './deps';
import { BridgeError, erreurPont, reponseErreur, type BridgeResponse } from './errors';
import { ROUTES } from './routes';

/** Requête telle qu'elle arrive d'un web trigger Forge. */
export interface BridgeRequest {
  body: string;
  headers: Record<string, string | undefined>;
}

/** Routes ouvertes : `health` ne révèle rien, `pair` se contrôle par le code. */
const ROUTES_PUBLIQUES: BridgeRoute[] = ['health', 'pair'];

/** Vrai si la route se passe de signature. */
export function routePublique(route: BridgeRoute): boolean {
  return ROUTES_PUBLIQUES.includes(route);
}

/**
 * Vérifie la signature contre le secret du jumelage concerné.
 *
 * L'espace de travail est lu dans le corps, mais il n'est pas cru : il ne
 * sert qu'à choisir le secret à essayer. Un refus avec un mauvais secret ne
 * consomme pas le nonce : `verifyRequest` ne l'enregistre qu'après une
 * empreinte correcte.
 */
async function signatureValide(requete: BridgeRequest, deps: BridgeDeps): Promise<boolean> {
  const candidates = await secretsCandidats(requete.body, deps);
  const now = Date.parse(deps.clock());
  for (const secret of candidates) {
    const verification = await verifyRequest({
      secret,
      headers: requete.headers,
      body: requete.body,
      nonces: deps.nonces,
      now,
    });
    if (verification.ok) return true;
  }
  return false;
}

/**
 * Secrets à essayer : celui du jumelage de l'espace de travail d'abord,
 * puis tous les autres (une rotation peut précéder la demande en vol).
 */
async function secretsCandidats(body: string, deps: BridgeDeps): Promise<string[]> {
  const tous = await deps.pairing.pairings();
  const workspace = lireWorkspace(body);
  if (workspace === undefined) return tous.map((jumelage) => jumelage.secret);
  const prefere = tous.find((jumelage) => jumelage.workspaceUuid === workspace);
  const autres = tous.filter((jumelage) => jumelage.secret !== prefere?.secret);
  return prefere
    ? [prefere.secret, ...autres.map((jumelage) => jumelage.secret)]
    : autres.map((jumelage) => jumelage.secret);
}

/** Espace de travail annoncé dans le corps ; `undefined` s'il n'y en a pas. */
function lireWorkspace(body: string): string | undefined {
  try {
    const brut = JSON.parse(body) as Record<string, unknown>;
    const payload = brut.payload as Record<string, unknown> | undefined;
    const cible = payload ?? brut;
    const workspace = cible?.workspaceUuid;
    return typeof workspace === 'string' ? workspace : undefined;
  } catch {
    return undefined;
  }
}

/** Lit la route du corps ; `bad-payload` si illisible, `unknown-route` sinon. */
function lireRoute(body: string): BridgeRoute {
  let brut: unknown;
  try {
    brut = JSON.parse(body);
  } catch {
    throw erreurPont('bad-payload', 'Corps illisible : JSON attendu.');
  }
  if (typeof brut !== 'object' || brut === null || Array.isArray(brut)) {
    throw erreurPont('bad-payload', 'Corps illisible : objet attendu.');
  }
  const route = (brut as Record<string, unknown>).route;
  if (typeof route !== 'string') {
    throw erreurPont('bad-payload', 'Route manquante.');
  }
  if (!(BRIDGE_ROUTES as string[]).includes(route)) {
    throw erreurPont('unknown-route', `Route inconnue : ${route}.`);
  }
  return route as BridgeRoute;
}

/** Traite la requête : route, signature, garde de forme, gestionnaire. */
async function traiter(requete: BridgeRequest, deps: BridgeDeps): Promise<BridgeResponse> {
  const route = lireRoute(requete.body);
  if (!routePublique(route) && !(await signatureValide(requete, deps))) {
    throw erreurPont('unauthorized', 'Signature absente, invalide, périmée ou déjà vue.');
  }
  const enveloppe = parseEnvelope(requete.body);
  if (!enveloppe.ok) {
    throw erreurPont('bad-payload', 'Enveloppe du pont illisible.');
  }
  const gestionnaire = ROUTES[enveloppe.envelope.route];
  return gestionnaire(enveloppe.envelope.payload, deps);
}

/**
 * Point d'entrée du web trigger. Rend toujours une réponse JSON.
 */
export async function gererRequetePont(
  requete: BridgeRequest,
  deps: BridgeDeps,
): Promise<BridgeResponse> {
  try {
    return await traiter(requete, deps);
  } catch (erreur) {
    if (erreur instanceof BridgeError) {
      deps.logger.info('Pont : erreur volontaire', { code: erreur.code });
      return reponseErreur(erreur.code, erreur.message, erreur.statusCode);
    }
    deps.logger.error('Pont : erreur inattendue', { erreur: String(erreur) });
    return reponseErreur('internal', 'Erreur interne du pont.', 500);
  }
}

/** Alias du manifeste Forge : le module `webtrigger` appelle `gererPont`. */
export const gererPont = gererRequetePont;
