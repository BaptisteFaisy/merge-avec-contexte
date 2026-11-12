/**
 * Client MCP minimal en transport « HTTP fluxiant » (streamable HTTP).
 *
 * Sert à appeler les outils d'un module `rovo:mcp` Forge, exposés par le
 * serveur `https://mcp.atlassian.com/forge/<appId>` : poignée de main
 * `initialize`, inventaire `tools/list`, puis `tools/call`. Le jeton OAuth 2.1
 * vient de `scripts/rovo-oauth.ts` et circule en en-tête `authorization`.
 *
 * Aucun réseau dans les tests : la fonction de récupération est injectée.
 */

/** Réponse HTTP minimale avec les en-têtes (session et type de contenu). */
export interface ReponseHttpMcp {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  text(): Promise<string>;
}

/** Fonction de récupération injectée pour les tests. */
export type RecuperateurMcp = (url: string, init?: RequestInit) => Promise<ReponseHttpMcp>;

/** `fetch` natif, repli de production. */
export const recuperateurNatif: RecuperateurMcp = async (url, init) => {
  const reponse = await fetch(url, init);
  const headers: Record<string, string> = {};
  reponse.headers.forEach((valeur, cle) => {
    headers[cle.toLowerCase()] = valeur;
  });
  return { ok: reponse.ok, status: reponse.status, headers, text: () => reponse.text() };
};

/** Message JSON-RPC 2.0 tel que le serveur MCP le rend. */
export interface MessageMcp {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
}

/** Outil MCP rendu par `tools/list`. */
export interface OutilMcp {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/** Résultat global du client (session, serveur, outils). */
export interface ServeurMcp {
  sessionId: string | null;
  serverInfo?: { name?: string; version?: string };
  tools?: OutilMcp[];
}

/** Entrées d'un objet outil, transmises telles quelles à `tools/call`. */
export type EntreesOutil = Record<string, unknown>;

const VERSION_PROTOCOLE = '2025-06-18';

/** Décode un corps « streamable HTTP » : JSON brut ou flux SSE. */
export function decoderCorps(contenu: string): string[] {
  const delimite = contenu.trim();
  if (delimite.startsWith('{') || delimite.startsWith('[')) return [delimite];
  const lignes: string[] = [];
  for (const ligne of contenu.split('\n')) {
    if (ligne.startsWith('data:')) lignes.push(ligne.slice(5).trim());
  }
  return lignes;
}

/** Extrait le message JSON-RPC portant l'identifiant attendu (SSE ou JSON). */
export function extraireMessage(contenu: string, id: number): MessageMcp | undefined {
  for (const morceau of decoderCorps(contenu)) {
    if (!morceau) continue;
    const message = JSON.parse(morceau) as MessageMcp;
    if (message.id === id) return message;
  }
  return undefined;
}

/** Texte d'un contenu de résultat MCP, ou le résultat brut sérialisé. */
export function texteResultat(result: unknown): string {
  const contenu = (result as { content?: Array<{ type?: string; text?: string }> } | undefined)?.content;
  if (Array.isArray(contenu) && contenu.length > 0 && typeof contenu[0].text === 'string') {
    return contenu[0].text;
  }
  return JSON.stringify(result);
}

/** Client MCP en HTTP fluxiant, token en en-tête, récupération injectée. */
export class ClientMcp {
  /** Statut HTTP du dernier appel (`envoyer`). */
  private dernierStatut = 0;

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly recuperer: RecuperateurMcp = recuperateurNatif,
  ) {}

  /** Statut HTTP du dernier échange MCP. */
  get statut(): number {
    return this.dernierStatut;
  }

  /** Envoie un message JSON-RPC et rend la réponse (id, session, statut). */
  private async envoyer(
    methode: string,
    params: unknown,
    id: number,
    sessionId: string | null,
  ): Promise<{ message: MessageMcp | undefined; statut: number; session: string | null }> {
    const entetes: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${this.token}`,
      'mcp-protocol-version': VERSION_PROTOCOLE,
    };
    if (sessionId) entetes['mcp-session-id'] = sessionId;
    const reponse = await this.recuperer(this.url, {
      method: 'POST',
      headers: entetes,
      body: JSON.stringify({ jsonrpc: '2.0', id, method: methode, params }),
    });
    const corps = await reponse.text();
    if (!reponse.ok) {
      throw new Error(`MCP ${methode} refusé (HTTP ${reponse.status}) : ${corps.slice(0, 200)}`);
    }
    this.dernierStatut = reponse.status;
    return {
      message: extraireMessage(corps, id),
      statut: reponse.status,
      session: this.session(reponse.headers),
    };
  }

  /** Identifiant de session renvoyé par le serveur, s'il en ouvre une. */
  private session(headers: Record<string, string>): string | null {
    return headers['mcp-session-id'] ?? null;
  }

  /** Poignée de main MCP : `initialize` puis `notifications/initialized`. */
  async initialiser(): Promise<ServeurMcp> {
    const premier = await this.envoyer(
      'initialize',
      {
        protocolVersion: VERSION_PROTOCOLE,
        capabilities: {},
        clientInfo: { name: 'merge-avec-contexte-rovo', version: '1.0.0' },
      },
      1,
      null,
    );
    const sessionId = premier.session;
    const resultat = (premier.message?.result ?? {}) as {
      serverInfo?: { name?: string; version?: string };
    };
    await this.envoyer('notifications/initialized', undefined, 2, sessionId);
    return { sessionId, serverInfo: resultat.serverInfo };
  }

  /** Inventaire des outils exposés par le module `rovo:mcp`. */
  async listerOutils(sessionId: string | null): Promise<OutilMcp[]> {
    const reponse = await this.envoyer('tools/list', undefined, 3, sessionId);
    const resultat = (reponse.message?.result ?? {}) as { tools?: OutilMcp[] };
    return resultat.tools ?? [];
  }

  /** Appelle un outil MCP et rend le texte de son résultat. */
  async appeler(sessionId: string | null, nom: string, entrees: EntreesOutil): Promise<string> {
    const reponse = await this.envoyer(
      'tools/call',
      { name: nom, arguments: entrees ?? {} },
      4,
      sessionId,
    );
    if (reponse.message?.error) {
      throw new Error(`L'outil ${nom} a échoué : ${reponse.message.error.message}`);
    }
    return texteResultat(reponse.message?.result);
  }
}