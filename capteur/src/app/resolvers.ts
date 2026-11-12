/**
 * Logique des trois resolvers d'interface du Capteur (§12) — sans import Forge.
 *
 * - `resolverPrCard` : lit la PR, interroge la route `card` du pont, rend
 *   `CarteVm` ; avec `action: 'request-waiver'`, envoie d'abord la demande.
 * - `resolverPrPanel` : même lecture, rend `PanneauVm` (règles et historique).
 * - `resolverWorkspaceSettings` : rend `ReglagesVm` ; sur `action: 'save'`,
 *   consomme un éventuel code de jumelage (route publique `pair` du pont),
 *   enregistre la politique de repli et l'envoi des chemins.
 *
 * Tout passe par des ports injectés : la logique est testable hors plateforme.
 */
import type {
  Evaluation,
  FallbackCause,
  Incident,
  IssueContext,
  Level,
  Reason,
  RuleConfig,
  RuleCode,
  RuleMode,
  Trigger,
  Verdict,
  Waiver,
} from '../shared';
import { extractIssueKeys, fallbackEvaluation, isPairingCodeFormat, isRuleCode, EMPREINTE_CONTRAT } from '../shared';
import { declencheurDepuisBitbucket, versPrContext } from '../bitbucket/pr';
import type { LecturePr } from '../bitbucket/api';
import type { PRCheckEvent } from '../bitbucket/types';
import { unwrapUuid } from '../bitbucket/types';
import { appelerPont, sonderSantePont, type BridgeErrorKind, type FetchPont } from '../bridge/client';
import type { PairingStore } from '../pairing/store';
import type { SettingsStore } from '../policy/settings';
import { DEFAUT_ENVOI_CHEMINS, DEFAUT_REPLI } from '../policy/settings';
import { vmCarte, vmPanneau, vmReglagesEspace, type CarteVm, type PanneauVm, type ReglagesVm } from '../ui/view-models';

/** Contexte d'extension reçu par les modules d'interface Bitbucket. */
export interface BitbucketUiContext {
  type?: string;
  location?: string;
  workspace?: { uuid: string };
  repository?: { uuid: string };
  pullRequest?: { id: number };
  extension?: {
    workspace?: { uuid: string };
    repository?: { uuid: string };
    pullRequest?: { id: number };
  };
}

export interface ResolverDeps {
  pairingStore: PairingStore;
  settingsStore: SettingsStore;
  /** Lecture de la PR ; l'implémentation réelle est `lirePr` de `bitbucket/api`. */
  lirePr: (event: PRCheckEvent) => Promise<LecturePr>;
  fetch?: FetchPont;
  now?: () => number;
  nonceGenerator?: () => string;
  /** Délai des appels au pont (sonde `health` comprise) ; défaut : 4 s. */
  timeoutMs?: number;
  /**
   * Incidents du service touché (§17 cas 6 : évaluation périmée). Port
   * facultatif : sans lui, la carte ne peut pas détecter la péremption.
   */
  lireIncidents?: (service: string) => Promise<Incident[]>;
}

/** Détail renvoyé par la route `card` du Cerveau (`cerveau/src/bridge/routes.ts`). */
export interface CorpsCarte {
  verdict: Verdict;
  message: string;
  reasons: Reason[];
  issueKeys: string[];
  evaluatedAt: string;
  durationMs: number;
  observedOnly?: boolean;
  service?: string;
  siteUrl: string;
  rules: Array<{ rule: string; level: string; mode: string }>;
  waivers: Waiver[];
}

/** Reconstruit l'évaluation à partir du détail renvoyé par le pont. */
export function evaluationDepuisCarte(detail: CorpsCarte, trigger: Trigger): Evaluation {
  return {
    verdict: detail.verdict,
    reasons: detail.reasons,
    issueKeys: detail.issueKeys,
    trigger,
    evaluatedAt: detail.evaluatedAt,
    durationMs: detail.durationMs,
    observedOnly: detail.observedOnly,
  };
}

