/**
 * R-02 — le ticket est dans un statut autorisant la fusion.
 *
 * Les statuts autorisés viennent du réglage (`allowedStatuses`) ; la
 * comparaison porte sur la catégorie Jira du statut, son identifiant ou son
 * libellé exact : le réglage peut ainsi nommer un statut dans la langue du
 * site, ou le désigner par sa catégorie (`inProgress`, `done`) et rester
 * valable quelle que soit cette langue. Un nom de statut mémorisé en français
 * (« En cours ») reconnaît le statut qu'un site anglophone appelle
 * « In Progress » : c'est le défaut relevé en production, où la liste blanche
 * française bloquait tout ticket réel.
 *
 * Par défaut, ce sont des **catégories** qui sont autorisées : un statut
 * ouvert ou en cours passe, un statut terminé bloque — quelle que soit la
 * langue du site.
 */
import type { IssueContext, Locale, Rule, RuleInput, RuleOutcome, StatusCategory } from '../shared';
import {
  categorieDEntree,
  categorieEffective,
  identifiantsTicket,
  STATUTS_AUTORISES_PAR_DEFAUT,
  statutCorrespond,
  t,
} from '../shared';
import { evaluateIssues, paramStrings, ruleReason } from './input';

/** Libellé d'une catégorie de statut, dans la langue du message. */
function libelleCategorie(categorie: StatusCategory, locale: Locale): string {
  const cle = categorie === 'toDo' ? 'categorie.toDo' : categorie === 'inProgress' ? 'categorie.inProgress' : 'categorie.done';
  return t(locale, cle);
}

/** Liste rendue pour le message : les catégories nommées, les autres telles quelles. */
function listeRendue(entrees: readonly string[], locale: Locale): string {
  return entrees
    .map((entree) => {
      const categorie = categorieDEntree(entree);
      return categorie ? libelleCategorie(categorie, locale) : entree;
    })
    .join(', ');
}

/** Verdict pour un ticket : statut autorisé ou non. */
function evaluateIssue(input: RuleInput, issue: IssueContext): RuleOutcome {
  const identifiants = identifiantsTicket(issue);
  const autorises = paramStrings(input.config.params, 'allowedStatuses', STATUTS_AUTORISES_PAR_DEFAUT);
  if (statutCorrespond(identifiants, autorises)) return { status: 'pass', reasons: [] };
  const categorie = categorieEffective(identifiants);
  const params = { issueKey: issue.key, status: issue.status, allowed: listeRendue(autorises, input.locale) };
  const raison = categorie
    ? ruleReason(
        input,
        'R-02',
        'r02.fail.category',
        'r02.action',
        { ...params, category: libelleCategorie(categorie, input.locale) },
        issue.key,
      )
    : ruleReason(input, 'R-02', 'r02.fail', 'r02.action', params, issue.key);
  return { status: 'fail', reasons: [raison] };
}

export const r02StatutAutorise: Rule = {
  code: 'R-02',
  evaluate: (input) => evaluateIssues(input, (issue) => evaluateIssue(input, issue)),
};
