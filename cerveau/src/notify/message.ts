/**
 * Corps du commentaire de blocage (audit item 18) : logique pure.
 *
 * Le commentaire reprend le message au format du §9 — nombre de raisons
 * d'abord, une ligne par raison, la plus grave en premier, renvoi vers la
 * carte — avec la marche à suivre de chaque raison (`includeActions`). Il est
 * rédigé par le contrat partagé (`formatEvaluation`) : jamais de texte en dur
 * ici, le français et l'anglais viennent du dictionnaire commun.
 */
import { formatEvaluation, type Evaluation, type Locale } from '../shared';

/** Corps du commentaire Jira : message du §9 + marche à suivre par raison. */
export function corpsCommentaire(evaluation: Evaluation, locale: Locale): string {
  return formatEvaluation(evaluation, { locale, includeActions: true });
}
