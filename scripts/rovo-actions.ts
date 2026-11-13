#!/usr/bin/env -S npx vite-node --
/**
 * Appel réel des outils MCP du Cerveau (`rovo:mcp`) sur le site de démo.
 *
 * Le module `rovo:mcp` de l'app expose ses six actions comme outils au serveur
 * `https://mcp.atlassian.com/forge/<appId>`. Ce script les exerce **pour de
 * vrai** : il obtient un jeton OAuth 2.1 (consentement dans le navigateur, une
 * fois), liste les outils, puis appelle les cinq actions de lecture (jamais
 * `request-waiver`, qui écrit et notifie — voir `docs/FORGE-API-NOTES.md` §7).
 *
 * Usage :
 *   # Premier passage : ouvre le navigateur pour le consentement OAuth, une fois.
 *   npx vite-node scripts/rovo-actions.ts
 *
 *   # Rejeu sans navigateur : jeton déjà en main (posé par le flux ci-dessus).
 *   MAC_ROVO_TOKEN=<jeton> npx vite-node scripts/rovo-actions.ts
 *
 *   # Inventaire seulement.
 *   MAC_ROVO_TOKEN=<jeton> npx vite-node scripts/rovo-actions.ts --liste
 *
 * Variables : MAC_ROVO_APP (UUID de l'app, défaut celui du dépôt),
 * MAC_ROVO_ISSUE (clé du ticket, défaut MAC-2), MAC_ROVO_PORT (redirection,
 * défaut 8765), MAC_ROVO_TOKEN (jeton déjà obtenu).
 *
 * Sortie : 0 si l'inventaire et tous les outils répondent, 1 sinon.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { exec } from 'node:child_process';

import {
  BASE_MCP,
  PORTEES_DEFAUT,
  REDIRECT_PAR_DEFAUT,
  echangerCode,
  enregistrerClient,
  nouvellePkce,
  nouvelEtat,
  urlAutorisation,
  type JetonMCP,
} from './rovo-oauth';
import { ClientMcp, type EntreesOutil } from './rovo-mcp';

/** UUID de l'app (partie après `ari:cloud:ecosystem::app/`), `cerveau/manifest.yml`. */
const APP_PAR_DEFAUT = '8361630d-9d57-4099-9c2b-5201bb00648d';

/** Ticket de démonstration réel (projet `MAC`, cf. `docs/PREUVE-REELLE.md`). */
const TICKET_DEFAUT = 'MAC-2';

/** Les cinq actions de lecture, avec leurs entrées réelles. */
const OUTILS_LECTURE: Array<{ nom: string; entrees: EntreesOutil }> = [
  { nom: 'list-freezes', entrees: {} },
  { nom: 'list-approvers', entrees: { issueKey: TICKET_DEFAUT } },
  { nom: 'list-waivers', entrees: { issueKey: TICKET_DEFAUT } },
  { nom: 'explain-block', entrees: { issueKey: TICKET_DEFAUT } },
  { nom: 'evaluate-merge', entrees: { issueKey: TICKET_DEFAUT, targetBranch: 'main' } },
];

/** Appel système détaché : ouvre l'URL dans le navigateur par défaut. */
function ouvrirNavigateur(url: string): void {
  exec(`xdg-open '${url.replace(/'/g, "'\\''")}'`, () => {});
}

/** Lance un serveur local qui capte `GET /callback?code=…&state=…`. */
function serveurConsentement(port: number, etat: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const serveur = createServer((requete: IncomingMessage, reponse: ServerResponse) => {
      const adresse = new URL(requete.url ?? '/', REDIRECT_PAR_DEFAUT);
      if (adresse.pathname !== '/callback') {
        reponse.writeHead(404).end();
        return;
      }
      const code = adresse.searchParams.get('code');
      const state = adresse.searchParams.get('state');
      reponse.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      if (!code || state !== etat) {
        reponse.end("Consentement rejeté ou état invalide : fermez l'onglet et relancez.\n");
        serveur.close();
        reject(new Error('Consentement rejeté ou état CSRF invalide.'));
        return;
      }
      reponse.end('Autorisation obtenue : vous pouvez fermer l' + "'" + 'onglet et revenir au terminal.\n');
      serveur.close();
      resolve(code);
    });
    serveur.listen(port, '127.0.0.1');
    serveur.on('error', reject);
  });
}

