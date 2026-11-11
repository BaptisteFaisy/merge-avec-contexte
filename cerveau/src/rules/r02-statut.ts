/**
 * R-02 — le ticket est dans un statut autorisant la fusion.
 *
 * Les statuts autorisés viennent du réglage (`allowedStatuses`) ; la
 * comparaison porte sur le libellé exact du statut Jira.
 */
import type { IssueContext, Rule, RuleInput, RuleOutcome } from '../shared';
import { evaluateIssues, paramStrings, ruleReason } from './input';

const STATUTS_PAR_DEFAUT = ['In Progress', 'In Review', 'Done'];

/** Verdict pour un ticket : statut autorisé ou non. */
function evaluateIssue(input: RuleInput, issue: IssueContext): RuleOutcome {
  const autorises = paramStrings(input.config.params, 'allowedStatuses', STATUTS_PAR_DEFAUT);
  if (autorises.includes(issue.status)) return { status: 'pass', reasons: [] };
  return {
    status: 'fail',
    reasons: [
      ruleReason(
        input,
        'R-02',
        'r02.fail',
        'r02.action',
        { issueKey: issue.key, status: issue.status, allowed: autorises.join(', ') },
        issue.key,
      ),
    ],
  };
}

export const r02StatutAutorise: Rule = {
  code: 'R-02',
  evaluate: (input) => evaluateIssues(input, (issue) => evaluateIssue(input, issue)),
};
