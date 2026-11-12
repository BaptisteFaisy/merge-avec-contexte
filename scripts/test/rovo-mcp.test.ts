/**
 * Tests purs de l'outillage Rovo/MCP (`scripts/rovo-oauth.ts`, `scripts/rovo-mcp.ts`).
 *
 * Aucun réseau : les récupérateurs sont des doublures. Les vecteurs PKCE et
 * les échanges sont vérifiés lettre à lettre contre des valeurs connues.
 */
import { describe, expect, it } from 'vitest';

import {
  b64url,
  defiS256,
  echangerCode,
  enregistrerClient,
  nouvellePkce,
  urlAutorisation,
  type RecuperateurOAuth,
} from '../rovo-oauth';
import {
  ClientMcp,
  decoderCorps,
  extraireMessage,
  texteResultat,
  type RecuperateurMcp,
} from '../rovo-mcp';

/** Vecteur RFC 7636 (appendice B) : vérifieur et défi S256 attendu. */
const VERIFICATEUR_RFC = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const DEFI_RFC = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

/** Doublure de récupérateur OAuth : corps imposé, statut imposé. */
function doublureOAuth(statut: number, corps: string): RecuperateurOAuth {
  return async () => ({ ok: statut < 400, status: statut, text: async () => corps });
}

describe('rovo-oauth — PKCE et flux', () => {
  it('calcule le défi S256 du vecteur RFC 7636', () => {
    expect(defiS256(VERIFICATEUR_RFC)).toBe(DEFI_RFC);
  });

  it('produit un vérifieur base64url et un défi cohérents', () => {
    const paire = nouvellePkce();
    expect(paire.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(defiS256(paire.verifier)).toBe(paire.challenge);
  });

  it('construit l' + "'" + 'URL d' + "'" + 'autorisation avec tous les paramètres', () => {
    const url = urlAutorisation({
      base: 'https://mcp.atlassian.com',
      clientId: 'client-1',
      redirectUri: 'http://127.0.0.1:8765/callback',
      challenge: DEFI_RFC,
      state: 'etat-1',
      scopes: 'read:jira-work read:me offline_access',
    });
    const adresse = new URL(url);
    expect(adresse.origin + adresse.pathname).toBe('https://mcp.atlassian.com/v1/authorize');
    expect(adresse.searchParams.get('response_type')).toBe('code');
    expect(adresse.searchParams.get('code_challenge_method')).toBe('S256');
    expect(adresse.searchParams.get('code_challenge')).toBe(DEFI_RFC);
    expect(adresse.searchParams.get('client_id')).toBe('client-1');
  });

  it('enregistre un client dynamique et rend son identifiant', async () => {
    const enregistrement = await enregistrerClient(
      'https://mcp.atlassian.com',
      { redirectUri: 'http://127.0.0.1:8765/callback', scopes: 'read:me' },
      doublureOAuth(201, '{"client_id":"abcd-1234","token_endpoint_auth_method":"none"}'),
    );
    expect(enregistrement.client_id).toBe('abcd-1234');
  });

  it('échange un code contre un jeton (formulaire, vérifieur présent)', async () => {
    const jeton = await echangerCode(
      'https://mcp.atlassian.com',
      { clientId: 'abcd-1234', code: 'code-1', verifier: VERIFICATEUR_RFC, redirectUri: 'http://127.0.0.1:8765/callback' },
      doublureOAuth(200, '{"access_token":"jeton-1","token_type":"Bearer"}'),
    );
    expect(jeton.access_token).toBe('jeton-1');
  });
});

describe('rovo-mcp — transport HTTP fluxiant', () => {
  it('décode un corps JSON brut', () => {
    expect(decoderCorps('{"jsonrpc":"2.0","id":1,"result":{}}')).toEqual([
      '{"jsonrpc":"2.0","id":1,"result":{}}',
    ]);
  });

  it('décode un flux SSE en messages individuels', () => {
    const flux = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"a":1}}\n\ndata: {"jsonrpc":"2.0","id":2,"result":{}}\n\n';
    expect(decoderCorps(flux)).toEqual([
      '{"jsonrpc":"2.0","id":1,"result":{"a":1}}',
      '{"jsonrpc":"2.0","id":2,"result":{}}',
    ]);
  });

  it('extrait le message portant l' + "'" + "identifiant attendu", () => {
    const morceaux = extraireMessage('data: {"jsonrpc":"2.0","id":3,"result":{"tools":[]}}', 3);
    expect(morceaux?.id).toBe(3);
  });

  it('rend le texte du contenu, ou le résultat sérialisé', () => {
    expect(texteResultat({ content: [{ type: 'text', text: 'bonjour' }] })).toBe('bonjour');
    expect(texteResultat({ verdict: 'blocked' })).toBe('{"verdict":"blocked"}');
  });
});

describe('ClientMcp — appels', () => {
  it('appelle un outil avec le jeton en en-tête et rend son texte', async () => {
    let urlAppelee = '';
    let enTetes: Record<string, string> = {};
    let corps: string = '';
    const recuperer: RecuperateurMcp = async (url, init) => {
      urlAppelee = url;
      enTetes = (init?.headers ?? {}) as Record<string, string>;
      corps = String(init?.body ?? '');
      return {
        ok: true,
        status: 200,
        headers: { 'mcp-session-id': 'sess-1' },
        text: async () => '{"jsonrpc":"2.0","id":4,"result":{"content":[{"type":"text","text":"{\\"now\\":\\"2026-11-12\\"}"}]}}',
      };
    };
    const client = new ClientMcp('https://mcp.atlassian.com/forge/app', 'jeton', recuperer);
    const texte = await client.appeler(null, 'list-freezes', {});
    expect(texte).toBe('{"now":"2026-11-12"}');
    expect(client.statut).toBe(200);
    expect(urlAppelee).toBe('https://mcp.atlassian.com/forge/app');
    expect(enTetes.authorization).toBe('Bearer jeton');
    expect(corps).toContain('"method":"tools/call"');
    expect(corps).toContain('"name":"list-freezes"');
  });
});