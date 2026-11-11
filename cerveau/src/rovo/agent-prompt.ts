/**
 * Prompt de l'agent Rovo « Merge avec contexte » (§11).
 *
 * Repris du manifeste (`cerveau/manifest.yml`, module `rovo:agent`) et affiné :
 * l'agent ne répond jamais d'après une supposition, il appelle une des six
 * actions et cite ce qu'elle rend. Les amorces de conversation sont les
 * questions du cahier des charges, dans la langue de l'espace de travail.
 *
 * Aucune clé `tool.*` n'existe dans `shared/src/message/strings.ts` : les
 * descriptions d'outils sont donc écrites ici, en français et en anglais.
 */
import type { Locale } from '../shared';
import { phrase } from './deps';

/** Les six clés d'actions déclarées au manifeste. */
export type CleOutil =
  | 'evaluate-merge'
  | 'explain-block'
  | 'list-freezes'
  | 'list-waivers'
  | 'list-approvers'
  | 'request-waiver';

/** Ordre de présentation : l'évaluation d'abord, la demande en dernier. */
export const CLES_OUTILS: CleOutil[] = [
  'evaluate-merge',
  'explain-block',
  'list-freezes',
  'list-waivers',
  'list-approvers',
  'request-waiver',
];

/** Consigne système de l'agent, par langue. */
const PROMPTS: Record<Locale, string> = {
  fr: [
    'Tu réponds aux questions sur les fusions de pull requests et leur contexte :',
    'ticket Jira lié, critères d’acceptation, gels de déploiement, incidents en cours,',
    'dépendances et versions.',
    '',
    'Tu t’appuies toujours sur les actions fournies (evaluate-merge, explain-block,',
    'list-freezes, list-waivers, list-approvers, request-waiver) et jamais sur une',
    'supposition : si une action ne répond pas, tu dis que le contexte est indisponible.',
    '',
    'Tu expliques chaque blocage avec la règle concernée, l’objet visé (ticket, gel,',
    'incident) et l’action attendue pour débloquer. Tu ne cites jamais un code de règle',
    'seul : tu le nommes (« les critères d’acceptation ne sont pas cochés »).',
    '',
    'Tu ne promets pas une dérogation : list-approvers dit qui peut l’accorder sans rien',
    'enregistrer, request-waiver enregistre une demande, ce sont les approbateurs qui',
    'accordent. Tu réponds dans la langue de l’utilisateur.',
  ].join('\n'),
  en: [
    'You answer questions about pull request merges and their context: the linked Jira',
    'issue, acceptance criteria, deployment freezes, open incidents, dependencies and',
    'versions.',
    '',
    'You always rely on the provided actions (evaluate-merge, explain-block,',
    'list-freezes, list-waivers, list-approvers, request-waiver) and never on a guess: if',
    'an action does not answer, you say the context is unavailable.',
    '',
    'You explain every block with the rule involved, the object concerned (issue,',
    'freeze, incident) and the action needed to unblock. You never quote a bare rule',
    'code: you name the rule ("the acceptance criteria are not checked").',
    '',
    'You never promise a waiver: list-approvers tells who can grant one without recording',
    'anything, request-waiver records a request, approvers grant it. You answer in the',
    'user’s language.',
  ].join('\n'),
};

/** Questions d’ouverture proposées par l’agent (§11). */
const AMORCES: Record<Locale, string[]> = {
  fr: [
    'Pourquoi la PR de PAY-123 est-elle bloquée ?',
    'Puis-je fusionner PAY-123 maintenant ?',
    'Quels gels sont prévus cette semaine ?',
    'Qui peut m’accorder une dérogation ?',
  ],
  en: [
    'Why is the PAY-123 pull request blocked?',
    'Can I merge PAY-123 right now?',
    'Which freezes are planned this week?',
    'Who can grant me a waiver?',
  ],
};

/** Une phrase d’aide par outil, dans les deux langues. */
const DESCRIPTIONS: Record<CleOutil, { fr: string; en: string }> = {
  'evaluate-merge': {
    fr: 'Évalue à blanc les règles de contexte d’un ticket : dit si la fusion passerait, avec les raisons et la marche à suivre.',
    en: 'Dry-runs the context rules for an issue: says whether the merge would pass, with reasons and next steps.',
  },
  'explain-block': {
    fr: 'Reprend la dernière évaluation réelle des PR d’un ticket et explique le blocage, raison par raison.',
    en: 'Replays the latest real evaluation of an issue’s pull requests and explains the block, reason by reason.',
  },
  'list-freezes': {
    fr: 'Liste les gels de déploiement en cours et à venir, avec la fin de chaque gel déjà rédigée.',
    en: 'Lists current and upcoming deployment freezes, with each freeze end already formatted.',
  },
  'list-waivers': {
    fr: 'Liste les dérogations en cours d’un ticket : règle, statut, qui a accordé, motif et échéance.',
    en: 'Lists an issue’s live waivers: rule, status, who granted it, reason and expiry.',
  },
  'list-approvers': {
    fr: 'Nomme les personnes habilitées à accorder une dérogation, pour un ticket ou pour l’installation. Lecture seule : rien n’est enregistré.',
    en: 'Names the people who can grant a waiver, for an issue or for the whole site. Read-only: nothing is recorded.',
  },
  'request-waiver': {
    fr: 'Enregistre une demande de dérogation (règle, motif, durée de 1 à 72 h) et rend les approbateurs à notifier.',
    en: 'Records a waiver request (rule, reason, 1 to 72 hours) and returns the approvers to notify.',
  },
};

/** Prompt système de l’agent, dans la langue demandée. */
export function promptAgent(locale: Locale = 'fr'): string {
  return PROMPTS[locale];
}

/** Amorces de conversation, dans la langue demandée. */
export function amorcesConversation(locale: Locale = 'fr'): string[] {
  return [...AMORCES[locale]];
}

/** Vrai si la valeur est une clé d’outil connue. */
export function estCleOutil(valeur: string): valeur is CleOutil {
  return (CLES_OUTILS as string[]).includes(valeur);
}

/** Phrase d’aide d’un outil, pour l’agent et la documentation MCP. */
export function descriptionOutil(cle: CleOutil, locale: Locale = 'fr'): string {
  const description = DESCRIPTIONS[cle];
  return phrase(locale, description.fr, description.en);
}

/** Les cinq descriptions, dans l’ordre des outils : bloc prêt pour un prompt. */
export function catalogueOutils(locale: Locale = 'fr'): string[] {
  return CLES_OUTILS.map((cle) => `- ${cle} : ${descriptionOutil(cle, locale)}`);
}
