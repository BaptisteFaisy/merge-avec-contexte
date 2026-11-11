/**
 * Handler du pont signé (§13.3).
 *
 * Un web trigger Forge n'a aucune authentification : la signature HMAC, la
 * fenêtre de cinq minutes et le nonce sont la seule défense. Ce module ne
 * lève jamais — toute exception devient un 500 `internal` journalisé — parce
 * qu'une exception Forge rend à Bitbucket une erreur opaque.
 *
 * Trois gardes s'ajoutent à la signature :
 * - une limite de débit par espace de travail et globale (item 10) : l'URL est
 *   publique, la signature protège le contenu d'une requête, pas son volume ;
 * - la liaison de l'espace de travail annoncé au jumelage dont le secret a
 *   validé la signature (item 46) : le secret d'un espace ne peut plus faire
 *   passer une requête qui prétend agir au nom d'un autre ;
 * - la purge opportuniste des nonces expirés (item 26).
 *
 * ## Fuite du secret partagé (item 52)
 *
 * Le secret HMAC est la seule preuve d'identité du Capteur. S'il fuit — journal,
 * dépôt public, capture d'écran, personne ayant quitté l'équipe — la rotation
 * se fait **par re-jumelage**, et nulle part ailleurs :
 *
 * 1. L'administrateur Jira crée une nouvelle offre de jumelage (`creerOffre`,
 *    écran de réglages ou action Rovo) : un code à usage unique, valable dix
 *    minutes, qui ne circule que sur l'écran Jira.
 * 2. L'administrateur Bitbucket consomme ce code depuis le panneau de l'espace
 *    (route publique `pair`) : `jumeler` tire un secret neuf, le Capteur le
 *    range dans son propre stockage, le Cerveau écrit le sien dans le coffre de
 *    secrets Forge (`savePairing` → `vault.write`).
 * 3. Le nouveau jumelage **remplace** l'ancien : `pairings()` ne rend plus que
 *    le secret courant, donc toute requête signée avec le secret volé est
 *    refusée en 401 `unauthorized` dès la fin du re-jumelage. Rien à purger,
 *    aucun redémarrage nécessaire.
 * 4. Contrôle de fin de rotation : une requête signée avec l'ancien secret doit
 *    rendre 401, une requête signée avec le nouveau doit rendre 200.
 * 5. Si la fuite a pu servir : lire le journal d'audit des dérogations
 *    (`store.waiverAudit`) et le journal des évaluations (`store.evaluations`)
 *    sur la période suspecte — les deux sont conservés sans limite de durée.
 *
 * Le secret ne va jamais en base, jamais dans les journaux et jamais dans un
 * message d'erreur : seul le coffre Forge en garde la valeur, la base ne garde
 * qu'une référence. Un message d'erreur ne dit donc pas quel secret a échoué.
 */
import {
  BRIDGE_ROUTES,
  parseEnvelope,
  verifyRequest,
  type BridgeRoute,
} from '../shared';
import type { BridgeDeps, PairingRecord } from './deps';
import { BridgeError, erreurDebitLimite, erreurPont, reponseErreur, type BridgeResponse } from './errors';
import { retryAfterSecondes } from './limite-debit';
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
 * Limite de débit (item 10) : refusée en 429, avec l'attente conseillée.
 *
 * Le refus ne dit ni les bornes configurées, ni ce que les autres appelants
 * consomment : un attaquant ne doit pas pouvoir régler son flot dessus.
 */
async function limiterLeDebit(deps: BridgeDeps, workspace: string | undefined): Promise<void> {
  if (deps.limite === undefined) return;
  const verdict = await deps.limite.verifier(workspace);
  if (verdict.allowed) return;
  deps.logger.info('Pont : débit limité', { borne: verdict.scope, attenteMs: verdict.retryAfterMs });
  throw erreurDebitLimite(retryAfterSecondes(verdict));
}

/**
 * Vérifie la signature et lie la requête à un jumelage (item 46).
 *
 * L'espace de travail est lu dans le corps, mais il n'est pas cru : la
 * signature doit être validée par le secret du jumelage **de cet espace**. Un
 * refus avec un mauvais secret ne consomme pas le nonce : `verifyRequest` ne
 * l'enregistre qu'après une empreinte correcte.
 *
 * Trois refus explicites : signature absente ou fausse (`unauthorized`),
 * requête non attribuable — pas d'espace annoncé alors que plusieurs jumelages
 * sont actifs (`unauthorized`), espace annoncé non jumelé (`unpaired`). Aucun
 * message ne révèle quel secret a validé quoi.
 */
async function exigerSignature(
  requete: BridgeRequest,
  deps: BridgeDeps,
  workspace: string | undefined,
): Promise<void> {
  const tous = await deps.pairing.pairings();
  const validePar = await premierJumelageSignataire(requete, deps, tous);
  if (validePar === undefined) {
    throw erreurPont('unauthorized', 'Signature absente, invalide, périmée ou déjà vue.');
  }
  if (workspace === undefined && tous.length > 1) {
    throw erreurPont(
      'unauthorized',
      'Espace de travail absent du corps : la requête ne peut pas être attribuée à un jumelage.',
    );
  }
  if (workspace !== undefined && validePar.workspaceUuid !== workspace) {
    const jumele = tous.some((jumelage) => jumelage.workspaceUuid === workspace);
    throw jumele
      ? erreurPont('unauthorized', 'Signature invalide pour cet espace de travail.')
      : erreurPont('unpaired', "Cet espace de travail n'est pas jumelé.");
  }
}

/** Premier jumelage dont le secret valide la signature, s'il y en a un. */
async function premierJumelageSignataire(
  requete: BridgeRequest,
  deps: BridgeDeps,
  jumelages: PairingRecord[],
): Promise<PairingRecord | undefined> {
  const now = Date.parse(deps.clock());
  for (const jumelage of jumelages) {
    const verification = await verifyRequest({
      secret: jumelage.secret,
      headers: requete.headers,
      body: requete.body,
      nonces: deps.nonces,
      now,
    });
    if (verification.ok) return jumelage;
  }
  return undefined;
}

/** Purge opportuniste des nonces expirés (item 26) : jamais un échec de requête. */
async function purgerNonces(deps: BridgeDeps): Promise<void> {
  if (deps.purgeNonces === undefined) return;
  const effaces = await deps.purgeNonces.purgerSiBesoin(deps.clock());
  if (effaces > 0) deps.logger.info('Pont : nonces expirés purgés', { effaces });
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

/**
 * Traite la requête : débit, route, signature, purge, garde de forme, gestionnaire.
 *
 * La limite de débit passe **avant** la lecture de la route : un flot de corps
 * illisibles coûte aussi cher au conteneur qu'un flot de requêtes signées.
 */
async function traiter(requete: BridgeRequest, deps: BridgeDeps): Promise<BridgeResponse> {
  const workspace = lireWorkspace(requete.body);
  await limiterLeDebit(deps, workspace);
  const route = lireRoute(requete.body);
  if (!routePublique(route)) await exigerSignature(requete, deps, workspace);
  await purgerNonces(deps);
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
      return reponseErreur(erreur.code, erreur.message, erreur.statusCode, erreur.headers);
    }
    deps.logger.error('Pont : erreur inattendue', { erreur: String(erreur) });
    return reponseErreur('internal', 'Erreur interne du pont.', 500);
  }
}

/** Alias du manifeste Forge : le module `webtrigger` appelle `gererPont`. */
export const gererPont = gererRequetePont;
