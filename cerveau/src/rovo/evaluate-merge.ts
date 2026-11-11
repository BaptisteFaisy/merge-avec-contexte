/**
 * Action `evaluate-merge` (§11) : évaluation à blanc des règles de contexte
 * pour un ticket, sans fusion réelle.
 *
 * C'est l'outil clé des agents de code (§7.4) : il rend exactement la forme
 * que montre la carte de PR — verdict, raisons, message déjà rédigé — pour
 * qu'un agent s'arrête avant de tenter la fusion (recette §18-8).
 *
 * Une clé de ticket absente lève `ActionInputError` : la forme de sortie est
 * fixée par la carte, une entrée invalide ne peut pas s'y exprimer sans
 * mentir sur le verdict.
 */
import { formatEvaluation, visibleReasons } from '../shared';
import type { Evaluation, Locale, PrContext, Verdict } from '../shared';
import { cleTicket, raisonSortie, texte } from './deps';
import type { EvaluationInput, RaisonSortie, RovoDeps } from './deps';

/** Sortie stable de l'action : celle de la carte de PR, sérialisable telle quelle. */
export interface EvaluateMergeOutput {
  verdict: Verdict;
  allowed: boolean;
  message: string;
  reasons: RaisonSortie[];
  evaluatedAt: string;
  durationMs: number;
}

/** Branche visée quand l'appelant n'en donne pas. */
export const BRANCHE_DEFAUT = 'main';

/** PR simulée : le minimum qu'une règle lit, jamais un contenu de code. */
function prSimulee(targetBranch: string, repository: string | null): PrContext {
  return {
    workspaceUuid: '',
    repositoryUuid: repository ?? '',
    ...(repository === null ? {} : { repositorySlug: repository }),
    pullRequestId: 0,
    title: '',
    sourceBranch: '',
    targetBranch,
    commitMessages: [],
    changedPaths: [],
    reviewers: [],
    trigger: 'on-merge',
  };
}

/** Contexte complet d'une évaluation : tout est chargé ici, rien par les règles. */
async function entreeEvaluation(
  deps: RovoDeps,
  issueKey: string,
  targetBranch: string,
  repository: string | null,
): Promise<EvaluationInput> {
  const now = deps.clock.now();
  const [contexte, freezes, waivers] = await Promise.all([
    deps.context.load(issueKey, repository),
    deps.freezes.active(now),
    deps.waivers.listByIssue(issueKey),
  ]);
  return {
    pr: prSimulee(targetBranch, repository),
    issues: contexte.issues,
    freezes,
    incidents: contexte.incidents,
    waivers,
    ...(contexte.service === undefined ? {} : { service: contexte.service }),
    configs: contexte.configs,
    now,
    locale: deps.locale,
  };
}

/** Autorisation réelle : un verdict non concluant suit la politique de repli (§13.5). */
export function estAutorise(evaluation: Evaluation): boolean {
  if (evaluation.verdict === 'allowed') return true;
  if (evaluation.verdict === 'inconclusive') return evaluation.fallback === 'open';
  return false;
}

/** Message lisible d'une entrée refusée, à la forme de la carte. */
function sortieRefus(message: string, now: string): EvaluateMergeOutput {
  return { verdict: 'inconclusive', allowed: false, message, reasons: [], evaluatedAt: now, durationMs: 0 };
}

/** Mise à la forme publique : verdict, message rédigé, raisons visibles. */
function sortie(evaluation: Evaluation, locale: Locale): EvaluateMergeOutput {
  return {
    verdict: evaluation.verdict,
    allowed: estAutorise(evaluation),
    message: formatEvaluation(evaluation, { locale }),
    reasons: visibleReasons(evaluation).map(raisonSortie),
    evaluatedAt: evaluation.evaluatedAt,
    durationMs: evaluation.durationMs,
  };
}

/** Action `evaluate-merge` : entrées `issueKey`, `targetBranch?`, `repository?`. */
export async function runEvaluateMerge(
  deps: RovoDeps,
  payload: Record<string, unknown>,
): Promise<EvaluateMergeOutput> {
  const locale = deps.locale;
  let cle: string;
  try {
    cle = cleTicket(payload.issueKey, locale);
  } catch (erreur) {
    if (!(erreur instanceof Error)) throw erreur;
    deps.logger.warn('evaluate-merge refusé', { field: 'issueKey' });
    return sortieRefus(erreur.message, deps.clock.now());
  }
  const cible = texte(payload.targetBranch) || BRANCHE_DEFAUT;
  const depot = texte(payload.repository) || null;
  const evaluation = await deps.evaluation(await entreeEvaluation(deps, cle, cible, depot));
  deps.logger.info('evaluate-merge', { issueKey: cle, targetBranch: cible, verdict: evaluation.verdict });
  return sortie(evaluation, locale);
}
