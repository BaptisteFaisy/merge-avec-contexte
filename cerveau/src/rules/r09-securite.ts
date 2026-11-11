/**
 * R-09 — revue de sécurité approuvée si le ticket la réclame.
 *
 * L'exigence vient de l'étiquette réglée (`label`) ou du champ normalisé
 * (`securityReviewRequired`) ; l'approbation, du champ `securityReviewApproved`.
 */
import type { IssueContext, Rule, RuleInput, RuleOutcome } from '../shared';
import { evaluateIssues, paramString, ruleReason } from './input';

/** Vrai si le ticket réclame une revue de sécurité. */
function revueExigee(issue: IssueContext, etiquette: string): boolean {
  return issue.securityReviewRequired === true || issue.labels.includes(etiquette);
}

/** Verdict pour un ticket : revue exigée et non approuvée. */
function evaluateIssue(input: RuleInput, issue: IssueContext): RuleOutcome {
  const etiquette = paramString(input.config.params, 'label', 'security-review');
  if (!revueExigee(issue, etiquette)) return { status: 'pass', reasons: [] };
  if (issue.securityReviewApproved === true) return { status: 'pass', reasons: [] };
  return {
    status: 'fail',
    reasons: [ruleReason(input, 'R-09', 'r09.fail', 'r09.action', { issueKey: issue.key }, issue.key)],
  };
}

export const r09Securite: Rule = {
  code: 'R-09',
  evaluate: (input) => evaluateIssues(input, (issue) => evaluateIssue(input, issue)),
};
