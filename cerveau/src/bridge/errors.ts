/**
 * Erreurs et réponses du pont : un code, un message, un statut.
 *
 * Le pont ne lève jamais vers l'appelant (§13.3) : une exception deviendrait
 * une erreur 500 opaque chez Bitbucket. Les erreurs volontaires du pont sont
 * donc des valeurs ; `BridgeError` sert à transporter une erreur intentionnelle
 * jusqu'au handler, qui la traduit en réponse JSON.
 */
import type { BridgeErrorBody, BridgeErrorCode } from '../shared';

export type { BridgeErrorBody, BridgeErrorCode };

/** En-têtes de toute réponse du pont. */
export const JSON_HEADERS: Record<string, string> = { 'content-type': 'application/json' };

/** Réponse du pont : statut, en-têtes, corps. */
export interface BridgeResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/** Erreur intentionnelle du pont : le handler la traduit en réponse. */
export class BridgeError extends Error {
  readonly code: BridgeErrorCode;
  readonly statusCode: number;

  constructor(code: BridgeErrorCode, message: string, statusCode: number) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/** Rend une réponse JSON réussie. */
export function reponseJson(statusCode: number, corps: unknown): BridgeResponse {
  return {
    statusCode,
    headers: { ...JSON_HEADERS },
    body: JSON.stringify(corps),
  };
}

/** Rend la réponse JSON correspondant à un code d'erreur. */
export function reponseErreur(code: BridgeErrorCode, message: string, statusCode: number): BridgeResponse {
  const corps: BridgeErrorBody = { error: code, message };
  return reponseJson(statusCode, corps);
}

/** Statut habituel d'un code d'erreur du pont. */
export function statutParDefaut(code: BridgeErrorCode): number {
  switch (code) {
    case 'bad-payload':
      return 400;
    case 'unauthorized':
    case 'unpaired':
      return 401;
    case 'unknown-route':
    case 'not-found':
      return 404;
    case 'internal':
      return 500;
  }
}

/** Erreur du pont à partir d'un code : message et statut par défaut. */
export function erreurPont(code: BridgeErrorCode, message: string): BridgeError {
  return new BridgeError(code, message, statutParDefaut(code));
}

/** Erreur « rien à cette adresse » : 404. */
export function erreurIntrouvable(message: string): BridgeError {
  return erreurPont('not-found', message);
}
