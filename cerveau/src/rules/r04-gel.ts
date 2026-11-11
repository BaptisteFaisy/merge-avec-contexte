/**
 * R-04 — aucun gel en cours sur la branche cible.
 *
 * Le calcul des gels actifs (branche, service, récurrence, fuseau) est
 * partagé : la règle ne fait que traduire chaque gel en raison lisible.
 */
import { activeFreezes, describeFreezeEnd } from '../shared';
import type { Rule } from '../shared';
import { ruleReason } from './input';

export const r04Gel: Rule = {
  code: 'R-04',
  evaluate(input) {
    const actifs = activeFreezes(input.freezes, {
      targetBranch: input.pr.targetBranch,
      service: input.service,
      now: input.now,
    });
    if (actifs.length === 0) return { status: 'pass', reasons: [] };
    return {
      status: 'fail',
      reasons: actifs.map((gel) =>
        ruleReason(input, 'R-04', 'r04.fail', 'r04.action', {
          name: gel.name,
          branch: input.pr.targetBranch,
          until: describeFreezeEnd(gel, input.locale),
        })),
    };
  },
};