/** Tickets de la carte : le pont ne renvoie que les clés, l'URL est reconstruite. */
export function issuesDepuisCarte(detail: CorpsCarte): IssueContext[] {
  return detail.issueKeys.map((key) => ({
    key,
    id: key,
    exists: true,
    status: '',
    criteria: [],
    links: [],
    fixVersions: [],
    labels: [],
    components: [],
    incidentKeys: [],
    url: detail.siteUrl ? `${detail.siteUrl.replace(/\/$/, '')}/browse/${key}` : undefined,
  }));
}

/** Réglages des règles, tels que le pont les résume (portée et params absents). */
export function configsDepuisCarte(detail: CorpsCarte): RuleConfig[] {
  return detail.rules
    .filter((regle) => isRuleCode(regle.rule))
    .map((regle) => ({
      rule: regle.rule as RuleCode,
      level: regle.level as Level,
      mode: regle.mode as RuleMode,
      scope: {},
      params: {},
    }));
}

/** Identifiants de l'espace, du dépôt et de la PR, accolades retirées. */
export function uuidsDepuis(context: BitbucketUiContext): {
  workspaceUuid: string;
  repositoryUuid: string;
  pullRequestId: number;
} {
  const workspace = context.workspace?.uuid ?? context.extension?.workspace?.uuid ?? '';
  const repository = context.repository?.uuid ?? context.extension?.repository?.uuid ?? '';
  const pullRequestId = context.pullRequest?.id ?? context.extension?.pullRequest?.id ?? 0;
  return {
    workspaceUuid: unwrapUuid(workspace),
    repositoryUuid: unwrapUuid(repository),
    pullRequestId,
  };
}

function causeDepuis(kind: BridgeErrorKind): FallbackCause {
  if (kind === 'unpaired') return 'unpaired';
  if (kind === 'timeout') return 'timeout';
  return kind === 'http' || kind === 'bad-response' ? 'error' : 'unreachable';
}

function instant(deps: ResolverDeps): string {
  return new Date((deps.now ?? Date.now)()).toISOString();
}

/** Événement de lecture synthétique : les modules d'interface n'en reçoivent pas. */
function evenementDe(context: BitbucketUiContext): PRCheckEvent {
  const { workspaceUuid, repositoryUuid, pullRequestId } = uuidsDepuis(context);
  return {
    workspace: { uuid: workspaceUuid },
    repository: { uuid: repositoryUuid },
    pullrequest: { id: pullRequestId },
    trigger: { type: 'on-code-pushed' },
  };
}

/** Ce que la carte affiche : évaluation, contexte, état du jumelage. */
export interface CarteChargee {
  evaluation: Evaluation;
  issues: IssueContext[];
  configs: RuleConfig[];
  historique: Evaluation[];
  jumelage: { jumele: boolean; site?: string; depuis?: string };
  /** Incidents du service de la carte, pour détecter une évaluation périmée. */
  incidents: Incident[];
}

/** Incidents du service ; vide sans source, et une panne ne casse pas la carte. */
async function lireIncidentsService(service: string | undefined, deps: ResolverDeps): Promise<Incident[]> {
  if (!service || !deps.lireIncidents) return [];
  try {
    return await deps.lireIncidents(service);
  } catch {
    return [];
  }
}

/** Charge utile de la route `card` : les métadonnées de la PR, rien d'autre. */
function payloadCarte(pr: ReturnType<typeof versPrContext>, pullRequestId: number, envoiChemins: boolean): Record<string, unknown> {
  return {
    workspaceUuid: pr.workspaceUuid,
    repositoryUuid: pr.repositoryUuid,
    repositorySlug: pr.repositorySlug,
    pullRequestId,
    trigger: pr.trigger,
    issueKeys: extractIssueKeys(pr),
    sourceBranch: pr.sourceBranch,
    targetBranch: pr.targetBranch,
    ...(envoiChemins ? { changedPaths: pr.changedPaths } : {}),
    reviewers: pr.reviewers.map((r) => ({ accountId: r.accountId, state: r.state })),
  };
}

