/**
 * Catalogue des règles (§8) : codes, niveaux par défaut, paramètres, lot de
 * livraison. Le moteur s'appuie sur ce catalogue pour régler une règle et pour
 * dire de quelles données elle a besoin ; l'interface d'administration y lit
 * les libellés et les champs à proposer.
 */
import type { MessageKey } from '../message/strings';
import type { Level, RuleCode } from '../types';

/** Lot de livraison : M = indispensable à la soumission, S = souhaitable, C = après. */
export type Lot = 'M' | 'S' | 'C';

export type ParamType = 'string' | 'string[]' | 'number' | 'boolean';

/** Un paramètre réglable d'une règle. */
export interface ParamSpec {
  name: string;
  type: ParamType;
  note: string;
}

/** Données qu'une règle doit recevoir pour être évaluée. */
export type RuleNeed =
  | 'issues'
  | 'freezes'
  | 'incidents'
  | 'service'
  | 'reviewers'
  | 'paths'
  | 'commits'
  | 'team';

export interface RuleDescriptor {
  code: RuleCode;
  lot: Lot;
  defaultLevel: Level;
  titleKey: MessageKey;
  needs: RuleNeed[];
  params: ParamSpec[];
}

/** Codes dans l'ordre du cahier des charges. */
export const RULE_CODES: RuleCode[] = [
  'R-01', 'R-02', 'R-03', 'R-04', 'R-05', 'R-06', 'R-07',
  'R-08', 'R-09', 'R-10', 'R-11', 'R-12', 'R-13',
];

export const RULE_CATALOG: Record<RuleCode, RuleDescriptor> = {
  'R-01': {
    code: 'R-01', lot: 'M', defaultLevel: 'warning', titleKey: 'rule.R-01', needs: ['issues', 'commits'],
    params: [
      { name: 'keyPattern', type: 'string', note: 'Motif de clé accepté (défaut : PROJETS-NUMERO).' },
      { name: 'branchExceptions', type: 'string[]', note: 'Branches exemptées de ticket (ex. hotfix/*).' },
    ],
  },
  'R-02': {
    code: 'R-02', lot: 'M', defaultLevel: 'blocking', titleKey: 'rule.R-02', needs: ['issues'],
    params: [{ name: 'allowedStatuses', type: 'string[]', note: 'Statuts autorisant la fusion.' }],
  },
  'R-03': {
    code: 'R-03', lot: 'M', defaultLevel: 'blocking', titleKey: 'rule.R-03', needs: ['issues'],
    params: [
      { name: 'source', type: 'string', note: 'Où lire les critères : description-checkboxes, customfield, subtasks.' },
      { name: 'fieldId', type: 'string', note: 'Identifiant du champ personnalisé si source = customfield.' },
    ],
  },
  'R-04': {
    code: 'R-04', lot: 'M', defaultLevel: 'blocking', titleKey: 'rule.R-04', needs: ['freezes'],
    params: [],
  },
  'R-05': {
    code: 'R-05', lot: 'M', defaultLevel: 'blocking', titleKey: 'rule.R-05', needs: ['incidents', 'service', 'issues'],
    params: [
      { name: 'jsmProjects', type: 'string[]', note: 'Projets JSM où chercher les incidents.' },
      { name: 'mappingSource', type: 'string', note: 'Correspondance dépôt → service : settings ou teamwork-graph.' },
    ],
  },
  'R-06': {
    code: 'R-06', lot: 'M', defaultLevel: 'blocking', titleKey: 'rule.R-06', needs: ['issues'],
    params: [{ name: 'linkTypes', type: 'string[]', note: 'Types de liens qui bloquent (ex. Blocks).' }],
  },
  'R-07': {
    code: 'R-07', lot: 'M', defaultLevel: 'warning', titleKey: 'rule.R-07', needs: ['issues'],
    params: [],
  },
  'R-08': {
    code: 'R-08', lot: 'S', defaultLevel: 'warning', titleKey: 'rule.R-08', needs: [],
    params: [
      { name: 'branches', type: 'string[]', note: 'Branches concernées (ex. main).' },
      { name: 'days', type: 'string[]', note: 'Jours calmes, au format ISO (mon…sun).' },
      { name: 'startHour', type: 'number', note: 'Heure de début de la plage calme (0-23).' },
      { name: 'endHour', type: 'number', note: 'Heure de fin de la plage calme (0-23).' },
      { name: 'timezone', type: 'string', note: 'Fuseau IANA de la plage (ex. Europe/Paris).' },
    ],
  },
  'R-09': {
    code: 'R-09', lot: 'S', defaultLevel: 'blocking', titleKey: 'rule.R-09', needs: ['issues'],
    params: [
      { name: 'label', type: 'string', note: 'Étiquette qui déclenche l’exigence (ex. security-review).' },
      { name: 'fieldId', type: 'string', note: 'Ou champ personnalisé portant l’exigence et son approbation.' },
    ],
  },
  'R-10': {
    code: 'R-10', lot: 'S', defaultLevel: 'warning', titleKey: 'rule.R-10', needs: ['reviewers', 'team', 'service'],
    params: [{ name: 'teamSource', type: 'string', note: 'Équipe propriétaire : settings ou teamwork-graph.' }],
  },
  'R-11': {
    code: 'R-11', lot: 'S', defaultLevel: 'information', titleKey: 'rule.R-11', needs: ['commits', 'issues'],
    params: [],
  },
  'R-12': {
    code: 'R-12', lot: 'C', defaultLevel: 'warning', titleKey: 'rule.R-12', needs: ['paths', 'issues'],
    params: [
      { name: 'pathPatterns', type: 'string[]', note: 'Chemins sensibles (ex. migrations/**).' },
      { name: 'planLabel', type: 'string', note: 'Étiquette ou champ attestant du plan de retour arrière.' },
    ],
  },
  'R-13': {
    code: 'R-13', lot: 'C', defaultLevel: 'warning', titleKey: 'rule.R-13', needs: ['issues'],
    params: [
      { name: 'linkTypes', type: 'string[]', note: 'Types de liens de dépendance amont.' },
      { name: 'deliveredStatuses', type: 'string[]', note: 'Statuts qui valent livraison.' },
    ],
  },
};

/** Vrai si la valeur est un code de règle du catalogue. */
export function isRuleCode(valeur: string): valeur is RuleCode {
  return (RULE_CODES as string[]).includes(valeur);
}

/** Descripteur d'une règle. */
export function descriptorFor(code: RuleCode): RuleDescriptor {
  return RULE_CATALOG[code];
}

/** Niveau par défaut d'une règle (§8). */
export function defaultLevelFor(code: RuleCode): Level {
  return RULE_CATALOG[code].defaultLevel;
}

/** Codes d'un lot donné, dans l'ordre du catalogue. */
export function ruleCodesForLot(lot: Lot): RuleCode[] {
  return RULE_CODES.filter((code) => RULE_CATALOG[code].lot === lot);
}

/** Les sept règles indispensables à la soumission (§6, lot M). */
export function mvpRuleCodes(): RuleCode[] {
  return ruleCodesForLot('M');
}
