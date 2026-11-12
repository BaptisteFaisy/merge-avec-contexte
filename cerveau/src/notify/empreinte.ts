/**
 * Empreinte d'un blocage (audit item 18) : logique pure, sans Forge.
 *
 * Le garde-fou exige « au plus un commentaire par ticket et par ensemble de
 * raisons ». L'empreinte identifie cet ensemble : le ticket, puis les raisons
 * qui bloquent réellement (ni observées, ni dérogées), triées pour que l'ordre
 * d'évaluation ne change rien. Tant que les mêmes raisons bloquent, l'empreinte
 * est stable et le commentaire n'est pas répété ; dès qu'une raison change
 * (critère coché, incident clos puis rouvert, gel ajouté), l'empreinte change
 * et un nouveau commentaire est légitime.
 */
import { blockingReasons, type Evaluation, type Reason } from '../shared';

/** Hachage déterministe djb2, rendu en base 36 : court, stable, sans dépendance. */
export function hacher(texte: string): string {
  let h = 5381;
  for (let i = 0; i < texte.length; i += 1) {
    h = ((h << 5) + h + texte.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

/** Signature stable d'une raison : code de règle, ticket visé et texte. */
function signature(raison: Reason): string {
  return [raison.rule, raison.issueKey ?? '', raison.text].join('|');
}

/** Raisons réellement bloquantes, triées : l'ensemble qui définit l'empreinte. */
export function raisonsBloquantesTriees(evaluation: Evaluation): Reason[] {
  return blockingReasons(evaluation).slice().sort((a, b) => signature(a).localeCompare(signature(b)));
}

/** Empreinte du blocage d'un ticket : `ticket + ensemble de raisons`. */
export function empreinteBlocage(cleTicket: string, evaluation: Evaluation): string {
  const raisons = raisonsBloquantesTriees(evaluation).map(signature).join(';');
  return hacher(`${cleTicket}#${raisons}`);
}
