/**
 * Entrée d'évaluation : le pont rassemble le contexte, le moteur applique les
 * règles (§13.2).
 *
 * Cette fonction ne fait qu'une chose : lire le jumelage, puis demander au
 * site les règles, la correspondance dépôt → service et les gels utiles, et
 * demander les dérogations en vigueur. Elle ne lit pas l'heure : tout vient
 * de `deps.clock()`.
 */
import {
  activeFreezes,
  extractIssueKeys,
  waiversForPr,
  type EvaluatePayload,
  type Freeze,
  type Reviewer,
  type Waiver,
} from '../shared';
import type { BridgeDeps, EvaluationInput } from './deps';
import { erreurPont } from './errors';

/** États de relecteur reconnus par le contrat ; le reste vaut « neutre ». */
const ETATS: Reviewer['state'][] = ['approved', 'changes_requested', 'none'];

/** PR décrite par les métadonnées envoyées par le Capteur. */
function contextePr(payload: EvaluatePayload): EvaluationInput['pr'] {
  return {
    workspaceUuid: payload.workspaceUuid,
    repositoryUuid: payload.repositoryUuid,
    repositorySlug: payload.repositorySlug,
    pullRequestId: payload.pullRequestId,
    title: '',
    sourceBranch: payload.sourceBranch,
    targetBranch: payload.targetBranch,
    commitMessages: payload.mergeCommitMessage ? [payload.mergeCommitMessage] : [],
    changedPaths: payload.changedPaths ?? [],
    reviewers: (payload.reviewers ?? []).map((reviewer) => ({
      accountId: reviewer.accountId,
      state: ETATS.includes(reviewer.state as Reviewer['state'])
        ? (reviewer.state as Reviewer['state'])
        : 'none',
    })),
    trigger: payload.trigger,
  };
}

/** Gels utiles : ceux qui couvrent la branche cible ou le service. */
async function gelesUtiles(
  deps: BridgeDeps,
  siteUrl: string,
  payload: EvaluatePayload,
  service: string | undefined,
): Promise<Freeze[]> {
  const gels = await deps.context.freezes(siteUrl);
  return activeFreezes(gels, { targetBranch: payload.targetBranch, service, now: deps.clock() });
}

/**
 * Dérogations utiles : celles qui portent sur cette PR, et celles rattachées
 * aux tickets qu'elle cite (demandées depuis Jira ou Rovo sans PR connue,
 * enregistrées avec `prId: 0` et `repositoryUuid: ''`). Les secondes sont
 * rattachées à la PR par `waiversForPr` : le moteur filtre sur la PR.
 */
async function derogationsUtiles(
  deps: BridgeDeps,
  payload: EvaluatePayload,
  issueKeys: string[],
): Promise<Waiver[]> {
  const [parPr, toutes] = await Promise.all([
    deps.waivers.lister({ prId: payload.pullRequestId, repositoryUuid: payload.repositoryUuid }),
    deps.waivers.lister({}),
  ]);
  return waiversForPr([...toutes, ...parPr], {
    prId: payload.pullRequestId,
    repositoryUuid: payload.repositoryUuid,
    issueKeys,
  });
}

/**
 * Construit l'entrée d'évaluation d'une demande signée.
 *
 * Si l'espace de travail n'est pas jumelé, la fonction échoue avec l'erreur
 * `unpaired` : sans jumelage, le Cerveau ne sait ni quel site lire, ni quel
 * secret accepter.
 */
export async function versEvaluationInput(
  payload: EvaluatePayload,
  deps: BridgeDeps,
): Promise<EvaluationInput> {
  const jumelage = await deps.pairing.pairingForWorkspace(payload.workspaceUuid);
  if (!jumelage) {
    throw erreurPont('unpaired', "Cet espace de travail n'est pas jumelé.");
  }
  const now = deps.clock();
  const issueKeys = clesTickets(payload);
  const service = await deps.context.serviceForRepository(jumelage.siteUrl, payload.repositoryUuid);
  const [configs, freezes, waivers] = await Promise.all([
    deps.context.rules(jumelage.siteUrl),
    gelesUtiles(deps, jumelage.siteUrl, payload, service),
    derogationsUtiles(deps, payload, issueKeys),
  ]);
  const fallbackPolicy = await deps.pairing.fallbackPolicy(payload.workspaceUuid);
  return {
    pr: contextePr(payload),
    issueKeys,
    siteUrl: jumelage.siteUrl,
    freezes,
    waivers,
    service,
    configs,
    now,
    locale: deps.config.locale,
    fallbackPolicy,
  };
}

/**
 * Clés de tickets de la PR : celles envoyées par le Capteur, ou, à défaut,
 * celles reconnues dans le nom de la branche source.
 */
function clesTickets(payload: EvaluatePayload): string[] {
  if (payload.issueKeys.length > 0) return payload.issueKeys;
  return extractIssueKeys({
    sourceBranch: payload.sourceBranch,
    title: '',
    commitMessages: payload.mergeCommitMessage ? [payload.mergeCommitMessage] : [],
  });
}
