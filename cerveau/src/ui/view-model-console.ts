/**
 * Écran 6 — console de test (§12, écran 6 ; recette §18-7).
 *
 * Le formulaire (ticket, branche cible, dépôt) et l'aperçu du message. L'aperçu
 * passe par `formatEvaluation`, exactement comme le contrôle réel : c'est ce qui
 * garantit que la console montre le texte que Bitbucket affichera.
 *
 * Module **pur** : aucune dépendance Forge.
 */
import { formatEvaluation } from '../shared/message/format';
import type { Evaluation, Locale, Verdict } from '../shared/types';
import { libelleVerdict } from './view-model-commun';
import type { Option } from './view-model-commun';

export interface EntreeConsole {
  locale: Locale;
  ticket?: string;
  brancheCible?: string;
  depot?: string;
  depotsDisponibles?: string[];
  branchesDisponibles?: string[];
  /** Évaluation à blanc calculée par le resolver ; absente = pas encore d'aperçu. */
  evaluation?: Evaluation;
}

export interface VueFormulaire {
  ticket: string;
  brancheCible: string;
  depot: string;
  depotOptions: Option<string>[];
  brancheOptions: Option<string>[];
  /** Vrai quand le ticket et le dépôt sont renseignés : le formulaire est lançable. */
  complet: boolean;
}

export interface VueApercu {
  /** Le message exact que Bitbucket affichera (§9, recette §18-7). */
  message: string;
  /** Le booléen `success` renvoyé au merge check. */
  success: boolean;
  verdict: Verdict;
  verdictLabel: string;
}

export interface VueConsole {
  formulaire: VueFormulaire;
  apercu: VueApercu | null;
}

/** Options d'un `Select` à partir d'une liste de valeurs. */
function optionsDe(valeurs: string[] | undefined, courant: string): Option<string>[] {
  const liste = [...(valeurs ?? [])];
  if (courant && !liste.includes(courant)) liste.unshift(courant);
  return liste.map((value) => ({ value, label: value }));
}

/** Le merge check passe-t-il ? Un repli « ouvert » laisse passer, « fermé » bloque. */
function succes(evaluation: Evaluation): boolean {
  if (evaluation.verdict === 'blocked') return false;
  if (evaluation.verdict === 'allowed') return true;
  return evaluation.fallback !== 'closed';
}

/** Le formulaire, valeurs nettoyées et listes proposées. */
function formulaire(entree: EntreeConsole, ticket: string, brancheCible: string, depot: string): VueFormulaire {
  return {
    ticket,
    brancheCible,
    depot,
    depotOptions: optionsDe(entree.depotsDisponibles, depot),
    brancheOptions: optionsDe(entree.branchesDisponibles, brancheCible),
    complet: ticket.length > 0 && depot.length > 0,
  };
}

/** L'aperçu d'une évaluation, dans la langue de l'écran. */
function apercu(evaluation: Evaluation, locale: Locale): VueApercu {
  return {
    message: formatEvaluation(evaluation, { locale }),
    success: succes(evaluation),
    verdict: evaluation.verdict,
    verdictLabel: libelleVerdict(locale, evaluation.verdict),
  };
}

/** Écran 6 — console de test : formulaire et aperçu du message réel. */
export function vmConsole(entree: EntreeConsole): VueConsole {
  const ticket = (entree.ticket ?? '').trim();
  const brancheCible = (entree.brancheCible ?? '').trim();
  const depot = (entree.depot ?? '').trim();
  return {
    formulaire: formulaire(entree, ticket, brancheCible, depot),
    apercu: entree.evaluation ? apercu(entree.evaluation, entree.locale) : null,
  };
}
