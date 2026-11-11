/**
 * R-01 — la PR est reliée à un ticket Jira existant.
 *
 * La clé est cherchée dans la branche source, puis le titre, puis les
 * messages de commit (helper partagé). Une clé trouvée mais inconnue du site
 * jumelé compte comme absente, avec un message distinct (§17).
 */
import { extractIssueKeys, globMatch, globMatchAny } from '../shared';
import type { Rule, RuleInput } from '../shared';
import { existingIssues, paramString, paramStrings, ruleReason } from './input';

/** Vrai si la branche source est exemptée de ticket (hotfix, par exemple). */
function brancheExemptee(input: RuleInput): boolean {
  const exceptions = paramStrings(input.config.params, 'branchExceptions', []);
  return exceptions.length > 0 && globMatchAny(exceptions, input.pr.sourceBranch);
}

export const r01TicketLie: Rule = {
  code: 'R-01',
  evaluate(input) {
    if (brancheExemptee(input)) return { status: 'pass', reasons: [] };
    const keys = extractIssueKeys({
      sourceBranch: input.pr.sourceBranch,
      title: input.pr.title,
      commitMessages: input.pr.commitMessages,
    });
    const motif = paramString(input.config.params, 'keyPattern', '');
    const retenues = motif.length === 0 ? keys : keys.filter((key) => globMatch(motif, key));
    if (retenues.length === 0) {
      return { status: 'fail', reasons: [ruleReason(input, 'R-01', 'r01.missing', 'r01.action')] };
    }
    const connus = existingIssues(input.issues).filter((issue) => retenues.includes(issue.key));
    if (connus.length > 0) return { status: 'pass', reasons: [] };
    return {
      status: 'fail',
      reasons: retenues.map((key) =>
        ruleReason(input, 'R-01', 'r01.unknown', 'r01.action', { issueKey: key }, key)),
    };
  },
};
