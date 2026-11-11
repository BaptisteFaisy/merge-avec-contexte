/**
 * Fixtures de la recette §18 : jeu de démonstration, doublures des ports du
 * pont et des actions Rovo, signature de requêtes.
 *
 * Aucune dépendance Forge, aucune lecture de l'heure réelle : l'horloge est
 * toujours injectée (l'instant du jeu de démonstration par défaut).
 */
import {
  createDemoDataset,
  issueOf,
  prOf,
  serviceOf,
  DEMO_NOW,
  type DemoDataset,
} from '../src/seed/dataset';
import { evaluateAll } from '../src/rules/engine';
import type { EvaluationInput as EntreeMoteur } from '../src/rules/input';
import type {
  BridgeDeps,
  ContextRepository,
  EvaluateService,
  EvaluationInput as EntreePont,
  PairingRecord,
  WaiverService,
} from '../src/bridge/deps';
import type { BridgeRequest } from '../src/bridge/handler';
import type { RovoDeps } from '../src/rovo/deps';
import { createMemoryStore } from '../src/storage/memory-store';
import { signRequest, toMergeCheckResponse } from '../src/shared';
import type {
  Evaluation,
  FallbackPolicy,
  FormatOptions,
  Freeze,
  IssueContext,
  Locale,
  MergeCheckResponse,
  PairingOffer,
  PrContext,
  RuleCode,
  RuleConfig,
  Waiver,
  WaiverDecisionPayload,
  WaiverRequestPayload,
} from '../src/shared';

/** Secret partagé des jumelages de recette. */
export const SECRET_RECETTE = 'secret-de-recette';
/** Espace de travail Bitbucket du jeu de démonstration. */
export const WORKSPACE_RECETTE = 'demo-workspace-uuid';
/** Site Jira du jeu de démonstration. */
export const SITE_RECETTE = 'https://demo.atlassian.net';
/** Instant dans le gel « Black Friday » (30/11, 8 h → 10 h UTC). */
export const NOW_GEL = '2026-11-30T09:00:00Z';
/** Instant dans la fenêtre nocturne quotidienne (22 h → 23 h, Europe/Paris). */
export const NOW_DEROGATION = '2026-11-27T21:30:00Z';

const DEUX_HEURES_MS = 2 * 60 * 60 * 1000;

/** Clés de tickets reconnues, par PR du jeu de démonstration. */
export const CLES_PAR_PR: Record<number, string[]> = {
  42: ['PAY-123'],
  43: ['PAY-124'],
  44: ['PAY-140'],
};

/** Jeu de démonstration à l'instant injecté (celui du jeu par défaut). */
export function jeuDeRecette(now: string = DEMO_NOW): DemoDataset {
  return createDemoDataset(now);
}

/** PR du jeu ; échoue si le numéro est inconnu (erreur de fixture, pas de règle). */
export function prDeRecette(dataset: DemoDataset, prId: number): PrContext {
  const pr = prOf(dataset, prId);
  if (!pr) throw new Error(`PR inconnue du jeu de démonstration : ${prId}`);
  return pr;
}

/** Ticket inexistant : ce que le pont enverrait pour une clé inconnue du site. */
function issueIntrouvable(key: string): IssueContext {
  return {
    key,
    id: key,
    exists: false,
    status: '',
    criteria: [],
    links: [],
    fixVersions: [],
    labels: [],
    components: [],
    incidentKeys: [],
  };
}

/** Ticket du jeu par clé, ou ticket « absent du site » si la clé est inconnue. */
export function issueDeRecette(dataset: DemoDataset, key: string): IssueContext {
  return issueOf(dataset, key) ?? issueIntrouvable(key);
}

/** Options de construction d'une entrée du moteur depuis le jeu. */
export interface OptionsEntree {
  dataset?: DemoDataset;
  prId: number;
  issueKeys?: string[];
  /** Horloge injectée : jamais `Date.now()`. */
  now?: string;
  locale?: Locale;
  configs?: RuleConfig[];
  waivers?: Waiver[];
  freezes?: Freeze[];
}

/** Entrée du moteur construite depuis le jeu de démonstration. */
export function entreeDeRecette(options: OptionsEntree): EntreeMoteur {
  const dataset = options.dataset ?? jeuDeRecette(options.now);
  const pr = prDeRecette(dataset, options.prId);
  const cles = options.issueKeys ?? CLES_PAR_PR[options.prId] ?? [];
  return {
    pr,
    issues: cles.map((cle) => issueDeRecette(dataset, cle)),
    freezes: options.freezes ?? dataset.freezes,
    incidents: dataset.incidents,
    waivers: options.waivers ?? dataset.waivers,
    service: serviceOf(dataset, pr.repositorySlug ?? pr.repositoryUuid),
    configs: options.configs ?? dataset.configs,
    now: options.now ?? dataset.now,
    locale: options.locale ?? 'fr',
  };
}

/** Évaluation réelle d'une PR du jeu, par le moteur de production. */
export function evaluerRecette(options: OptionsEntree): Evaluation {
  return evaluateAll(entreeDeRecette(options));
}

