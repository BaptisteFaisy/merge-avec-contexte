/**
 * Registre des règles : le moteur ne connaît que ce registre, jamais les
 * fichiers de règle un par un. Un code absent du registre est une règle non
 * implémentée : le moteur l'ignore sans lever.
 */
import { RULE_CODES } from '../shared';
import type { Rule, RuleCode } from '../shared';
import { r01TicketLie } from './r01-ticket-lie';
import { r02StatutAutorise } from './r02-statut';
import { r03Criteres } from './r03-criteres';
import { r04Gel } from './r04-gel';
import { r05Incident } from './r05-incident';
import { r06Liens } from './r06-liens';
import { r07Version } from './r07-version';
import { r08HeuresCalmes } from './r08-heures-calmes';
import { r09Securite } from './r09-securite';
import { r10Equipe } from './r10-equipe';
import { r11AutresTickets } from './r11-autres-tickets';
import { r12Chemins } from './r12-chemins';
import { r13Dependances } from './r13-dependances';

const REGISTRE = new Map<RuleCode, Rule>();

/** Enregistre des règles ; un code déjà présent est remplacé. */
export function registerRules(rules: Rule[]): void {
  for (const rule of rules) REGISTRE.set(rule.code, rule);
}

/** Règle d'un code, si elle est implémentée. */
export function ruleFor(code: RuleCode): Rule | undefined {
  return REGISTRE.get(code);
}

/** Codes effectivement implémentés, dans l'ordre du catalogue. */
export function implementedRuleCodes(): RuleCode[] {
  return RULE_CODES.filter((code) => REGISTRE.has(code));
}

registerRules([
  r01TicketLie,
  r02StatutAutorise,
  r03Criteres,
  r04Gel,
  r05Incident,
  r06Liens,
  r07Version,
  r08HeuresCalmes,
  r09Securite,
  r10Equipe,
  r11AutresTickets,
  r12Chemins,
  r13Dependances,
]);
