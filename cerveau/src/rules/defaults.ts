/**
 * Réglages par défaut des treize règles (§8) : niveau du catalogue, mode
 * actif, portée vide (partout) et paramètres raisonnables pour un espace de
 * travail francophone qui vient d'installer l'app.
 */
import { RULE_CODES, defaultLevelFor } from '../shared';
import type { RuleCode, RuleConfig } from '../shared';

/** Paramètres par défaut, règle par règle. */
const PARAMS: Record<RuleCode, Record<string, unknown>> = {
  'R-01': { keyPattern: '', branchExceptions: [] },
  'R-02': { allowedStatuses: ['In Progress', 'In Review', 'Done'] },
  'R-03': { source: 'description-checkboxes', fieldId: '' },
  'R-04': {},
  'R-05': { jsmProjects: [], mappingSource: 'settings' },
  'R-06': { linkTypes: ['Blocks', 'bloque'], deliveredStatuses: ['Done', 'Closed', 'Terminé', 'Fermé'] },
  'R-07': {},
  'R-08': {
    branches: ['main'],
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    startHour: 8,
    endHour: 18,
    timezone: 'Europe/Paris',
  },
  'R-09': { label: 'security-review', fieldId: '' },
  'R-10': { teamSource: 'settings', team: [], teamName: '' },
  'R-11': {},
  'R-12': { pathPatterns: ['migrations/**'], planLabel: 'rollback-plan' },
  'R-13': { linkTypes: ['Depends on', 'dépend de'], deliveredStatuses: ['Done', 'Closed', 'Terminé', 'Fermé'] },
};

/** Les treize réglages par défaut, dans l'ordre du catalogue. */
export function defaultRuleConfigs(): RuleConfig[] {
  return RULE_CODES.map((code) => ({
    rule: code,
    level: defaultLevelFor(code),
    mode: 'active' as const,
    scope: {},
    params: { ...PARAMS[code] },
  }));
}
