/**
 * R-06 — le ticket n'est pas bloqué par un ticket ouvert.
 *
 * Seuls les types de liens réglés comptent (`linkTypes`) ; une cible dont le
 * statut vaut livraison ne bloque plus. Le **sens** du lien, lui, compte :
 * pour un type bloquant (« Blocks »), la cible placée du côté « outward »
 * bloque le ticket, celle placée du côté « inward » est au contraire le
 * ticket bloqué par nous. Sans cette distinction, un ticket qui en bloque un
 * autre était signalé comme bloqué par lui — faux positif relevé sur un
 * vrai site, où les liens sont Lus dans les deux sens.
 *
 * Deux tolérances rendent la règle fiable sur un site réel :
 *
 *  - le type de lien est reconnu malgré la langue du site (voir `liens.ts`) :
 *    un réglage qui parle de blocage reconnaît le lien « Blocks » d'un site
 *    anglais comme le lien « bloque par » d'un site français ;
 *  - la livraison se compare par catégorie de statut (`done`) et par
 *    identifiant, pas seulement par nom (voir `statuts.ts`) : une cible
 *    livrée reste reconnue sur un site dont la langue n'est pas celle du
 *    réglage.
 */
import type { IssueContext, Rule, RuleInput, RuleOutcome } from '../shared';
import { identifiantsLien, statutLivre } from '../shared';
import { deliveredStatuses, evaluateIssues, paramStrings, ruleReason } from './input';
import { lienDeType } from './liens';

const TYPES_PAR_DEFAUT = ['Blocks', 'bloque'];

/** Verdict pour un ticket : liens bloquants vers une cible non livrée. */
function evaluateIssue(input: RuleInput, issue: IssueContext): RuleOutcome {
  const types = paramStrings(input.config.params, 'linkTypes', TYPES_PAR_DEFAUT);
  const livres = deliveredStatuses(input.config.params);
  const bloquants = issue.links.filter(
    (lien) =>
      lien.direction === 'outward' &&
      lienDeType(types, lien.type, 'bloquant') &&
      !statutLivre(identifiantsLien(lien), livres),
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
