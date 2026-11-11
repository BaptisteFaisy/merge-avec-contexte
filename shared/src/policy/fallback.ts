/**
 * Politique de repli (§13.5). Si le Cerveau est injoignable ou trop lent,
 * l'administrateur a choisi d'avance : ouvert (le contrôle passe avec
 * « contexte indisponible ») ou fermé (le contrôle échoue). Chaque repli est
 * journalisé, jamais silencieux.
 */
import type { Evaluation, FallbackCause, FallbackPolicy, Trigger } from '../types';

/** Délai au-delà duquel on considère le Cerveau injoignable (MC-11 : 5 s). */
export const DEFAULT_BRIDGE_TIMEOUT_MS = 4000;

export interface FallbackContext {
  policy: FallbackPolicy;
  cause: FallbackCause;
  trigger: Trigger;
  now: string;
  issueKeys?: string[];
  durationMs?: number;
}

/** Évaluation de repli : non concluante, avec la politique appliquée. */
export function fallbackEvaluation(ctx: FallbackContext): Evaluation {
  return {
    verdict: 'inconclusive',
    reasons: [],
    issueKeys: ctx.issueKeys ?? [],
    trigger: ctx.trigger,
    evaluatedAt: ctx.now,
    durationMs: ctx.durationMs ?? 0,
    fallback: ctx.policy,
    cause: ctx.cause,
  };
}

/** Vrai si la fusion reste possible malgré le repli. */
export function fallbackAllows(evaluation: Evaluation): boolean {
  return evaluation.verdict === 'inconclusive' && evaluation.fallback !== 'closed';
}
