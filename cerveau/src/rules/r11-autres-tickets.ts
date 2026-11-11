/**
 * R-11 — la PR ne référence pas d'autres tickets que le sien.
 *
 * Règle informative : elle rappelle les clés croisées trouvées dans la
 * branche, le titre ou les commits, sans bloquer par défaut.
 */
import { extractIssueKeys } from '../shared';
import type { Rule } from '../shared';
import { existingIssues, ruleReason } from './input';

export const r11AutresTickets: Rule = {
  code: 'R-11',
  evaluate(input) {
    const siens = existingIssues(input.issues).map((issue) => issue.key);
    const cles = extractIssueKeys({
      sourceBranch: input.pr.sourceBranch,
      title: input.pr.title,
      commitMessages: input.pr.commitMessages,
    });
    const autres = cles.filter((cle) => !siens.includes(cle));
    if (autres.length === 0) return { status: 'pass', reasons: [] };
    return {
      status: 'fail',
      reasons: [ruleReason(input, 'R-11', 'r11.info', undefined, { keys: autres.join(', ') })],
    };
  },
};
