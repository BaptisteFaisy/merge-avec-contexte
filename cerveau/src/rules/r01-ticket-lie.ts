/**
 * R-01 — la PR est reliée à un ticket Jira existant.
 *
 * La clé est cherchée dans la branche source, puis le titre, puis les
 * messages de commit (helper partagé). Une clé trouvée mais inconnue du site
 * jumelé compte comme absente, avec un message distinct (§17).
 *
 * La règle ne parle qu'une fois par PR : le pire résultat l'emporte (§17),
 * donc une PR sans aucune clé connue est signalée une seule fois — jamais deux,
 * même quand plusieurs clés sont citées ou inconnues.
 */
import { extractIssueKeys, globMatch, globMatchAny } from '../shared';
import type { Rule, RuleInput, RuleOutcome } from '../shared';
import { existingIssues, paramString, paramStrings, ruleReason, strictestOutcome } from './input';

/** Vrai si la branche source est exemptée de ticket (hotfix, par exemple). */
function brancheExemptee(input: RuleInput): boolean {
  const exceptions = paramStrings(input.config.params, 'branchExceptions', []);
  return exceptions.length > 0 && globMatchAny(exceptions, input.pr.sourceBranch);
}

/** Clés citées par la PR, restricted au motif réglé (toutes si aucun motif). */
function clesRetenues(input: RuleInput): string[] {
  const cles = extractIssueKeys({
    sourceBranch: input.pr.sourceBranch,
    title: input.pr.title,
    commitMessages: input.pr.commitMessages,
  });
  const motif = paramString(input.config.params, 'keyPattern', '');
  return motif.length === 0 ? cles : cles.filter((cle) => globMatch(motif, cle));
}

/** R-01 pour une clé : passe si le ticket existe, sinon « clé inconnue ». */
function resultatDeCle(input: RuleInput, cle: string, connus: Set<string>): RuleOutcome {
  if (connus.has(cle)) return { status: 'pass', reasons: [] };
  return {
    status: 'fail',
    reasons: [ruleReason(input, 'R-01', 'r01.unknown', 'r01.action', { issueKey: cle }, cle)],
  };
}

export const r01TicketLie: Rule = {
  code: 'R-01',
  evaluate(input) {
    if (brancheExemptee(input)) return { status: 'pass', reasons: [] };
    const retenues = clesRetenues(input);
    if (retenues.length === 0) {
      return { status: 'fail', reasons: [ruleReason(input, 'R-01', 'r01.missing', 'r01.action')] };
    }
    const connus = new Set(existingIssues(input.issues).map((issue) => issue.key));
    return strictestOutcome(retenues.map((cle) => resultatDeCle(input, cle, connus)));
  },
};