/** Évaluation + réponse Bitbucket (message au format imposé du §9). */
export function reponseRecette(
  options: OptionsEntree,
  format: FormatOptions = {},
): { evaluation: Evaluation; reponse: MergeCheckResponse } {
  const evaluation = evaluerRecette(options);
  const locale = options.locale ?? 'fr';
  return { evaluation, reponse: toMergeCheckResponse(evaluation, { locale, ...format }) };
}

/** Réglages basculés en mode observation pour les règles demandées. */
export function configsEnObservation(configs: RuleConfig[], regles: RuleCode[]): RuleConfig[] {
  return configs.map((config) => (regles.includes(config.rule) ? { ...config, mode: 'observe' } : config));
}

/** Options d'une dérogation de deux heures. */
export interface OptionsWaiver {
  prId: number;
  /** Horloge injectée : le début de validité. */
  requestedAt: string;
  rule?: RuleCode;
  grantedBy?: string;
  reason?: string;
  repositoryUuid?: string;
}

/** Dérogation accordée pour deux heures (qui, pourquoi, jusqu'à quand). */
export function waiverDeuxHeures(options: OptionsWaiver): Waiver {
  return {
    id: 'waiver-recette-2h',
    prId: options.prId,
    repositoryUuid: options.repositoryUuid ?? 'demo-repo-uuid',
    rule: options.rule ?? 'R-04',
    requestedBy: 'lea',
    grantedBy: options.grantedBy ?? 'tech-lead',
    reason: options.reason ?? 'correctif de prix avant l’ouverture',
    requestedAt: options.requestedAt,
    expiresAt: new Date(Date.parse(options.requestedAt) + DEUX_HEURES_MS).toISOString(),
    status: 'granted',
  };
}

/** Une ligne de journal de test. */
export interface EntreeJournal {
  niveau: 'info' | 'warn' | 'error';
  message: string;
  contexte?: Record<string, unknown>;
}

/** Journal en mémoire : satisfait les ports `Logger` du pont et de Rovo. */
export class JournalTest {
  readonly entrees: EntreeJournal[] = [];

  info(message: string, contexte?: Record<string, unknown>): void {
    this.entrees.push({ niveau: 'info', message, contexte });
  }

  warn(message: string, contexte?: Record<string, unknown>): void {
    this.entrees.push({ niveau: 'warn', message, contexte });
  }

  error(message: string, contexte?: Record<string, unknown>): void {
    this.entrees.push({ niveau: 'error', message, contexte });
  }
}

/** Dépôt de jumelages en mémoire : le port `PairingRepository` du pont. */
export class PairingMemoire {
  private readonly offres = new Map<string, PairingOffer>();
  private readonly jumelages = new Map<string, PairingRecord>();

  constructor(private readonly repli: FallbackPolicy = 'open') {}

  async saveOffer(offer: PairingOffer): Promise<void> {
    this.offres.set(offer.code, offer);
  }

  async findOffer(code: string): Promise<PairingOffer | undefined> {
    return this.offres.get(code);
  }

  async markOfferUsed(code: string): Promise<void> {
    const offre = this.offres.get(code);
    if (offre) this.offres.set(code, { ...offre, used: true });
  }

  async savePairing(pairing: PairingRecord): Promise<void> {
    this.jumelages.set(pairing.workspaceUuid, pairing);
  }

  async pairingForWorkspace(workspaceUuid: string): Promise<PairingRecord | undefined> {
    return this.jumelages.get(workspaceUuid);
  }

  async pairings(): Promise<PairingRecord[]> {
    return [...this.jumelages.values()];
  }

  async fallbackPolicy(): Promise<FallbackPolicy> {
    return this.repli;
  }
}

/** Port `ContextRepository` du pont, alimenté par le jeu de démonstration. */
export function contexteDouble(dataset: DemoDataset, service = 'checkout-api'): ContextRepository {
  return {
    async rules() {
      return dataset.configs;
    },
    async serviceForRepository() {
      return service;
    },
    async freezes() {
      return dataset.freezes;
    },
  };
}

/** Port `WaiverService` du pont : liste les dérogations d'une PR. */
export function waiversDouble(liste: Waiver[] = []): WaiverService {
  const copies = [...liste];
  return {
    async demander(demande: WaiverRequestPayload): Promise<Waiver> {
      const waiver: Waiver = {
        id: `waiver-${copies.length + 1}`,
        prId: demande.prId,
        repositoryUuid: demande.repositoryUuid,
        rule: demande.rule,
        requestedBy: demande.requestedBy,
        reason: demande.reason,
        requestedAt: DEMO_NOW,
        expiresAt: new Date(Date.parse(DEMO_NOW) + demande.hours * 3600 * 1000).toISOString(),
        status: 'requested',
      };
      copies.push(waiver);
      return waiver;
    },
    async decider(demande: WaiverDecisionPayload): Promise<Waiver> {
      const trouve = copies.find((waiver) => waiver.id === demande.waiverId);
      if (!trouve) throw new Error(`Dérogation inconnue : ${demande.waiverId}`);
      const maj: Waiver = { ...trouve, status: demande.decision, grantedBy: demande.decidedBy };
      copies[copies.indexOf(trouve)] = maj;
      return maj;
    },
    async lister(filtre: { prId?: number; repositoryUuid?: string }): Promise<Waiver[]> {
      return copies.filter(
        (waiver) =>
          (filtre.prId === undefined || waiver.prId === filtre.prId)
          && (filtre.repositoryUuid === undefined || waiver.repositoryUuid === filtre.repositoryUuid),
      );
    },
  };
}

