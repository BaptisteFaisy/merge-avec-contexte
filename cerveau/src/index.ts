/**
 * Point d'entrée de l'app Forge Jira « Cerveau ».
 *
 * Porte d'entrée unique du Capteur : le web trigger `pont-bitbucket`, signé
 * (HMAC-SHA256, horodatage, nonce). Autour de lui : les pages Jira, les cinq
 * actions (aussi exposées en MCP via `rovo:mcp`), le déclencheur d'événements
 * qui tient le cache à jour, et les migrations de schéma.
 */
import type { BridgeEnvelope } from './shared';

/** Requête reçue par un web trigger Forge. */
export interface WebTriggerRequest {
  body: string;
  headers: Record<string, string[]>;
  queryParameters: Record<string, string[]>;
}

/** Réponse d'un web trigger Forge (`response: { type: dynamic }`). */
export interface WebTriggerResponse {
  statusCode: number;
  headers?: Record<string, string[]>;
  body: string;
}

/** Contexte d'extension reçu par les modules d'interface Jira. */
export interface JiraExtensionContext {
  type: string;
  location: string;
  project?: { id: string; key: string };
  issue?: { id: string; key: string };
  extension?: { project?: { id: string; key: string } };
}

function nonImplemente(nom: string): never {
  throw new Error(`${nom} : implémenté par le lot correspondant (voir docs/CONVENTIONS.md)`);
}

/** Pont signé : vérifie la signature, route, évalue, répond. */
export async function gererPont(_request: WebTriggerRequest): Promise<WebTriggerResponse> {
  return nonImplemente('gererPont');
}

/** Réglages du projet : règles, gels, correspondance dépôt → service, jumelage. */
export async function resolverReglages(_context: JiraExtensionContext): Promise<unknown> {
  return nonImplemente('resolverReglages');
}

/** Encart sur le ticket : PR connues, dernière évaluation, dérogations. */
export async function resolverEncart(_context: JiraExtensionContext): Promise<unknown> {
  return nonImplemente('resolverEncart');
}

/** Console de test et journal : simuler une PR, lire les évaluations. */
export async function resolverConsole(_context: JiraExtensionContext): Promise<unknown> {
  return nonImplemente('resolverConsole');
}

/** Action `evaluate-merge` : évaluation à blanc pour un ticket. */
export async function evaluateMerge(_payload: unknown): Promise<unknown> {
  return nonImplemente('evaluateMerge');
}

/** Action `explain-block` : dernière évaluation réelle des PR du ticket. */
export async function explainBlock(_payload: unknown): Promise<unknown> {
  return nonImplemente('explainBlock');
}

/** Action `list-freezes` : gels en cours et à venir. */
export async function listFreezes(_payload: unknown): Promise<unknown> {
  return nonImplemente('listFreezes');
}

/** Action `list-waivers` : dérogations en cours d'un ticket. */
export async function listWaivers(_payload: unknown): Promise<unknown> {
  return nonImplemente('listWaivers');
}

/** Action `request-waiver` : demande de dérogation tracée. */
export async function requestWaiver(_payload: unknown): Promise<unknown> {
  return nonImplemente('requestWaiver');
}

/** Événement Jira : invalide ou rafraîchit l'entrée de cache du ticket. */
export async function surTicketModifie(_event: unknown): Promise<void> {
  nonImplemente('surTicketModifie');
}

/** Migrations de schéma (Forge SQL) : idempotentes, rejouées chaque heure. */
export async function migrerSchema(): Promise<void> {
  nonImplemente('migrerSchema');
}

/** Type exporté pour les tests de forme du pont. */
export type { BridgeEnvelope };
