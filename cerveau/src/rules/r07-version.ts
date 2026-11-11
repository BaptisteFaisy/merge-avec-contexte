/**
 * R-07 — la version cible du ticket n'est pas déjà publiée.
 *
 * Fusionner un correctif sur une version déjà livrée ne partira jamais : on
 * avertit plutôt que de laisser passer silencieusement.
 */
import type { IssueContext, Rule, RuleInput, RuleOutcome } from '../shared';
import { evaluateIssues, ruleReason } from './input';

/** Verdict pour un ticket : versions cibles déjà publiées. */
function evaluateIssue(input: RuleInput, issue: IssueContext): RuleOutcome {
  const publiees = issue.fixVersions.filter((version) => version.released);
  if (publiees.length === 0) return { status: 'pass', reasons: [] };
  return {
    status: 'fail',
    reasons: publiees.map((version) =>
      ruleReason(
        input,
        'R-07',
        'r07.fail',
        'r07.action',
        { version: version.name, issueKey: issue.key },
        issue.key,
      )),
  };
}

export const r07Version: Rule = {
  code: 'R-07',
  evaluate: (input) => evaluateIssues(input, (issue) => evaluateIssue(input, issue)),
};
