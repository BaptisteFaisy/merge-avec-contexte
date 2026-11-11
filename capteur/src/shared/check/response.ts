/**
 * Réponse attendue par le module `bitbucket:mergeCheck` : `success` (booléen)
 * et `message` (texte). Une exception levée côté Forge vaut échec, donc ce
 * module ne lève jamais : un verdict non concluant suit la politique de repli.
 */
import { formatEvaluation, type FormatOptions } from '../message/format';
import type { Evaluation } from '../types';

export interface MergeCheckResponse {
  success: boolean;
  message: string;
}

/** Vrai si la fusion peut passer : autorisé, ou non concluant en repli ouvert. */
export function isMergeAllowed(evaluation: Evaluation): boolean {
  if (evaluation.verdict === 'allowed') return true;
  return evaluation.verdict === 'inconclusive' && evaluation.fallback !== 'closed';
}

/** Construit la réponse Bitbucket d'une évaluation. */
export function toMergeCheckResponse(evaluation: Evaluation, options: FormatOptions = {}): MergeCheckResponse {
  return {
    success: isMergeAllowed(evaluation),
    message: formatEvaluation(evaluation, options),
  };
}
