/**
 * Textes utilisateur, en français et en anglais.
 *
 * Aucune règle, aucun composant ne rédige de message en dur : tout passe par
 * `t()` avec une clé de ce dictionnaire. La soumission au hackathon est en
 * anglais, l'espace de travail de démonstration en français.
 */
import type { Locale } from '../types';

const MESSAGES = {
  'verdict.blocked.one': { fr: 'Bloqué, 1 raison.', en: 'Blocked, 1 reason.' },
  'verdict.blocked.many': { fr: 'Bloqué, {count} raisons.', en: 'Blocked, {count} reasons.' },
  'verdict.allowed': { fr: 'Autorisé.', en: 'Allowed.' },
  'verdict.allowed.one': { fr: 'Autorisé, 1 avertissement : {text}', en: 'Allowed, 1 warning: {text}' },
  'verdict.allowed.many': { fr: 'Autorisé, {count} avertissements.', en: 'Allowed, {count} warnings.' },
  'verdict.inconclusive': {
    fr: 'Contexte indisponible, contrôle non concluant.',
    en: 'Context unavailable, check inconclusive.',
  },
  'verdict.fallback.open': {
    fr: 'Politique de repli : ouvert, la fusion reste possible.',
    en: 'Fallback policy: open, the merge is still allowed.',
  },
  'verdict.fallback.closed': {
    fr: 'Politique de repli : fermé, la fusion est bloquée.',
    en: 'Fallback policy: closed, the merge is blocked.',
  },
  'verdict.more': {
    fr: '…et {count} autre(s) raison(s) : voir la carte.',
    en: '…and {count} more reason(s): see the card.',
  },
  'verdict.card': {
    fr: 'Détail et dérogation : carte « Merge avec contexte » à droite.',
    en: 'Details and waiver: the "Merge with context" card on the right.',
  },
  'waiver.granted': {
    fr: 'Dérogation accordée par {by} jusqu’au {until} : {reason}',
    en: 'Waiver granted by {by} until {until}: {reason}',
  },
  'waiver.expired': {
    fr: 'Dérogation expirée le {until} : le contrôle échoue.',
    en: 'Waiver expired at {until}: the check fails.',
  },
  'rule.R-01': {
    fr: 'La PR est reliée à un ticket Jira existant',
    en: 'The pull request is linked to an existing Jira issue',
  },
  'rule.R-02': { fr: 'Le ticket est dans un statut autorisé', en: 'The issue is in an allowed status' },
  'rule.R-03': { fr: 'Les critères d’acceptation sont validés', en: 'Acceptance criteria are met' },
  'rule.R-04': {
    fr: 'Aucun gel en cours sur la branche cible',
    en: 'No active freeze on the target branch',
  },
  'rule.R-05': {
    fr: 'Aucun incident ouvert sur le service touché',
    en: 'No open incident on the affected service',
  },
  'rule.R-06': {
    fr: 'Le ticket n’est pas bloqué par un ticket ouvert',
    en: 'The issue is not blocked by an open issue',
  },
  'rule.R-07': {
    fr: 'La version cible du ticket n’est pas déjà publiée',
    en: 'The issue target version is not already released',
  },
  'rule.R-08': {
    fr: 'Heures calmes : pas de fusion sur la branche principale hors plage',
    en: 'Quiet hours: no merge into the main branch outside the window',
  },
  'rule.R-09': {
    fr: 'Revue de sécurité approuvée si le ticket la réclame',
    en: 'Security review approved when the issue requires it',
  },
  'rule.R-10': {
    fr: 'Un membre de l’équipe propriétaire du service a approuvé',
    en: 'A member of the service owner team approved',
  },
  'rule.R-11': {
    fr: 'La PR ne référence pas d’autres tickets que le sien',
    en: 'The pull request references no issue other than its own',
  },
  'rule.R-12': {
    fr: 'Fichiers sensibles : un plan de retour arrière est joint au ticket',
    en: 'Sensitive files: a rollback plan is attached to the issue',
  },
  'rule.R-13': { fr: 'Les dépendances amont sont livrées', en: 'Upstream dependencies are delivered' },
  'r01.missing': {
    fr: 'Aucun ticket Jira reconnu dans cette PR.',
    en: 'No Jira issue key found in this pull request.',
  },
  'r01.action': {
    fr: 'Nommez la branche ou le titre avec la clé du ticket (ex. PAY-123).',
    en: 'Name the branch or the title with the issue key (e.g. PAY-123).',
  },
  'r01.unknown': {
    fr: 'La clé {issueKey} ne correspond à aucun ticket du site jumelé.',
    en: 'Key {issueKey} matches no issue on the paired site.',
  },
  'r02.fail': {
    fr: '{issueKey} est au statut « {status} », attendu : {allowed}.',
    en: '{issueKey} is in status "{status}", expected: {allowed}.',
  },
  'r02.action': {
    fr: 'Amenez le ticket à un statut autorisé avant la fusion.',
    en: 'Move the issue to an allowed status before merging.',
  },
  'r03.fail': {
    fr: '{issueKey} : {count} critère(s) d’acceptation non coché(s).',
    en: '{issueKey}: {count} acceptance criteria not checked.',
  },
  'r03.action': {
    fr: 'Cochez dans le ticket les critères vraiment validés.',
    en: 'Check in the issue the criteria that are truly met.',
  },
  'r04.fail': { fr: 'Gel « {name} » sur {branch} jusqu’au {until}.', en: 'Freeze "{name}" on {branch} until {until}.' },
  'r04.action': {
    fr: 'Attendez la fin du gel ou demandez une dérogation.',
    en: 'Wait for the freeze to end or request a waiver.',
  },
  'r05.fail': { fr: 'Incident {incidentKey} ouvert sur {service}.', en: 'Incident {incidentKey} open on {service}.' },
  'r05.action': {
    fr: 'Ne fusionnez pas sur ce service pendant l’incident, sauf correctif lié à celui-ci.',
    en: 'Do not merge into this service during the incident, unless the fix is linked to it.',
  },
  'r05.unknownService': {
    fr: 'Service inconnu pour ce dépôt, règle non évaluée.',
    en: 'Service unknown for this repository, rule not evaluated.',
  },
  'r05.incidentFix': {
    fr: 'Correctif d’incident {incidentKey} : la fusion reste autorisée.',
    en: 'Incident fix {incidentKey}: the merge stays allowed.',
  },
  'r06.fail': {
    fr: '{issueKey} est bloqué par {targetKey} ({status}).',
    en: '{issueKey} is blocked by {targetKey} ({status}).',
  },
  'r06.action': {
    fr: 'Livrez d’abord {targetKey}, ou demandez une dérogation.',
    en: 'Deliver {targetKey} first, or request a waiver.',
  },
  'r07.fail': {
    fr: 'La version {version} de {issueKey} est déjà publiée.',
    en: 'Version {version} of {issueKey} is already released.',
  },
  'r07.action': {
    fr: 'Déplacez le ticket sur la prochaine version.',
    en: 'Move the issue to the next version.',
  },
  'r08.fail': {
    fr: 'Fusion sur {branch} hors des heures autorisées ({window}).',
    en: 'Merge into {branch} outside the allowed hours ({window}).',
  },
  'r08.action': {
    fr: 'Attendez la plage autorisée ou demandez une dérogation.',
    en: 'Wait for the allowed window or request a waiver.',
  },
  'r09.fail': {
    fr: '{issueKey} exige une revue de sécurité, elle n’est pas approuvée.',
    en: '{issueKey} requires a security review, which is not approved.',
  },
  'r09.action': {
    fr: 'Faites approuver la revue de sécurité avant la fusion.',
    en: 'Get the security review approved before merging.',
  },
  'r10.fail': {
    fr: 'Aucun membre de l’équipe {team} n’a approuvé cette PR.',
    en: 'No member of team {team} approved this pull request.',
  },
  'r10.action': {
    fr: 'Demandez une relecture à l’équipe propriétaire du service.',
    en: 'Ask the service owner team to review.',
  },
  'r10.unknownTeam': {
    fr: 'Équipe propriétaire inconnue pour ce dépôt, règle non évaluée.',
    en: 'Owner team unknown for this repository, rule not evaluated.',
  },
  'r11.info': {
    fr: 'La PR référence d’autres tickets : {keys}.',
    en: 'The pull request references other issues: {keys}.',
  },
  'r12.fail': {
    fr: 'Fichiers sensibles modifiés ({paths}) sans plan de retour arrière sur {issueKey}.',
    en: 'Sensitive files changed ({paths}) without a rollback plan on {issueKey}.',
  },
  'r12.action': {
    fr: 'Joignez un plan de retour arrière au ticket.',
    en: 'Attach a rollback plan to the issue.',
  },
  'r13.fail': {
    fr: 'Dépendance amont non livrée : {targetKey} ({status}).',
    en: 'Upstream dependency not delivered: {targetKey} ({status}).',
  },
  'r13.action': { fr: 'Attendez la livraison de {targetKey}.', en: 'Wait for {targetKey} to be delivered.' },
} as const;

export type MessageKey = keyof typeof MESSAGES;

/** Remplace les `{param}` d'un gabarit par les valeurs fournies. */
function interpoler(gabarit: string, params: Record<string, string | number>): string {
  return gabarit.replace(/\{(\w+)\}/g, (motif, nom: string) =>
    Object.prototype.hasOwnProperty.call(params, nom) ? String(params[nom]) : motif,
  );
}

/** Rend un message dans la langue demandée. */
export function t(locale: Locale, key: MessageKey, params: Record<string, string | number> = {}): string {
  return interpoler(MESSAGES[key][locale], params);
}

/** Les clés disponibles, pour les contrôles et la documentation. */
export function messageKeys(): MessageKey[] {
  return Object.keys(MESSAGES) as MessageKey[];
}
