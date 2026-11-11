/**
 * Orchestration du merge check Bitbucket (§13.2, §13.5).
 *
 * Déroulé complet :
 * 1. Lire la PR (API Bitbucket) ;
 * 2. Extraire les clés de ticket (branche, titre, commits) ;
 * 3. Préparer l'EvaluatePayload et appeler le Cerveau via le pont signé ;
 * 4. Rendre `toMergeCheckResponse(evaluation)`.
 *
 * Sur incident : converti en `fallbackEvaluation` selon la politique
 * configurée ('open' ou 'closed'). Ne lève JAMAIS.
 */
import {
  type EvaluatePayload,
  type Evaluation,
  type FallbackCause,
  extractIssueKeys,
  fallbackEvaluation,
  toMergeCheckResponse,
  type FormatOptions,
  type MergeCheckResponse,
  type Trigger,
} from '../shared';
import { lirePr as defaultLirePr, type LecturePr } from '../bitbucket/api';
import { declencheurDepuisBitbucket, versPrContext } from '../bitbucket/pr';
import type { PRCheckEvent } from '../bitbucket/types';
import { unwrapUuid } from '../bitbucket/types';
import {
  appelerPont,
  type BridgeErrorKind,
  type BridgeResponse,
  type FetchPont,
} from '../bridge/client';
import type { PairingStore } from '../pairing/store';
import type { SettingsStore, WorkspaceSettings } from '../policy/settings';
import { DEFAUT_ENVOI_CHEMINS, DEFAUT_REPLI } from '../policy/settings';

export interface CheckDependencies {
  pairingStore: PairingStore;
  settingsStore: SettingsStore;
  lirePr?: (event: PRCheckEvent) => Promise<LecturePr>;
  fetch?: FetchPont;
  now?: () => number;
  nonceGenerator?: () => string;
  timeoutMs?: number;
  formatOptions?: FormatOptions;
}

function motifRepli(kind: BridgeErrorKind): FallbackCause {
  if (kind === 'timeout') return 'timeout';
  if (kind === 'unpaired') return 'unpaired';
  if (kind === 'unreachable') return 'unreachable';
  return 'error';
}

async function lireReglagesSurs(store: SettingsStore, wsUuid: string): Promise<WorkspaceSettings> {
  try {
    return await store.getSettings(wsUuid);
  } catch {
    return { fallbackPolicy: DEFAUT_REPLI, envoiDesChemins: DEFAUT_ENVOI_CHEMINS };
  }
}

function preparerPayload(
  event: PRCheckEvent,
  lecture: LecturePr,
  envoiChemins: boolean,
  trigger: Trigger,
  issueKeys: string[],
): EvaluatePayload {
  const prContext = versPrContext(lecture.pr, lecture.commits, lecture.diffstat, {
    workspaceUuid: unwrapUuid(event.workspace.uuid),
    repositoryUuid: unwrapUuid(event.repository.uuid),
    repositorySlug: lecture.pr.repository?.slug,
    trigger,
    envoiDesChemins: envoiChemins,
  });
  return {
    workspaceUuid: prContext.workspaceUuid,
    repositoryUuid: prContext.repositoryUuid,
    repositorySlug: prContext.repositorySlug,
    pullRequestId: prContext.pullRequestId,
    trigger: prContext.trigger,
    issueKeys,
    sourceBranch: prContext.sourceBranch,
    targetBranch: prContext.targetBranch,
    changedPaths: envoiChemins ? prContext.changedPaths : undefined,
    reviewers: prContext.reviewers.map((r) => ({ accountId: r.accountId, state: r.state })),
    mergeCommitMessage: event.mergeProperties?.commitMessage,
  };
}

interface ContexteRepli {
  politique: WorkspaceSettings['fallbackPolicy'];
  cause: FallbackCause;
  trigger: Trigger;
  cles: string[];
  t0: number;
  deps: CheckDependencies;
}

function reponseRepli(ctx: ContexteRepli): MergeCheckResponse {
  const maintenant = ctx.deps.now ? ctx.deps.now() : Date.now();
  const evaluation = fallbackEvaluation({
    policy: ctx.politique,
    cause: ctx.cause,
    trigger: ctx.trigger,
    now: new Date(maintenant).toISOString(),
    issueKeys: ctx.cles,
    durationMs: maintenant - ctx.t0,
  });
  return toMergeCheckResponse(evaluation, ctx.deps.formatOptions);
}

async function appelerCerveau(
  payload: EvaluatePayload,
  wsUuid: string,
  deps: CheckDependencies,
): Promise<BridgeResponse<Evaluation>> {
  return appelerPont<Evaluation>(
    { route: 'evaluate', payload },
    {
      workspaceUuid: wsUuid,
      store: deps.pairingStore,
      fetch: deps.fetch,
      now: deps.now,
      nonceGenerator: deps.nonceGenerator,
      timeoutMs: deps.timeoutMs,
    },
  );
}

/**
 * Exécute le contrôle complet de la PR et renvoie la réponse Bitbucket.
 *
 * Garanti sans exception levée : tout échec est absorbé en repli (§13.5).
 */
export async function executerControle(
  event: PRCheckEvent,
  deps: CheckDependencies,
): Promise<MergeCheckResponse> {
  const t0 = deps.now ? deps.now() : Date.now();
  const trigger = declencheurDepuisBitbucket(event?.trigger?.type);
  let cles: string[] = [];
  try {
    const wsUuid = event?.workspace?.uuid ?? '';
    const reglages = await lireReglagesSurs(deps.settingsStore, wsUuid);
    const lecteur = deps.lirePr ?? defaultLirePr;
    const lecture = await lecteur(event);
    cles = extractIssueKeys({
      sourceBranch: lecture.pr.source?.branch?.name ?? '',
      title: lecture.pr.title ?? '',
      commitMessages: lecture.commits.map((c) => c.message ?? ''),
    });
    const payload = preparerPayload(event, lecture, reglages.envoiDesChemins, trigger, cles);
    const pont = await appelerCerveau(payload, wsUuid, deps);
    if (pont.ok && pont.data && typeof pont.data.verdict === 'string') {
      return toMergeCheckResponse(pont.data, deps.formatOptions);
    }
    const cause = pont.ok ? 'error' : motifRepli(pont.error.kind);
    return reponseRepli({ politique: reglages.fallbackPolicy, cause, trigger, cles, t0, deps });
  } catch {
    return reponseRepli({ politique: DEFAUT_REPLI, cause: 'error', trigger, cles, t0, deps });
  }
}
