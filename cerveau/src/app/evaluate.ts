/**
 * Service d'évaluation : le cœur du Cerveau (§13.2, étape 5).
 *
 * Charge les tickets par le cache (60 s), les incidents du service, applique
 * les règles, journalise l'évaluation, et ne lève jamais : une erreur devient
 * une évaluation de repli selon la politique choisie (§13.5).
 *
 * Les tickets sont chargés en concurrence bornée (§57), et la chaîne est
 * instrumentée : chaque étape (Jira, base, règles) est chronométrée (horloge
 * injectée) pour exposer la décomposition des durées dans le journal (§58).
 */
import { incidentsDuService } from '../cache/service-cache';
import { lireTicket } from '../cache/issue-cache';
import type { IssueReader } from '../jira/reader';
import { evaluateAll } from '../rules/engine';
import type { EvaluationInput as EntreeMoteur } from '../rules/input';
import type { EvaluateService, EvaluationInput as EntreePont } from '../bridge/deps';
import type { StoredEvaluation, Store } from '../storage/ports';
import { fallbackEvaluation, type Evaluation, type IssueContext } from '../shared';
import { depsCacheIncidents, depsCacheTickets } from './cache-adaptateurs';
import { chargeEnLimite } from './fiabilite';
import { compteursPartages, mesurer, mesurerAsync, type DecompositionDurees } from './mesure';
import { identifiant } from './waivers';
import type { HorlogeIso } from './horloge';
import type { LoggerCommun } from './logger';

export interface DepsEvaluate {
  store: Store;
  jira: IssueReader;
  clock: HorlogeIso;
  logger: LoggerCommun;
}

/** Tickets d'une PR chargés en parallèle, au plus quatre à la fois (§57). */
const CONCURRENCE_TICKETS = 4;

/** Ligne journalisée augmentée de la décomposition des durées (§58). */
type StoredEvaluationMesure = StoredEvaluation & { decomposition?: DecompositionDurees };

/** Tickets de la PR, lus par le cache ; une clé illisible est rendue « absente ». */
export async function chargerTickets(cles: string[], deps: DepsEvaluate): Promise<IssueContext[]> {
  const cache = depsCacheTickets(deps.store, deps.jira, deps.clock, deps.logger);
  const lus = await chargeEnLimite(cles, CONCURRENCE_TICKETS, (cle) => lireTicket(cle, cache));
  return lus.filter((ticket): ticket is IssueContext => ticket !== undefined);
}

/**
 * Sonde Jira quand aucun ticket n'a pu être chargé alors que la PR en citait.
 *
 * Le cache ne lève jamais : une panne de Jira y ressemble à une clé inconnue.
 * Sans cette sonde, un site Jira injoignable ferait passer tous les contrôles
 * en silence — contraire au §16 (« aucune fusion n'est bloquée par une panne »
 * suppose que la panne se voie). Ici on laisse l'erreur remonter : le repli de
 * l'évaluation la transforme en verdict non concluant, que le Capteur traite
 * selon sa politique (§13.5).
 */
async function sonderJiraSiVide(cles: string[], issues: IssueContext[], deps: DepsEvaluate): Promise<void> {
  if (issues.length > 0 || cles.length === 0) return;
  await deps.jira.lire(cles[0]);
}

/** Incidents ouverts du service, lus par le cache ; vide si service inconnu. */
export async function chargerIncidents(service: string | undefined, deps: DepsEvaluate) {
  if (!service) return [];
  const cache = depsCacheIncidents(deps.store, deps.jira, deps.clock, deps.logger);
  return (await incidentsDuService(service, cache)) ?? [];
}

/** Écrit l'évaluation au journal (§14, table `evaluation`) sans jamais échouer. */
async function journaliser(
  deps: DepsEvaluate,
  entree: EntreePont,
  evaluation: Evaluation,
  decomposition?: DecompositionDurees,
): Promise<void> {
  try {
    const ligne: StoredEvaluationMesure = {
      ...evaluation,
      id: identifiant('ev', entree.pr.pullRequestId, Date.parse(evaluation.evaluatedAt)),
      workspaceUuid: entree.pr.workspaceUuid,
      repositoryUuid: entree.pr.repositoryUuid,
      pullRequestId: entree.pr.pullRequestId,
      service: entree.service,
      ...(decomposition ? { decomposition } : {}),
    };
    await deps.store.evaluations.record(ligne);
  } catch (erreur) {
    deps.logger.error('journal : écriture impossible', { erreur: String(erreur) });
  }
}

/** Horloge milliseconde dérivée de l'horloge ISO injectée. */
function horlogeMs(deps: DepsEvaluate): () => number {
  return () => Date.parse(deps.clock());
}

/** Applique le moteur de règles et chronomètre l'étape. */
function appliquerRegles(moteur: EntreeMoteur, deps: DepsEvaluate) {
  return mesurer(horlogeMs(deps), () => evaluateAll(moteur));
}

/** Charge tickets, sonde éventuelle et incidents, en deux étapes chronométrées. */
async function chargerContexte(entree: EntreePont, deps: DepsEvaluate) {
  const { valeur: issues, ms: jiraMs } = await mesurerAsync(horlogeMs(deps), async () => {
    const lues = await chargerTickets(entree.issueKeys, deps);
    await sonderJiraSiVide(entree.issueKeys, lues, deps);
    return lues;
  });
  const { valeur: incidents, ms: baseMs } = await mesurerAsync(
    horlogeMs(deps),
    () => chargerIncidents(entree.service, deps),
  );
  return { issues, incidents, jiraMs, baseMs };
}

/** Fabrique le `EvaluateService` injecté dans le pont. */
export function createEvaluateService(deps: DepsEvaluate): EvaluateService {
  const compte = compteursPartages();
  return async (entree) => {
    compte.incrementer('evaluations');
    try {
      const { issues, incidents, jiraMs, baseMs } = await chargerContexte(entree, deps);
      const moteur: EntreeMoteur = {
        pr: entree.pr,
        issues,
        freezes: entree.freezes,
        incidents,
        waivers: entree.waivers,
        service: entree.service,
        configs: entree.configs,
        now: entree.now,
        locale: entree.locale,
      };
      const { valeur: evaluation, ms: reglesMs } = appliquerRegles(moteur, deps);
      const decomposition: DecompositionDurees = { jiraMs, baseMs, reglesMs, totalMs: jiraMs + baseMs + reglesMs };
      deps.logger.info('évaluation : décomposition des durées', {
        prId: entree.pr.pullRequestId,
        ...decomposition,
      });
      if (evaluation.verdict === 'blocked') compte.incrementer('blocages');
      await journaliser(deps, entree, evaluation, decomposition);
      return evaluation;
    } catch (erreur) {
      deps.logger.error('évaluation en échec : repli appliqué', { erreur: String(erreur) });
      compte.incrementer('replis');
      const repli = fallbackEvaluation({
        policy: entree.fallbackPolicy,
        cause: 'error',
        trigger: entree.pr.trigger,
        now: deps.clock(),
        issueKeys: entree.issueKeys,
      });
      await journaliser(deps, entree, repli);
      return repli;
    }
  };
}
