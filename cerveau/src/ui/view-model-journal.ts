/**
 * Écran 7 — journal (§12, écran 7).
 *
 * Évaluations horodatées, statistiques (volume par verdict, durée moyenne) et
 * rapport d'observation « ce qui aurait été bloqué » (§7.3, MC-13).
 *
 * Module **pur** : aucune dépendance Forge, aucune lecture d'heure.
 */
import type { Evaluation, Locale, Verdict } from '../shared/types';
import { libelleVerdict, raisonsSimples } from './view-model-commun';
import type { VueRaison } from './view-model-commun';

export interface EvaluationJournalisee {
  depot: string;
  prId: number;
  evaluation: Evaluation;
}

export interface Observation {
  observed: number;
  wouldHaveBlocked: number;
  byRepository?: Array<{ depot: string; bloquees: number }>;
}

export interface EntreeJournal {
  locale: Locale;
  evaluations?: EvaluationJournalisee[];
  observation?: Observation;
}

export interface VueLigneJournal {
  evaluatedAt: string;
  depot: string;
  prId: number;
  verdict: Verdict;
  verdictLabel: string;
  durationMs: number;
  reasons: VueRaison[];
}

export interface VueStatistiques {
  total: number;
  allowed: number;
  blocked: number;
  inconclusive: number;
  /** Durée moyenne d'une évaluation, en millisecondes (0 si le journal est vide). */
  averageDurationMs: number;
}

export interface VueRapportObservation {
  observed: number;
  wouldHaveBlocked: number;
  byRepository: Array<{ depot: string; bloquees: number }>;
}

export interface VueJournal {
  evaluations: VueLigneJournal[];
  statistiques: VueStatistiques;
  rapport: VueRapportObservation;
}

/** Lignes du journal, la plus récente en tête. */
function lignesJournal(evaluations: EvaluationJournalisee[], locale: Locale): VueLigneJournal[] {
  return [...evaluations]
    .sort((a, b) => Date.parse(b.evaluation.evaluatedAt) - Date.parse(a.evaluation.evaluatedAt))
    .map((entree) => ({
      evaluatedAt: entree.evaluation.evaluatedAt,
      depot: entree.depot,
      prId: entree.prId,
      verdict: entree.evaluation.verdict,
      verdictLabel: libelleVerdict(locale, entree.evaluation.verdict),
      durationMs: entree.evaluation.durationMs,
      reasons: raisonsSimples(entree.evaluation.reasons),
    }));
}

/** Statistiques du journal : volume par verdict et durée moyenne. */
function statistiques(lignes: VueLigneJournal[]): VueStatistiques {
  const total = lignes.length;
  const durees = lignes.reduce((somme, ligne) => somme + ligne.durationMs, 0);
  return {
    total,
    allowed: lignes.filter((ligne) => ligne.verdict === 'allowed').length,
    blocked: lignes.filter((ligne) => ligne.verdict === 'blocked').length,
    inconclusive: lignes.filter((ligne) => ligne.verdict === 'inconclusive').length,
    averageDurationMs: total === 0 ? 0 : Math.round(durees / total),
  };
}

/** Rapport d'observation : ce qui aurait été bloqué, dépôts les plus bloquants en tête. */
function rapportObservation(observation: Observation | undefined): VueRapportObservation {
  const byRepository = [...(observation?.byRepository ?? [])].sort((a, b) => b.bloquees - a.bloquees);
  return {
    observed: observation?.observed ?? 0,
    wouldHaveBlocked: observation?.wouldHaveBlocked ?? 0,
    byRepository,
  };
}

/** Écran 7 — journal : évaluations, statistiques, rapport d'observation. */
export function vmJournal(entree: EntreeJournal): VueJournal {
  const lignes = lignesJournal(entree.evaluations ?? [], entree.locale);
  return {
    evaluations: lignes,
    statistiques: statistiques(lignes),
    rapport: rapportObservation(entree.observation),
  };
}
