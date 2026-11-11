/**
 * R-06 — le ticket n'est pas bloqué par un ticket ouvert.
 *
 * Seuls les types de liens réglés comptent (`linkTypes`) ; une cible dont le
 * statut vaut livraison ne bloque plus. Le sens du lien n'est pas distingué :
 * le type configuré porte déjà l'intention.
 */
import type { IssueContext, Rule, RuleInput, RuleOutcome } from '../shared';
import { deliveredStatuses, evaluateIssues, paramStrings, ruleReason } from './input';

const TYPES_PAR_DEFAUT = ['Blocks', 'bloque'];

/** Verdict pour un ticket : liens bloquants vers une cible non livrée. */
function evaluateIssue(input: RuleInput, issue: IssueContext): RuleOutcome {
  const types = paramStrings(input.config.params, 'linkTypes', TYPES_PAR_DEFAUT);
  const livres = deliveredStatuses(input.config.params);
  const bloquants = issue.links.filter(
    (lien) => types.includes(lien.type) && !livres.includes(lien.targetStatus),
  );
  if (bloquants.length === 0) return { status: 'pass', reasons: [] };
  return {
    status: 'fail',
    reasons: bloquants.map((lien) =>
      ruleReason(
        input,
        'R-06',
        'r06.fail',
        'r06.action',
        { issueKey: issue.key, targetKey: lien.targetKey, status: lien.targetStatus },
        issue.key,
      )),
  };
}

export const r06Liens: Rule = {
  code: 'R-06',
  evaluate: (input) => evaluateIssues(input, (issue) => evaluateIssue(input, issue)),
};
