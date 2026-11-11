/**
 * Action `explain-block` (§11) : dernière évaluation réelle des PR d'un ticket,
 * avec les raisons du blocage.
 *
 * L'action ne relit rien : elle rejoue le journal (`evaluation`, §14) et
 * reformate chaque entrée avec le même `formatEvaluation` que la carte de PR,
 * pour qu'un agent voie exactement ce que le développeur a vu.
 */
import { formatEvaluation } from '../shared';
import type { Evaluation, Locale, Verdict } from '../shared';
import { cleTicket, phrase, raisonSortie } from './deps';
import type { RaisonSortie, RovoDeps, StoredEvaluation } from './deps';

/** Une PR du ticket, telle qu'elle a été évaluée. */
export interface EvaluationResumee {
  prId: number;
  repository: string;
  verdict: Verdict;
  message: string;
  evaluatedAt: string;
  reasons: RaisonSortie[];
}

/** Sortie de l'action : les évaluations et une phrase de synthèse. */
export interface ExplainBlockOutput {
  issueKey: string;
  evaluations: EvaluationResumee[];
  summary: string;
}

/** Le journal porte tout sauf le repli : on complète pour reformater. */
function evaluationDepuis(stored: StoredEvaluation): Evaluation {
  return {
    verdict: stored.verdict,
    reasons: stored.reasons,
    issueKeys: stored.issueKeys,
    trigger: stored.trigger,
    evaluatedAt: stored.evaluatedAt,
    durationMs: stored.durationMs,
  };
}

/** Une entrée du journal, reformatée comme la carte de PR. */
function resumerEvaluation(stored: StoredEvaluation, locale: Locale): EvaluationResumee {
  return {
    prId: stored.prId,
    repository: stored.repository,
    verdict: stored.verdict,
    message: formatEvaluation(evaluationDepuis(stored), { locale }),
    evaluatedAt: stored.evaluatedAt,
    reasons: stored.reasons.map(raisonSortie),
  };
}

/** Compte les verdicts, au pluriel de la langue demandée. */
function compter(locale: Locale, nombre: number, fr: string, en: string): string | null {
  if (nombre === 0) return null;
  return phrase(locale, `${nombre} ${fr}`, `${nombre} ${en}`);
}

/** Phrase de synthèse : combien de PR, combien bloquées. */
function synthese(locale: Locale, issueKey: string, evaluations: EvaluationResumee[]): string {
  if (evaluations.length === 0) {
    return phrase(
      locale,
      `Aucune évaluation enregistrée pour ${issueKey} : aucune PR connue sur ce ticket.`,
      `No evaluation recorded for ${issueKey}: no pull request known for this issue.`,
    );
  }
  const bloquees = evaluations.filter((item) => item.verdict === 'blocked').length;
  const autorisees = evaluations.filter((item) => item.verdict === 'allowed').length;
  const autres = evaluations.length - bloquees - autorisees;
  const parties = [
    compter(locale, bloquees, 'bloquée(s)', 'blocked'),
    compter(locale, autorisees, 'autorisée(s)', 'allowed'),
    compter(locale, autres, 'non concluante(s)', 'inconclusive'),
  ].filter((partie): partie is string => partie !== null);
  const entete = phrase(locale, `${evaluations.length} PR : `, `${evaluations.length} pull request(s): `);
  return `${entete}${parties.join(', ')}.`;
}

/** Action `explain-block` : entrée `issueKey`. */
export async function runExplainBlock(
  deps: RovoDeps,
  payload: Record<string, unknown>,
): Promise<ExplainBlockOutput> {
  const locale = deps.locale;
  const issueKey = cleTicket(payload.issueKey, locale);
  const stored = await deps.evaluations.latestByIssue(issueKey);
  const evaluations = stored.map((item) => resumerEvaluation(item, locale));
  deps.logger.info('explain-block', { issueKey, count: evaluations.length });
  return { issueKey, evaluations, summary: synthese(locale, issueKey, evaluations) };
}