/** Lit la PR, appelle la route `card`, et retombe sur le repli en cas d'échec. */
async function chargerCarte(context: BitbucketUiContext, deps: ResolverDeps): Promise<CarteChargee> {
  const { workspaceUuid, repositoryUuid, pullRequestId } = uuidsDepuis(context);
  const pairing = await deps.pairingStore.getPairing(workspaceUuid);
  const settings = await deps.settingsStore.getSettings(workspaceUuid);
  const lecture = await deps.lirePr(evenementDe(context));
  const pr = versPrContext(lecture.pr, lecture.commits, lecture.diffstat, {
    workspaceUuid,
    repositoryUuid,
    repositorySlug: lecture.pr.repository?.slug,
    trigger: declencheurDepuisBitbucket('on-code-pushed'),
    envoiDesChemins: settings.envoiDesChemins,
  });
  const reponse = await appelerPont<CorpsCarte>(
    { route: 'card', payload: payloadCarte(pr, pullRequestId, settings.envoiDesChemins) },
    { workspaceUuid, store: deps.pairingStore, fetch: deps.fetch, now: deps.now, nonceGenerator: deps.nonceGenerator },
  );
  const jumelage = { jumele: Boolean(pairing), site: pairing?.siteUrl, depuis: pairing?.pairedAt };
  if (!reponse.ok) {
    return {
      evaluation: fallbackEvaluation({
        policy: settings.fallbackPolicy,
        cause: causeDepuis(reponse.error.kind),
        trigger: pr.trigger,
        now: instant(deps),
        issueKeys: extractIssueKeys(pr),
      }),
      issues: [],
      configs: [],
      historique: [],
      jumelage,
      incidents: [],
    };
  }
  return {
    evaluation: evaluationDepuisCarte(reponse.data, pr.trigger),
    issues: issuesDepuisCarte(reponse.data),
    configs: configsDepuisCarte(reponse.data),
    historique: [],
    jumelage: { ...jumelage, site: reponse.data.siteUrl || jumelage.site },
    incidents: await lireIncidentsService(reponse.data.service, deps),
  };
}

/** Envoie une demande de dérogation au pont ; silencieux si non jumelé. */
async function demanderDerogation(
  workspaceUuid: string,
  repositoryUuid: string,
  pullRequestId: number,
  payload: Record<string, unknown>,
  deps: ResolverDeps,
): Promise<void> {
  const rule = typeof payload.rule === 'string' ? payload.rule : 'R-04';
  const reason = typeof payload.reason === 'string' && payload.reason.trim() !== ''
    ? payload.reason.trim()
    : 'Dérogation demandée depuis la carte de PR.';
  const hours = typeof payload.hours === 'number' && payload.hours > 0 ? payload.hours : 2;
  const requestedBy = typeof payload.requestedBy === 'string' ? payload.requestedBy : 'bitbucket-user';
  await appelerPont(
    { route: 'waiver.request', payload: { prId: pullRequestId, repositoryUuid, rule, reason, hours, requestedBy } },
    { workspaceUuid, store: deps.pairingStore, fetch: deps.fetch, now: deps.now },
  );
}

/** `resolverPrCard` : contenu de la carte, ou demande de dérogation d'abord. */
export async function handlePrCard(
  context: BitbucketUiContext,
  payload: Record<string, unknown> | undefined,
  deps: ResolverDeps,
): Promise<CarteVm> {
  if (payload?.action === 'request-waiver') {
    const { workspaceUuid, repositoryUuid, pullRequestId } = uuidsDepuis(context);
    await demanderDerogation(workspaceUuid, repositoryUuid, pullRequestId, payload, deps);
  }
  const carte = await chargerCarte(context, deps);
  return vmCarte({
    evaluation: carte.evaluation,
    issues: carte.issues,
    incidents: carte.incidents,
    jumelage: carte.jumelage,
  });
}