/** Obtient un jeton MCP : en-tête d'environnement ou flux OAuth complet. */
async function obtenirJeton(env: Record<string, string | undefined>): Promise<JetonMCP> {
  const deja = env.MAC_ROVO_TOKEN?.trim();
  if (deja) return { access_token: deja, token_type: 'Bearer' };

  const port = Number(env.MAC_ROVO_PORT?.trim() || 8765);
  const redirectUri = `http://127.0.0.1:${port}/callback`;
  const { verifier, challenge } = nouvellePkce();
  const etat = nouvelEtat();
  const client = await enregistrerClient(BASE_MCP, { redirectUri, scopes: PORTEES_DEFAUT });
  const autorisation = urlAutorisation({
    base: BASE_MCP,
    clientId: client.client_id,
    redirectUri,
    challenge,
    state: etat,
    scopes: PORTEES_DEFAUT,
  });
  console.error(`Consentement requis — ouvrez dans le navigateur (ou cliquez) :\n${autorisation}\n`);
  console.error("Sélectionnez le site « one-atlas-cndz.atlassian.net », puis « Allow ».\n");
  ouvrirNavigateur(autorisation);
  const code = await serveurConsentement(port, etat);
  return echangerCode(BASE_MCP, { clientId: client.client_id, code, verifier, redirectUri });
}

/** Rend un résumé d'une ligne d'un résultat d'outil (tronqué). */
function resumer(nom: string, statut: number, texte: string): void {
  const plat = texte.replace(/\s+/g, ' ').slice(0, 160);
  console.log(`${statut === 200 ? 'OK ' : 'ERR'} ${nom} (HTTP ${statut}) : ${plat}`);
}

/** Corps principal : jeton, inventaire, appels de lecture. Retourne le décompte d'échecs. */
async function main(): Promise<number> {
  const env = process.env as Record<string, string | undefined>;
  const app = env.MAC_ROVO_APP?.trim() || APP_PAR_DEFAUT;
  const ticket = env.MAC_ROVO_ISSUE?.trim() || TICKET_DEFAUT;
  const listeSeule = process.argv.includes('--liste');
  const url = `${BASE_MCP}/forge/${app}`;
  const entreesTicket = (entrees: EntreesOutil): EntreesOutil =>
    'issueKey' in entrees ? { ...entrees, issueKey: ticket } : entrees;

  const jeton = await obtenirJeton(env);
  const client = new ClientMcp(url, jeton.access_token);

  const { sessionId, serverInfo } = await client.initialiser();
  console.log(`MCP ${serverInfo?.name ?? ''} ${serverInfo?.version ?? ''} — session ${sessionId ?? 'sans état'}`);

  const outils = await client.listerOutils(sessionId);
  console.log(`Outils exposés (${outils.length}) : ${outils.map((outil) => outil.name).join(', ') || 'aucun'}`);
  if (listeSeule) return outils.length > 0 ? 0 : 1;

  let echecs = 0;
  for (const outil of OUTILS_LECTURE) {
    try {
      const texte = await client.appeler(sessionId, outil.nom, entreesTicket(outil.entrees));
      resumer(outil.nom, client.statut, texte);
      if (client.statut >= 400) echecs += 1;
    } catch (erreur) {
      echecs += 1;
      resumer(outil.nom, client.statut, `échec : ${(erreur as Error).message}`);
    }
  }
  return echecs;
}

// Exécution directe (`vite-node`) ; l'import par un autre module reste inerte
// car ce fichier n'exporte rien.
main()
  .then((echecs) => process.exit(echecs === 0 ? 0 : 1))
  .catch((erreur) => {
    console.error(`Erreur : ${(erreur as Error).message}`);
    process.exit(2);
  });