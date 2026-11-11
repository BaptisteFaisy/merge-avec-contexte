/**
 * R-10 — un membre de l'équipe propriétaire du service a approuvé.
 *
 * L'équipe est fournie par les réglages (identifiants de comptes). Faute de
 * liste, la règle n'est pas évaluée : mieux vaut ne rien dire que bloquer à
 * tort.
 */
import { t } from '../shared';
import type { Rule } from '../shared';
import { paramString, paramStrings, ruleReason } from './input';

export const r10Equipe: Rule = {
  code: 'R-10',
  evaluate(input) {
    const equipe = paramStrings(input.config.params, 'team', []);
    if (equipe.length === 0) {
      return {
        status: 'not-evaluated',
        reasons: [],
        note: t(input.locale, 'r10.unknownTeam'),
      };
    }
    const nom = paramString(input.config.params, 'teamName', input.service ?? 'owners');
    const approuve = input.pr.reviewers.some(
      (relecteur) => relecteur.state === 'approved' && equipe.includes(relecteur.accountId),
    );
    if (approuve) return { status: 'pass', reasons: [] };
    return {
      status: 'fail',
      reasons: [ruleReason(input, 'R-10', 'r10.fail', 'r10.action', { team: nom })],
    };
  },
};
