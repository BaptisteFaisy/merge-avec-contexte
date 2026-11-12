/**
 * R-13 — les dépendances amont sont livrées.
 *
 * Seuls les types de liens amont réglés comptent (`linkTypes`) ; une cible
 * dont le statut vaut livraison satisfait la règle. Le type de lien est
 * reconnu malgré la langue du site (`liens.ts`) et la livraison se compare
 * par catégorie de statut (`statuts.ts`), comme pour R-06.
 */
import type { IssueContext, Rule, RuleInput, RuleOutcome } from '../shared';
import { identifiantsLien, statutLivre } from '../shared';
import { deliveredStatuses, evaluateIssues, paramStrings, ruleReason } from './input';
import { lienDeType } from './liens';

const TYPES_PAR_DEFAUT = ['Depends on', 'dépend de'];

/** Verdict pour un ticket : dépendances amont non livrées. */
function evaluateIssue(input: RuleInput, issue: IssueContext): RuleOutcome {
  const types = paramStrings(input.config.params, 'linkTypes', TYPES_PAR_DEFAUT);
  const livres = deliveredStatuses(input.config.params);
  const enAttente = issue.links.filter(
    (lien) =>
      lien.direction === 'outward' &&
      lienDeType(types, lien.type, 'dependance') &&
      !statutLivre(identifiantsLien(lien), livres),
  );
  if (enAttente.length === 0) return { status: 'pass', reasons: [] };
  return {
    status: 'fail',
    reasons: enAttente.map((lien) =>
      ruleReason(
        input,
        'R-13',
        'r13.fail',
        'r13.action',
        { targetKey: lien.targetKey, status: lien.targetStatus },
        issue.key,
      )),
  };
}

export const r13Dependances: Rule = {
  code: 'R-13',
  evaluate: (input) => evaluateIssues(input, (issue) => evaluateIssue(input, issue)),
};
