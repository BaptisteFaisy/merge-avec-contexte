/**
 * Adaptateur : le stockage du Cerveau (`storage/ports.ts`) vu comme les ports
 * attendus par les cinq actions Rovo/MCP (`rovo/deps.ts`).
 */
import { isEffective } from '../shared';
import type { ApproverDirectory, ContextRepository as RovoContext, EvaluationRepository as RovoEvaluations, RovoDeps, StoredEvaluation as RovoEvaluation } from '../rovo/deps';
import type { Store } from '../storage/ports';
import { reglesEffectives, serviceDuDepot } from './context-repo';
import { createRovoWaivers } from './waivers';
import { enHorlogeObjet, type HorlogeIso } from './horloge';
import type { LoggerCommun } from './logger';
import type { AppConfig } from './config';
import type { DepsEvaluate } from './evaluate';
import { chargerIncidents, chargerTickets } from './evaluate';
import type { EvaluateService } from '../bridge/deps';
import type { ReglagesStore } from './reglages';

/** Charge le contexte nécessaire à l'évaluation à blanc d'un ticket. */
export function createRovoContext(store: Store, config: AppConfig, depsEval: DepsEvaluate): RovoContext {
  return {
    async load(issueKey, repository) {
      const service = repository ? await serviceDuDepot(store, repository) : undefined;
      const [issues, incidents, configs] = await Promise.all([
        chargerTickets([issueKey], depsEval),
        chargerIncidents(service, depsEval),
        reglesEffectives(store, config.projectId),
      ]);
      return { issues, incidents, configs, service };
    },
  };
}

/** Journal des évaluations vu par Rovo : dernières évaluations d'un ticket. */
export function createRovoEvaluations(store: Store): RovoEvaluations {
  return {
    async latestByIssue(issueKey) {
      const stored = await store.evaluations.latestByIssue(issueKey);
      if (!stored) return [];
      const ligne: RovoEvaluation = {
        prId: stored.pullRequestId,
        repository: stored.repositoryUuid,
        verdict: stored.verdict,
        reasons: stored.reasons,
        issueKeys: stored.issueKeys,
        trigger: stored.trigger,
        evaluatedAt: stored.evaluatedAt,
        durationMs: stored.durationMs,
      };
      return [ligne];
    },
  };
}

/** Annuaire des approbateurs : lu dans les réglages applicatifs. */
export function createApproverDirectory(reglages: ReglagesStore, config: AppConfig): ApproverDirectory {
  return {
    async list() {
      const lus = await reglages.lire();
      const approbateurs = lus.approbateurs.length > 0 ? lus.approbateurs : config.approbateurs;
      return approbateurs.map((nom) => ({ accountId: nom, displayName: nom }));
    },
  };
}

/** Fabrique les `RovoDeps` prêtes pour les cinq actions. */
export function createRovoDeps(
  store: Store,
  reglages: ReglagesStore,
  config: AppConfig,
  clock: HorlogeIso,
  logger: LoggerCommun,
  evaluate: EvaluateService,
  depsEval: DepsEvaluate,
): RovoDeps {
  return {
    evaluation: async (input) => {
      const jumelage = await store.pairing.current();
      const waivers = input.waivers.filter((w) => isEffective(w, { prId: input.pr.pullRequestId, repositoryUuid: input.pr.repositoryUuid, now: input.now }));
      return evaluate({
        pr: input.pr,
        issueKeys: input.issues.map((i) => i.key),
        siteUrl: config.siteUrl,
        freezes: input.freezes,
        waivers,
        service: input.service,
        configs: input.configs,
        now: input.now,
        locale: input.locale,
        fallbackPolicy: await store.pairing.fallbackPolicy(),
      });
    },
    context: createRovoContext(store, config, depsEval),
    freezes: {
      active: async () => store.freezes.listActive(clock()),
      upcoming: async () => store.freezes.listUpcoming(clock()),
    },
    waivers: createRovoWaivers(store),
    evaluations: createRovoEvaluations(store),
    approvers: createApproverDirectory(reglages, config),
    clock: enHorlogeObjet(clock),
    logger,
    locale: config.locale,
  };
}
