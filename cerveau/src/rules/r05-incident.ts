/**
 * R-05 — aucun incident ouvert sur le service touché.
 *
 * Voie rapide des correctifs (§7.2, MC-12) : si le ticket de la PR est lié à
 * l'incident, la fusion reste autorisée et la raison devient informative.
 * Sans correspondance dépôt → service, la règle n'est pas évaluée et le dit.
 */
import { t } from '../shared';
import type { Incident, Rule, RuleInput } from '../shared';
import { openIncidentsFor, ruleReason } from './input';

/** Vrai si le ticket de la PR est rattaché à cet incident. */
function lieAIncident(input: RuleInput, incident: Incident): boolean {
  return input.issues.some((issue) => issue.incidentKeys.includes(incident.incidentKey));
}

export const r05Incident: Rule = {
  code: 'R-05',
  evaluate(input) {
    if (input.service === undefined) {
      return { status: 'not-evaluated', reasons: [], note: t(input.locale, 'r05.unknownService') };
    }
    const ouverts = openIncidentsFor(input.incidents, input.service, input.now);
    if (ouverts.length === 0) return { status: 'pass', reasons: [] };
    const service = input.service;
    const correctifs = ouverts.filter((incident) => lieAIncident(input, incident));
    const bloquants = ouverts.filter((incident) => !lieAIncident(input, incident));
    return {
      status: bloquants.length === 0 ? 'pass' : 'fail',
      reasons: [
        ...bloquants.map((incident) =>
          ruleReason(input, 'R-05', 'r05.fail', 'r05.action', {
            incidentKey: incident.incidentKey,
            service,
          })),
        ...correctifs.map((incident) =>
          ruleReason(
            input,
            'R-05',
            'r05.incidentFix',
            undefined,
            { incidentKey: incident.incidentKey },
            undefined,
            'information',
          )),
      ],
    };
  },
};
