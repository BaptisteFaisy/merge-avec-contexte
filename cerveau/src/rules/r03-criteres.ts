/**
 * R-03 — les critères d'acceptation sont validés.
 *
 * L'entrée est déjà normalisée par le pont (`IssueContext.criteria`) : la
 * source (cases de la description, champ personnalisé, sous-tâches) est un
 * réglage de lecture, pas de décision. On compte les critères non cochés.
 */
import type { IssueContext, Rule, RuleInput, RuleOutcome } from '../shared';
import { evaluateIssues, ruleReason } from './input';

/** Verdict pour un ticket : nombre de critères non cochés. */
function evaluateIssue(input: RuleInput, issue: IssueContext): RuleOutcome {
  const restants = issue.criteria.filter((critere) => !critere.done).length;
  if (restants === 0) return { status: 'pass', reasons: [] };
  return {
    status: 'fail',
    reasons: [
      ruleReason(input, 'R-03', 'r03.fail', 'r03.action', { issueKey: issue.key, count: restants }, issue.key),
    ],
  };
}

export const r03Criteres: Rule = {
  code: 'R-03',
  evaluate: (input) => evaluateIssues(input, (issue) => evaluateIssue(input, issue)),
};
