/**
 * R-08 — heures calmes : pas de fusion sur la branche principale hors plage.
 *
 * La plage autorisée est exprimée en jours et heures locales du fuseau réglé.
 * Hors plage, la règle avertit (niveau par défaut) ; l'administrateur peut la
 * passer en bloquant.
 */
import { globMatchAny, localParts } from '../shared';
import type { Rule } from '../shared';
import { paramNumber, paramString, paramStrings, ruleReason } from './input';

const JOURS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const BRANCHES_PAR_DEFAUT = ['main'];
const JOURS_PAR_DEFAUT = ['mon', 'tue', 'wed', 'thu', 'fri'];

/** Plage autorisée, lue dans les paramètres de la règle. */
interface Plage {
  jours: string[];
  debut: number;
  fin: number;
  fuseau: string;
}

function plage(params: Record<string, unknown>): Plage {
  return {
    jours: paramStrings(params, 'days', JOURS_PAR_DEFAUT).map((jour) => jour.toLowerCase()),
    debut: paramNumber(params, 'startHour', 8),
    fin: paramNumber(params, 'endHour', 18),
    fuseau: paramString(params, 'timezone', 'Europe/Paris'),
  };
}

/** Vrai si l'instant tombe dans la plage autorisée. */
function dansPlage(now: string, p: Plage): boolean | undefined {
  const instant = localParts(now, p.fuseau);
  if (!instant) return undefined;
  const jour = JOURS[instant.weekday] ?? '';
  if (!p.jours.includes(jour)) return false;
  return instant.minutes >= p.debut * 60 && instant.minutes < p.fin * 60;
}

export const r08HeuresCalmes: Rule = {
  code: 'R-08',
  evaluate(input) {
    const branches = paramStrings(input.config.params, 'branches', BRANCHES_PAR_DEFAUT);
    if (!globMatchAny(branches, input.pr.targetBranch)) return { status: 'pass', reasons: [] };
    const p = plage(input.config.params);
    const autorise = dansPlage(input.now, p);
    if (autorise === undefined) {
      return { status: 'not-evaluated', reasons: [], note: input.now };
    }
    if (autorise) return { status: 'pass', reasons: [] };
    return {
      status: 'fail',
      reasons: [
        ruleReason(input, 'R-08', 'r08.fail', 'r08.action', {
          branch: input.pr.targetBranch,
          window: `${p.debut} h – ${p.fin} h`,
        }),
      ],
    };
  },
};