/** `resolverPrPanel` : panneau de l'onglet Overview. */
export async function handlePrPanel(context: BitbucketUiContext, deps: ResolverDeps): Promise<PanneauVm> {
  const carte = await chargerCarte(context, deps);
  return vmPanneau({
    evaluation: carte.evaluation,
    issues: carte.issues,
    incidents: carte.incidents,
    jumelage: carte.jumelage,
    regles: carte.configs,
    historique: carte.historique,
  });
}

/** Consomme le code de jumelage via la route publique `pair` du pont. */
async function jumeler(
  workspaceUuid: string,
  code: string,
  bridgeUrl: string | undefined,
  deps: ResolverDeps,
): Promise<void> {
  if (!isPairingCodeFormat(code) || !bridgeUrl) return;
  const fetchImpl = deps.fetch ?? (globalThis.fetch as unknown as FetchPont);
  const reponse = await fetchImpl(bridgeUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ route: 'pair', payload: { code: code.trim(), workspaceUuid } }),
  });
  if (!reponse.ok) throw new Error('Code de jumelage refusé ou expiré.');
  const corps = (await reponse.json()) as { secret?: string; bridgeUrl?: string; siteUrl?: string; pairedAt?: string };
  if (!corps.secret) throw new Error('Réponse de jumelage incomplète.');
  await deps.pairingStore.savePairing(
    workspaceUuid,
    {
      bridgeUrl: corps.bridgeUrl ?? bridgeUrl,
      siteUrl: corps.siteUrl ?? '',
      pairedAt: corps.pairedAt ?? instant(deps),
    },
    corps.secret,
  );
}

/**
 * Sonde la route publique `health` du pont (§17 cas 10 : pont coupé).
 *
 * Sans jumelage enregistré, il n'y a rien à sonder : l'écran affiche déjà
 * « Non jumelé », le bandeau « pont coupé » serait trompeur.
 */
async function pontInjoignable(bridgeUrl: string | undefined, deps: ResolverDeps): Promise<boolean> {
  if (!bridgeUrl) return false;
  const sante = await sonderSantePont(bridgeUrl, { fetch: deps.fetch, timeoutMs: deps.timeoutMs });
  return !sante.joignable;
}

/** `resolverWorkspaceSettings` : lecture et sauvegarde des réglages. */
export async function handleWorkspaceSettings(
  context: BitbucketUiContext,
  payload: Record<string, unknown> | undefined,
  deps: ResolverDeps,
): Promise<ReglagesVm & { empreinteContrat: string }> {
  const { workspaceUuid } = uuidsDepuis(context);
  if (payload?.action === 'save') {
    const politique = payload.politique === 'closed' ? 'closed' : 'open';
    await deps.settingsStore.setFallbackPolicy(workspaceUuid, politique);
    await deps.settingsStore.setEnvoiDesChemins(workspaceUuid, payload.envoyerChemins !== false);
    const existant = await deps.pairingStore.getPairing(workspaceUuid);
    const bridgeUrl = typeof payload.bridgeUrl === 'string' && payload.bridgeUrl
      ? payload.bridgeUrl
      : existant?.bridgeUrl;
    await jumeler(workspaceUuid, typeof payload.codeJumelage === 'string' ? payload.codeJumelage : '', bridgeUrl, deps);
  }
  const pairing = await deps.pairingStore.getPairing(workspaceUuid);
  const settings = await deps.settingsStore.getSettings(workspaceUuid).catch(() => ({
    fallbackPolicy: DEFAUT_REPLI,
    envoiDesChemins: DEFAUT_ENVOI_CHEMINS,
  }));
  const coupe = await pontInjoignable(pairing?.bridgeUrl, deps);
  return {
    ...vmReglagesEspace({
      jumelage: { jumele: Boolean(pairing), site: pairing?.siteUrl, depuis: pairing?.pairedAt },
      politique: settings.fallbackPolicy,
      envoyerChemins: settings.envoiDesChemins,
      pontInjoignable: coupe,
    }),
    /** Empreinte du contrat partagé (audit 79) : visible pour repérer un écart de version. */
    empreinteContrat: EMPREINTE_CONTRAT,
  };
}
