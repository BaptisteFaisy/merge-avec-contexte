/**
 * Table de routage du pont (§13.3).
 *
 * Sept routes : `health`, `diagnostic`, `pair`, `evaluate`, `card`,
 * `waiver.request`, `waiver.decide`. Chaque gestionnaire rend une réponse JSON ;
 * le handler ne fait qu'y renvoyer. Une route inconnue est traitée avant tout
 * routage.
 *
 * Deux routes touchent à la sécurité (item 51) : `health` est publique et ne
 * dit que le minimum utile au diagnostic (statut, version, date), `diagnostic`
 * ajoute l'état du stockage mais exige une signature — le pont est une URL
 * publique, l'état de la base ne se dévoile pas à n'importe qui.
 */
import {
  composerReglesDepot,
  EMPREINTE_CONTRAT,
  formatEvaluation,
  isEvaluatePayload,
  isPairPayload,
  isWaiverDecisionPayload,
  isWaiverRequestPayload,
  type BridgeRoute,
  type EvaluatePayload,
  type Evaluation,
  type Waiver,
  type WaiverDecisionPayload,
  type WaiverRequestPayload,
} from '../shared';
import { entreeAudit, identiteDuDecideur, journaliser, refusNonHabilite } from './audit';
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

/**
 * La base répond-elle ? Un diagnostic qui ne dit rien ne distingue pas une app
 * saine d'une app sans schéma (§16, disponibilité).
 */
async function etatStockage(deps: BridgeDeps): Promise<'ok' | 'indisponible'> {
  try {
    await deps.pairing.pairings();
    return 'ok';
  } catch {
    return 'indisponible';
  }
}

/**
 * Route `health` : publique, minimale (item 51).
 *
 * Ce que le Capteur et un curieux ont le droit de savoir : le pont est debout,
 * dans quelle version, et quelle heure il croit être. Rien sur la base.
 */
export const routeHealth: RouteHandler = async (_payload, deps) => {
  return reponseJson(200, {
    status: 'ok',
    version: deps.config.version,
    /** Empreinte du contrat partagé (audit 79) : rend visible un écart de version. */
    contrat: EMPREINTE_CONTRAT,
    date: deps.clock(),
  });
};

/** Route `diagnostic` : signée, ajoute l'état du stockage (item 51). */
export const routeDiagnostic: RouteHandler = async (_payload, deps) => {
  return reponseJson(200, {
    status: 'ok',
    version: deps.config.version,
    date: deps.clock(),
    stockage: await etatStockage(deps),
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
  const demande = payload as EvaluatePayload;
  const input = await versEvaluationInput(demande, deps);
  // MC-17 (§23) : les règles du dépôt durcissent celles de l'espace, jamais
  // l'inverse. La composition journalise tout affaiblissement ignoré.
  input.configs = composerReglesDepot(demande.depotRules, input.configs, {
    logger: deps.logger,
    repositorySlug: demande.repositorySlug,
  });
  return input;
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

/**
 * Route `waiver.request` : une dérogation demandée depuis la carte.
 *
 * Le demandeur est une identité **déclarée** (item 47) : le pont ne peut pas
 * authentifier un compte Bitbucket. L'événement est journalisé tel quel.
 */
export const routeWaiverRequest: RouteHandler = async (payload, deps) => {
  exiger(payload, isWaiverRequestPayload, 'Demande de dérogation incomplète.');
  const demande = payload as WaiverRequestPayload;
  const waiver = await deps.waivers.demander(demande);
  await journaliser(deps, entreeAudit({
    deps,
    waiver,
    decision: 'requested',
    identity: 'declared',
    workspaceUuid: demande.workspaceUuid,
  }));
  return reponseJson(200, waiver);
};

/**
 * Route `waiver.decide` : une dérogation accordée ou refusée.
 *
 * Le décideur déclaré doit être un approbateur habilité (item 48) ; sinon la
 * décision est refusée. L'identité et son statut partent au journal d'audit.
 */
export const routeWaiverDecide: RouteHandler = async (payload, deps) => {
  exiger(payload, isWaiverDecisionPayload, 'Décision de dérogation incomplète.');
  const decision = payload as WaiverDecisionPayload;
  const identite = await identiteDuDecideur(deps, decision.decidedBy);
  if (!identite.autorisee) {
    deps.logger.info('Pont : décideur non habilité', { statut: identite.statut });
    throw refusNonHabilite(identite.declaree);
  }
  const waiver = await deps.waivers.decider(decision);
  deps.logger.info('Pont : décision de dérogation', {
    waiverId: waiver.id,
    decision: decision.decision,
    identity: identite.statut,
  });
  await journaliser(deps, entreeAudit({
    deps,
    waiver,
    decision: decision.decision,
    decidedBy: decision.decidedBy,
    identity: identite.statut,
    workspaceUuid: decision.workspaceUuid,
  }));
  return reponseJson(200, waiver);
};

/** La table de routage : une route, un gestionnaire. */
export const ROUTES: Record<BridgeRoute, RouteHandler> = {
  health: routeHealth,
  diagnostic: routeDiagnostic,
  pair: routePair,
  evaluate: routeEvaluate,
  card: routeCard,
  'waiver.request': routeWaiverRequest,
  'waiver.decide': routeWaiverDecide,
};
