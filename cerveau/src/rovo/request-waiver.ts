/**
 * Action `request-waiver` (§11, MC-07) : enregistre une demande de dérogation
 * et rend les approbateurs à notifier.
 *
 * Une entrée invalide n'est jamais une exception : l'action rend un refus
 * structuré (`ok: false`) avec un message déjà rédigé, pour qu'un agent MCP
 * puisse le répéter tel quel à l'utilisateur.
 */
import { isRuleCode } from '../shared';
import type { Locale, RuleCode, WaiverStatus } from '../shared';
import { ActionInputError, cleTicket, phrase, texte } from './deps';
import type { Approver, RovoDeps } from './deps';

/** Un approbateur à notifier, mis à plat pour la sortie JSON. */
export interface ApprobateurSortie {
  accountId: string;
  displayName: string;
}

/** Demande acceptée : la dérogation est en statut `requested`. */
export interface DemandeAcceptee {
  ok: true;
  waiverId: string;
  status: WaiverStatus;
  expiresAt: string;
  /** Approbateurs notifiés par la demande. */
  approvers: ApprobateurSortie[];
}

/** Demande refusée : champ fautif et message lisible, rien n'est enregistré. */
export interface DemandeRefusee {
  ok: false;
  field: string;
  error: string;
}

/** Sortie de l'action : acceptée ou refusée, jamais les deux. */
export type RequestWaiverOutput = DemandeAcceptee | DemandeRefusee;

/** Bornes de durée d'une dérogation, en heures (§11). */
export const DUREE_MIN = 1;
export const DUREE_MAX = 72;
const MOTIF_MAX = 500;

/** Code de règle du catalogue, en majuscules ; refus lisible sinon. */
export function validerCode(valeur: unknown, locale: Locale): RuleCode {
  const code = texte(valeur).toUpperCase();
  if (isRuleCode(code)) return code;
  throw new ActionInputError(
    'ruleCode',
    phrase(
      locale,
      `Code de règle inconnu « ${code === '' ? '—' : code} » : attendu R-01 à R-13.`,
      `Unknown rule code "${code === '' ? '—' : code}": expected R-01 to R-13.`,
    ),
  );
}

/** Durée en heures : entier de 1 à 72 ; refus lisible sinon. */
export function validerDuree(valeur: unknown, locale: Locale): number {
  const nombre = typeof valeur === 'number' ? valeur : Number(texte(valeur));
  const valide = Number.isInteger(nombre) && nombre >= DUREE_MIN && nombre <= DUREE_MAX;
  if (valide) return nombre;
  throw new ActionInputError(
    'hours',
    phrase(
      locale,
      `La durée doit être un nombre entier d’heures entre ${DUREE_MIN} et ${DUREE_MAX}.`,
      `The duration must be a whole number of hours between ${DUREE_MIN} and ${DUREE_MAX}.`,
    ),
  );
}

/** Motif : non vide, borné en longueur ; refus lisible sinon. */
export function validerMotif(valeur: unknown, locale: Locale): string {
  const motif = texte(valeur);
  if (motif === '') {
    throw new ActionInputError(
      'reason',
      phrase(locale, 'Le motif de la dérogation est requis.', 'The waiver reason is required.'),
    );
  }
  if (motif.length > MOTIF_MAX) {
    throw new ActionInputError(
      'reason',
      phrase(
        locale,
        `Le motif dépasse ${MOTIF_MAX} caractères : résumez-le.`,
        `The reason exceeds ${MOTIF_MAX} characters: summarise it.`,
      ),
    );
  }
  return motif;
}

/** Échéance ISO d'une demande de `heures`, à partir de l'instant injecté. */
export function echeance(now: string, heures: number): string {
  return new Date(Date.parse(now) + heures * 3_600_000).toISOString();
}

/** Approbateurs du ticket, prêts pour la sortie. */
function approbateurs(liste: Approver[]): ApprobateurSortie[] {
  return liste.map((approbateur) => ({
    accountId: approbateur.accountId,
    displayName: approbateur.displayName,
  }));
}

/** Enregistre la demande validée et rend la réponse d'acceptation. */
async function enregistrer(
  deps: RovoDeps,
  issueKey: string,
  rule: RuleCode,
  reason: string,
  hours: number,
): Promise<DemandeAcceptee> {
  const requestedAt = deps.clock.now();
  const expiresAt = echeance(requestedAt, hours);
  const waiver = await deps.waivers.createRequest({ issueKey, rule, reason, requestedAt, expiresAt });
  const notifies = approbateurs(await deps.approvers.list(issueKey));
  deps.logger.info('request-waiver', { issueKey, rule, hours, waiverId: waiver.id });
  return {
    ok: true,
    waiverId: waiver.id,
    status: waiver.status,
    expiresAt: waiver.expiresAt ?? expiresAt,
    approvers: notifies,
  };
}

/** Action `request-waiver` : `issueKey`, `ruleCode`, `reason`, `hours`. */
export async function runRequestWaiver(
  deps: RovoDeps,
  payload: Record<string, unknown>,
): Promise<RequestWaiverOutput> {
  const locale = deps.locale;
  try {
    const issueKey = cleTicket(payload.issueKey, locale);
    const rule = validerCode(payload.ruleCode, locale);
    const reason = validerMotif(payload.reason, locale);
    const hours = validerDuree(payload.hours, locale);
    return await enregistrer(deps, issueKey, rule, reason, hours);
  } catch (erreur) {
    if (!(erreur instanceof ActionInputError)) throw erreur;
    deps.logger.warn('request-waiver refusé', { field: erreur.champ });
    return { ok: false, field: erreur.champ, error: erreur.message };
  }
}
