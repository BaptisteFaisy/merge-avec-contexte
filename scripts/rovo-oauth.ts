/**
 * Client OAuth 2.1 du serveur MCP Atlassian (`https://mcp.atlassian.com`).
 *
 * Le serveur MCP qui expose les outils d'un module `rovo:mcp` (endpoint
 * `https://mcp.atlassian.com/forge/<appId>`) exige un jeton OAuth 2.1 obtenu
 * par le flux « code d'autorisation + PKCE » : enregistrement dynamique du
 * client (RFC 7591), consentement dans le navigateur, échange du code. Ce
 * module ne porte **aucun secret** : l'identifiant de client est créé à la
 * volée et le vérifieur PKCE n'est jamais écrit sur disque.
 *
 * Aucun réseau dans les tests : la fonction de récupération est injectée.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';

/** Base du serveur MCP Atlassian (autorisation, jeton, enregistrement). */
export const BASE_MCP = 'https://mcp.atlassian.com';

/** URI de redirection en boucle locale (RFC 8252). */
export const REDIRECT_PAR_DEFAUT = 'http://127.0.0.1:8765/callback';

/** Portées demandées : lecture Jira, identité, et jeton de rafraîchissement. */
export const PORTEES_DEFAUT = 'read:jira-work read:me offline_access';

/** Réponse HTTP minimale, satisfaite par `fetch` comme par une doublure. */
export interface ReponseHttpOAuth {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

/** Fonction de récupération injectée pour les tests. */
export type RecuperateurOAuth = (url: string, init?: RequestInit) => Promise<ReponseHttpOAuth>;

/** `fetch` natif, repli de production. */
export const recuperateurNatif: RecuperateurOAuth = (url, init) => fetch(url, init) as Promise<ReponseHttpOAuth>;

/** Paire PKCE : le vérifieur part au serveur de jeton, le défi à l'autorisation. */
export interface Pkce {
  verifier: string;
  challenge: string;
}

/** Client enregistré dynamiquement (réponse de `/v1/register`). */
export interface EnregistrementClient {
  client_id: string;
  redirect_uris?: string[];
  registration_client_uri?: string;
}

/** Jeton rendu par `/v1/token` (flux code ou rafraîchissement). */
export interface JetonMCP {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

/** Entrées de l'échange de code. */
export interface EchangeCode {
  clientId: string;
  code: string;
  verifier: string;
  redirectUri: string;
}

/** Entrées du rafraîchissement. */
export interface Rafraichissement {
  clientId: string;
  refreshToken: string;
}

/** Codage base64url sans bourrage. */
export function b64url(tampon: Buffer): string {
  return tampon.toString('base64url');
}

/** Défi S256 (RFC 7636) d'un vérifieur PKCE. */
export function defiS256(verifier: string): string {
  return b64url(createHash('sha256').update(verifier).digest());
}

/** Nouvelle paire PKCE : 32 octets d'aléa, défi S256. */
export function nouvellePkce(): Pkce {
  const verifier = b64url(randomBytes(32));
  return { verifier, challenge: defiS256(verifier) };
}

/** Nouvel état anti-CSRF pour l'aller-retour d'autorisation. */
export function nouvelEtat(): string {
  return randomUUID();
}

/** URL d'autorisation complète, prête à ouvrir dans le navigateur. */
export function urlAutorisation(options: {
  base: string;
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
  scopes: string;
}): string {
  const parametres = new URLSearchParams({
    response_type: 'code',
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    code_challenge: options.challenge,
    code_challenge_method: 'S256',
    scope: options.scopes,
    state: options.state,
  });
  return `${options.base}/v1/authorize?${parametres.toString()}`;
}

/** Corps d'enregistrement dynamique du client (RFC 7591). */
function corpsEnregistrement(redirectUri: string, scopes: string): Record<string, unknown> {
  return {
    client_name: 'merge-avec-contexte-rovo',
    redirect_uris: [redirectUri],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    scope: scopes,
  };
}

/** Enregistre un client dynamique auprès du serveur d'autorisation. */
export async function enregistrerClient(
  base: string,
  options: { redirectUri: string; scopes: string },
  recuperer: RecuperateurOAuth = recuperateurNatif,
): Promise<EnregistrementClient> {
  const reponse = await recuperer(`${base}/v1/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corpsEnregistrement(options.redirectUri, options.scopes)),
  });
  const corps = await reponse.text();
  if (!reponse.ok) {
    throw new Error(`Enregistrement du client refusé (HTTP ${reponse.status}) : ${corps.slice(0, 200)}`);
  }
  return JSON.parse(corps) as EnregistrementClient;
}

/** Corps d'échange d'un code d'autorisation contre un jeton. */
function corpsEchange(echange: EchangeCode): URLSearchParams {
  const corps = new URLSearchParams();
  corps.set('grant_type', 'authorization_code');
  corps.set('code', echange.code);
  corps.set('redirect_uri', echange.redirectUri);
  corps.set('client_id', echange.clientId);
  corps.set('code_verifier', echange.verifier);
  return corps;
}

/** Corps de rafraîchissement d'un jeton encore valide. */
function corpsRafraichissement(rafraichissement: Rafraichissement): URLSearchParams {
  const corps = new URLSearchParams();
  corps.set('grant_type', 'refresh_token');
  corps.set('refresh_token', rafraichissement.refreshToken);
  corps.set('client_id', rafraichissement.clientId);
  return corps;
}

/** Demande un jeton à `/v1/token` avec le corps fourni. */
async function demanderJeton(
  base: string,
  corps: URLSearchParams,
  recuperer: RecuperateurOAuth,
): Promise<JetonMCP> {
  const reponse = await recuperer(`${base}/v1/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: corps.toString(),
  });
  const texte = await reponse.text();
  if (!reponse.ok) {
    throw new Error(`Échange du jeton refusé (HTTP ${reponse.status}) : ${texte.slice(0, 200)}`);
  }
  return JSON.parse(texte) as JetonMCP;
}

/** Échange le code d'autorisation (issu du consentement) contre un jeton. */
export async function echangerCode(
  base: string,
  echange: EchangeCode,
  recuperer: RecuperateurOAuth = recuperateurNatif,
): Promise<JetonMCP> {
  return demanderJeton(base, corpsEchange(echange), recuperer);
}

/** Rafraîchit un jeton MCP encore valide. */
export async function rafraichir(
  base: string,
  rafraichissement: Rafraichissement,
  recuperer: RecuperateurOAuth = recuperateurNatif,
): Promise<JetonMCP> {
  return demanderJeton(base, corpsRafraichissement(rafraichissement), recuperer);
}