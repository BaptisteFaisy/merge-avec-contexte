/**
 * Table de routage du pont (§13.3).
 *
 * Six routes : `health`, `pair`, `evaluate`, `card`, `waiver.request`,
 * `waiver.decide`. Chaque gestionnaire rend une réponse JSON ; le handler
 * ne fait qu'y renvoyer. Une route inconnue est traitée avant tout routage.
 */
import {
  formatEvaluation,
  isEvaluatePayload,
  isPairPayload,
  isWaiverDecisionPayload,
  isWaiverRequestPayload,
  type BridgeRoute,
  type Evaluation,
  type Waiver,
} from '../shared';
import type { BridgeDeps, EvaluationInput } from './deps';
import { erreurPont, reponseJson, type BridgeResponse } from './errors';
import { versEvaluationInput } from './evaluate-input';
import { jumeler, messageRefus } from './pairing';

/** Gestionnaire d'une route : la charge utile et les ports du pont. */
export type RouteHandler = (payload: unknown, deps: BridgeDeps) => Promise<BridgeResponse>;

/** Détail rendu par la route `card` : tout ce que la carte affiche. */
interface CardDetail {
  verdict: Evaluation['verdict'];
  message: string;
  reasons: Evaluation['reasons'];
  issueKeys: string[];
  evaluatedAt: string;
  durationMs: number;
  observedOnly?: boolean;
  service?: string;
  siteUrl: string;
  rules: { rule: string; level: string; mode: string }[];
  waivers: Waiver[];
}

/** Vérifie la forme d'une charge utile ; sinon, 400 `bad-payload`. */
function exiger(valeur: unknown, garde: (v: unknown) => boolean, message: string): void {
  if (!garde(valeur)) throw erreurPont('bad-payload', message);
}

/** Route `health` : le pont est-il debout, et quelle version ? */
export const routeHealth: RouteHandler = async (_payload, deps) => {
  return reponseJson(200, {
    status: 'ok',
    version: deps.config.version,
    date: deps.clock(),
  });
};

/** Route `pair` : le Capteur présente le code à usage unique. */
export const routePair: RouteHandler = async (payload, deps) => {
  exiger(payload, isPairPayload, 'Code de jumelage ou espace de travail manquant.');
  const demande = payload as { code: string; workspaceUuid: string };
  const outcome = await jumeler(demande.code, demande.workspaceUuid, deps);
  if (!outcome.ok) {
    const code = outcome.reason === 'mismatch' ? 'unauthorized' : 'bad-payload';
    throw erreurPont(code, messageRefus(outcome.reason));
  }
  return reponseJson(200, outcome.result);
};

/** Construit l'entrée d'évaluation ; `unpaired` si le site n'est pas jumelé. */
async function entree(deps: BridgeDeps, payload: unknown): Promise<EvaluationInput> {
  exiger(payload, isEvaluatePayload, 'Demande d\'évaluation incomplète.');
  return versEvaluationInput(payload as Parameters<typeof versEvaluationInput>[0], deps);
}

/** Route `evaluate` : le verdict, le message, les raisons, la durée. */
export const routeEvaluate: RouteHandler = async (payload, deps) => {
  const input = await entree(deps, payload);
  const evaluation = await deps.evaluate(input);
  return reponseJson(200, {
    verdict: evaluation.verdict,
    message: formatEvaluation(evaluation, { locale: input.locale }),
    reasons: evaluation.reasons,
    issueKeys: evaluation.issueKeys,
    durationMs: evaluation.durationMs,
    evaluatedAt: evaluation.evaluatedAt,
  });
};

/** Route `card` : le détail complet affiché par la carte de PR. */
export const routeCard: RouteHandler = async (payload, deps) => {
  const input = await entree(deps, payload);
  const evaluation = await deps.evaluate(input);
  const detail: CardDetail = {
    verdict: evaluation.verdict,
    message: formatEvaluation(evaluation, { locale: input.locale, includeActions: true }),
    reasons: evaluation.reasons,
    issueKeys: evaluation.issueKeys,
    evaluatedAt: evaluation.evaluatedAt,
    durationMs: evaluation.durationMs,
    observedOnly: evaluation.observedOnly,
    service: input.service,
    siteUrl: input.siteUrl,
    rules: input.configs.map((config) => ({
      rule: config.rule,
      level: config.level,
      mode: config.mode,
    })),
    waivers: input.waivers,
  };
  return reponseJson(200, detail);
};

/** Route `waiver.request` : une dérogation demandée depuis la carte. */
export const routeWaiverRequest: RouteHandler = async (payload, deps) => {
  exiger(payload, isWaiverRequestPayload, 'Demande de dérogation incomplète.');
  const waiver = await deps.waivers.demander(payload as Parameters<typeof deps.waivers.demander>[0]);
  return reponseJson(200, waiver);
};

/** Route `waiver.decide` : une dérogation accordée ou refusée. */
export const routeWaiverDecide: RouteHandler = async (payload, deps) => {
  exiger(payload, isWaiverDecisionPayload, 'Décision de dérogation incomplète.');
  const waiver = await deps.waivers.decider(payload as Parameters<typeof deps.waivers.decider>[0]);
  return reponseJson(200, waiver);
};

/** La table de routage : une route, un gestionnaire. */
export const ROUTES: Record<BridgeRoute, RouteHandler> = {
  health: routeHealth,
  pair: routePair,
  evaluate: routeEvaluate,
  card: routeCard,
  'waiver.request': routeWaiverRequest,
  'waiver.decide': routeWaiverDecide,
};
