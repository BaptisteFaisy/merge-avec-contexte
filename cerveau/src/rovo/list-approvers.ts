/**
 * Action `list-approvers` (§11) : qui peut m'accorder une dérogation ?
 *
 * L'amorce de conversation « Qui peut m'accorder une dérogation ? » n'avait
 * aucune action en lecture seule pour y répondre : seul `request-waiver`
 * rendait les approbateurs, en enregistrant une demande au passage. Cette
 * action répond à la question sans aucun effet de bord — rien n'est écrit,
 * aucune notification n'est envoyée — et un agent MCP peut donc l'appeler
 * librement, y compris depuis une règle d'automatisation (`actionVerb: GET`).
 *
 * La clé de ticket est optionnelle : sans elle, l'action rend l'annuaire
 * configuré pour l'installation ; avec elle, l'annuaire du ticket, tel que
 * `request-waiver` le notifierait.
 */
import type { Locale } from '../shared';
import { phrase, texte } from './deps';
import type { RovoDeps } from './deps';
import { approbateurSortie } from './request-waiver';
import type { ApprobateurSortie } from './request-waiver';

/** Sortie de l'action : sérialisable telle quelle, jamais d'`undefined`. */
export interface ListApproversOutput {
  /** Ticket visé, ou `null` quand la question porte sur l'installation. */
  issueKey: string | null;
  /** Personnes habilitées à accorder une dérogation. */
  approvers: ApprobateurSortie[];
  /** Réponse déjà rédigée, dans la langue de l'espace de travail. */
  summary: string;
}

/** Phrase de synthèse : qui accorde, pour quel ticket, ou personne. */
function synthese(locale: Locale, issueKey: string | null, approbateurs: ApprobateurSortie[]): string {
  if (approbateurs.length === 0) {
    return phrase(
      locale,
      'Aucun approbateur n’est configuré : la liste se règle dans les réglages du projet Jira.',
      'No approver is configured: the list is set in the Jira project settings.',
    );
  }
  const noms = approbateurs.map((approbateur) => approbateur.displayName);
  const cible = issueKey === null ? '' : phrase(locale, ` pour ${issueKey}`, ` for ${issueKey}`);
  return phrase(
    locale,
    `${noms.join(', ')} peut accorder une dérogation${cible}.`,
    `${noms.join(', ')} can grant a waiver${cible}.`,
  );
}

/** Action `list-approvers` : entrée `issueKey` optionnelle, aucun effet de bord. */
export async function runListApprovers(
  deps: RovoDeps,
  payload: Record<string, unknown>,
): Promise<ListApproversOutput> {
  const locale: Locale = deps.locale;
  const brut = texte(payload.issueKey);
  const issueKey = brut === '' ? null : brut.toUpperCase();
  const lus = await deps.approvers.list(issueKey ?? '');
  const approvers = lus.map(approbateurSortie);
  deps.logger.info('list-approvers', { issueKey: issueKey ?? '', count: approvers.length });
  return { issueKey, approvers, summary: synthese(locale, issueKey, approvers) };
}
