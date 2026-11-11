/**
 * Moteur d'évaluation (§8, §13.2) : applique les règles réglées à une PR et
 * rend une `Evaluation`.
 *
 * Trois mécanismes s'appliquent après coup, dans cet ordre : le mode
 * observation (raison journalisée, jamais affichée ni bloquante), la
 * dérogation (raison couverte, qui ne bloque plus) et le verdict. Aucune
 * horloge n'est lue : `now` est fourni par l'appelant.
 */
import { RULE_CODES, compareReasons, extractIssueKeys, globMatchAny, waiverForRule } from '../shared';
import type { Evaluation, Reason, RuleConfig, RuleOutcome } from '../shared';
import { ruleInputFor } from './input';
import type { EvaluationInput } from './input';
import { ruleFor } from './registry';

/** Une règle exécutée : son réglage et son résultat. */
interface Run {
  config: RuleConfig;
  outcome: RuleOutcome;
}

/** Vrai si la portée de la règle couvre cette PR (dépôt et branche cible). */
export function configApplies(config: RuleConfig, input: EvaluationInput): boolean {
  const depot = input.pr.repositorySlug ?? input.pr.repositoryUuid;
  return globMatchAny(config.scope.repositories, depot)
    && globMatchAny(config.scope.branches, input.pr.targetBranch);
}

/** Exécute une règle sans jamais laisser échapper d'exception. */
function runRule(config: RuleConfig, input: EvaluationInput): RuleOutcome {
  const rule = ruleFor(config.rule);
  if (!rule) return { status: 'not-evaluated', reasons: [], note: `${config.rule} non implémentée` };
  try {
    return rule.evaluate(ruleInputFor(input, config));
  } catch {
    return { status: 'not-evaluated', reasons: [], note: `${config.rule} en erreur` };
  }
}

/** Vrai si une dérogation en vigueur couvre cette règle pour cette PR. */
function isWaived(config: RuleConfig, input: EvaluationInput): boolean {
  return waiverForRule(input.waivers, config.rule, {
    prId: input.pr.pullRequestId,
    repositoryUuid: input.pr.repositoryUuid,
    now: input.now,
  }) !== undefined;
}

/** Marque une raison : observation puis dérogation, sans toucher au reste. */
function decorate(reason: Reason, run: Run, waived: boolean): Reason {
  const marquee: Reason = { ...reason };
  if (run.config.mode === 'observe') marquee.observed = true;
  if (waived) marquee.waived = true;
  return marquee;
}

/** Une raison qui bloque réellement la fusion. */
function blocks(reason: Reason): boolean {
  return reason.level === 'blocking' && reason.observed !== true && reason.waived !== true;
}

/** Vrai si toutes les règles en échec étaient en observation. */
function observedOnly(runs: Run[]): boolean {
  const echecs = runs.filter((run) => run.outcome.status === 'fail');
  return echecs.length > 0 && echecs.every((run) => run.config.mode === 'observe');
}

/** Clés de tickets reconnues dans la PR. */
function issueKeysOf(input: EvaluationInput): string[] {
  return extractIssueKeys({
    sourceBranch: input.pr.sourceBranch,
    title: input.pr.title,
    commitMessages: input.pr.commitMessages,
  });
}

/** Exécute les règles dans la portée, applique observation et dérogations. */
function runAll(input: EvaluationInput): Run[] {
  return input.configs
    .filter((config) => configApplies(config, input))
    .slice()
    .sort((a, b) => RULE_CODES.indexOf(a.rule) - RULE_CODES.indexOf(b.rule))
    .map((config) => ({ config, outcome: runRule(config, input) }));
}

/** Évaluation complète d'une PR : verdict, raisons triées, clés reconnues. */
export function evaluateAll(input: EvaluationInput): Evaluation {
  const runs = runAll(input);
  const reasons = runs
    .flatMap((run) => run.outcome.reasons.map((reason) => decorate(reason, run, isWaived(run.config, input))))
    .sort(compareReasons);
  const evaluation: Evaluation = {
    verdict: reasons.some(blocks) ? 'blocked' : 'allowed',
    reasons,
    issueKeys: issueKeysOf(input),
    trigger: input.pr.trigger,
    evaluatedAt: input.now,
    durationMs: 0,
  };
  if (observedOnly(runs)) evaluation.observedOnly = true;
  return evaluation;
}
