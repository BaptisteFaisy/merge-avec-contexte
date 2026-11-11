/**
 * R-12 — fichiers sensibles : un plan de retour arrière est joint au ticket.
 *
 * Les motifs de chemins (`pathPatterns`, ex. `migrations/**`) viennent du
 * réglage. Le plan est attesté par le champ normalisé `rollbackPlanAttached`
 * ou par l'étiquette réglée (`planLabel`).
 */
import { globMatchAny } from '../shared';
import type { IssueContext, Rule, RuleInput, RuleOutcome } from '../shared';
import { evaluateIssues, paramString, paramStrings, ruleReason } from './input';

const MOTIFS_PAR_DEFAUT = ['migrations/**'];

/** Chemins modifiés qui relèvent d'un motif sensible. */
function cheminsSensibles(input: RuleInput): string[] {
  const motifs = paramStrings(input.config.params, 'pathPatterns', MOTIFS_PAR_DEFAUT);
  return input.pr.changedPaths.filter((chemin) => globMatchAny(motifs, chemin));
}

/** Verdict pour un ticket : plan de retour arrière présent ou non. */
function evaluateIssue(input: RuleInput, issue: IssueContext, sensibles: string[]): RuleOutcome {
  const etiquette = paramString(input.config.params, 'planLabel', 'rollback-plan');
  if (issue.rollbackPlanAttached === true || issue.labels.includes(etiquette)) {
    return { status: 'pass', reasons: [] };
  }
  return {
    status: 'fail',
    reasons: [
      ruleReason(
        input,
        'R-12',
        'r12.fail',
        'r12.action',
        { paths: sensibles.slice(0, 3).join(', '), issueKey: issue.key },
        issue.key,
      ),
    ],
  };
}

export const r12Chemins: Rule = {
  code: 'R-12',
  evaluate(input) {
    const sensibles = cheminsSensibles(input);
    if (sensibles.length === 0) return { status: 'pass', reasons: [] };
    return evaluateIssues(input, (issue) => evaluateIssue(input, issue, sensibles));
  },
};