/** Service d'évaluation réel du pont : le moteur de production sur le jeu. */
export function evaluateurReel(dataset: DemoDataset): EvaluateService {
  return async (entree: EntreePont) =>
    evaluateAll({
      pr: entree.pr,
      issues: entree.issueKeys.map((cle) => issueDeRecette(dataset, cle)),
      freezes: entree.freezes,
      incidents: dataset.incidents,
      waivers: entree.waivers,
      service: entree.service,
      configs: entree.configs,
      now: entree.now,
      locale: entree.locale,
    });
}

/** Options des dépendances du pont de recette. */
export interface OptionsPont {
  dataset?: DemoDataset;
  secret?: string;
  policy?: FallbackPolicy;
  evaluate?: EvaluateService;
  /** Horloge injectée (ISO) : le pont ne lit jamais l'heure réelle. */
  now?: string;
  service?: string;
}

/** Dépendances du pont jumelé, nonces via `createMemoryStore()`. */
export async function depsPontDeRecette(
  options: OptionsPont = {},
): Promise<{ deps: BridgeDeps; journal: JournalTest }> {
  const now = options.now ?? DEMO_NOW;
  const dataset = options.dataset ?? jeuDeRecette(now);
  const pairing = new PairingMemoire(options.policy ?? 'open');
  await pairing.savePairing({
    workspaceUuid: WORKSPACE_RECETTE,
    secret: options.secret ?? SECRET_RECETTE,
    siteUrl: SITE_RECETTE,
    pairedAt: now,
  });
  const journal = new JournalTest();
  const deps: BridgeDeps = {
    pairing,
    context: contexteDouble(dataset, options.service),
    waivers: waiversDouble(dataset.waivers),
    nonces: createMemoryStore().nonces,
    evaluate: options.evaluate ?? evaluateurReel(dataset),
    clock: () => now,
    logger: journal,
    config: {
      bridgeUrl: 'https://pont.recette.test',
      version: '0.1.0',
      siteUrl: SITE_RECETTE,
      adminAccountId: 'admin-recette',
      locale: 'fr',
    },
  };
  return { deps, journal };
}

/** Options de signature d'une requête du pont. */
export interface OptionsSignature {
  secret?: string;
  /** Horloge injectée (ISO) de l'émetteur. */
  nowIso?: string;
  nonce?: string;
}

/** Requête du pont signée avec `signRequest` (horloge et nonce injectés). */
export function signerPont(body: string, options: OptionsSignature = {}): BridgeRequest {
  const signe = signRequest({
    secret: options.secret ?? SECRET_RECETTE,
    body,
    now: () => Date.parse(options.nowIso ?? DEMO_NOW),
    nonceGenerator: () => options.nonce ?? 'nonce-recette',
  });
  return { body: signe.body, headers: signe.headers };
}

/** Corps d'une demande d'évaluation signée, pour la PR #42 du jeu. */
export function corpsEvaluate(surcharge: Record<string, unknown> = {}): string {
  return JSON.stringify({
    route: 'evaluate',
    payload: {
      workspaceUuid: WORKSPACE_RECETTE,
      repositoryUuid: 'demo-repo-uuid',
      repositorySlug: 'checkout-api',
      pullRequestId: 42,
      trigger: 'on-code-pushed',
      issueKeys: ['PAY-123'],
      sourceBranch: 'feature/PAY-123-limite-tentatives',
      targetBranch: 'main',
      ...surcharge,
    },
  });
}

/** Ports Rovo/MCP en mémoire, alimentés par le jeu de démonstration. */
export function depsRovoDeRecette(dataset: DemoDataset, locale: Locale = 'fr'): RovoDeps {
  const journal = new JournalTest();
  return {
    evaluation: async (entree) => evaluateAll(entree),
    context: {
      async load(issueKey: string) {
        return {
          issues: dataset.issues.filter((issue) => issue.key === issueKey),
          incidents: dataset.incidents,
          configs: dataset.configs,
          service: 'checkout-api',
        };
      },
    },
    freezes: {
      active: async () => dataset.freezes,
      upcoming: async () => [],
    },
    waivers: {
      listByIssue: async () => [],
      createRequest: async () => {
        throw new Error('non utilisé en recette');
      },
    },
    evaluations: { latestByIssue: async () => [] },
    approvers: { list: async () => [] },
    clock: { now: () => dataset.now },
    logger: journal,
    locale,
  };
}
