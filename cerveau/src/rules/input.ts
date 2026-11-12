/**
 * Entrée du moteur de règles et helpers purs de sélection.
 *
 * Rien n'est lu ici : le pont fournit la PR, les tickets, les gels, les
 * incidents et les dérogations déjà chargés, ainsi que l'horodatage `now`.
 */
import { t } from '../shared';
import type {
  Freeze,
  MessageKey,
  Incident,
  IssueContext,
  Locale,
  PrContext,
  Reason,
  RuleConfig,
  RuleInput,
  RuleCode,
  RuleOutcome,
  RuleStatus,
  Waiver,
} from '../shared';

/** Tout ce dont le moteur a besoin pour une évaluation. */
export interface EvaluationInput {
  pr: PrContext;
  /** Tickets de la PR ; `exists: false` pour une clé inconnue du site. */
  issues: IssueContext[];
  freezes: Freeze[];
  incidents: Incident[];
  waivers: Waiver[];
  /** Service alimenté par le dépôt ; absent = correspondance inconnue. */
  service?: string;
  configs: RuleConfig[];
  /** Horodatage ISO injecté : le moteur ne lit jamais l'heure. */
  now: string;
  locale: Locale;
}

/** Statuts qui valent livraison, par défaut (R-06, R-13). */
export const DEFAULT_DELIVERED_STATUSES = ['Done', 'Closed', 'Terminé', 'Fermé', 'Resolved'];

/** Entrée d'une règle prise isolément, à partir de l'entrée globale. */
export function ruleInputFor(input: EvaluationInput, config: RuleConfig): RuleInput {
  return {
    pr: input.pr,
    issues: input.issues,
    freezes: input.freezes,
    incidents: input.incidents,
    waivers: input.waivers,
    service: input.service,
    config,
    now: input.now,
    locale: input.locale,
  };
}

/** Tickets dont la clé est demandée, dans l'ordre fourni. */
export function issuesForKeys(issues: IssueContext[], keys: string[]): IssueContext[] {
  return issues.filter((issue) => keys.includes(issue.key));
}

/**
 * Clés de tickets exploitables : chaînes non vides, nettoyées et sans doublon.
 *
 * Un Capteur peut annoncer une clé vide (aucun ticket reconnu dans la PR) :
 * une telle clé ne désigne aucun ticket et ne doit jamais être demandée à
 * Jira — la lecture échouerait et ferait tomber l'évaluation en repli.
 */
export function clesExploitables(cles: string[]): string[] {
  const uniques: string[] = [];
  for (const cle of cles) {
    const propre = cle.trim();
    if (propre.length === 0 || uniques.includes(propre)) continue;
    uniques.push(propre);
  }
  return uniques;
}

/** Tickets qui existent réellement sur le site jumelé. */
export function existingIssues(issues: IssueContext[]): IssueContext[] {
  return issues.filter((issue) => issue.exists);
}

/** Tickets ouverts à l'instant donné (un incident clos ne compte plus). */
export function openIncidentsFor(incidents: Incident[], service: string | undefined, now: string): Incident[] {
  if (service === undefined) return [];
  const instant = Date.parse(now);
  return incidents.filter(
    (incident) =>
      incident.service === service
      && (incident.resolvedAt === undefined || Date.parse(incident.resolvedAt) > instant),
  );
}

const RANG: Record<RuleStatus, number> = { fail: 0, 'not-evaluated': 1, pass: 2 };

/** La plus stricte l'emporte : échec, puis non évaluée, puis succès. */
export function strictestOutcome(outcomes: RuleOutcome[]): RuleOutcome {
  return outcomes.reduce((pire, courant) => (RANG[courant.status] < RANG[pire.status] ? courant : pire));
}

/**
 * Note de non-évaluation faute de ticket. Aucune clé dédiée n'existe dans
 * `shared/src/message/strings.ts` : on réutilise la plus proche, `r01.missing`.
 */
export function missingIssueNote(locale: Locale): string {
  return t(locale, 'r01.missing');
}

/** Résultat d'une règle qui n'a reçu aucun ticket exploitable. */
export function noIssuesOutcome(locale: Locale): RuleOutcome {
  return { status: 'not-evaluated', reasons: [], note: missingIssueNote(locale) };
}

/** Évalue chaque ticket et garde le pire résultat ; non évaluée sans ticket. */
export function evaluateIssues(
  input: RuleInput,
  check: (issue: IssueContext) => RuleOutcome,
): RuleOutcome {
  const issues = existingIssues(input.issues);
  if (issues.length === 0) return noIssuesOutcome(input.locale);
  return strictestOutcome(issues.map(check));
}

/** Une raison de règle, rédigée dans la langue demandée. */
export function ruleReason(
  input: RuleInput,
  code: RuleCode,
  textKey: MessageKey,
  actionKey: MessageKey | undefined,
  params: Record<string, string | number> = {},
  issueKey?: string,
  level: Reason['level'] = input.config.level,
): Reason {
  const reason: Reason = {
    rule: code,
    level,
    text: t(input.locale, textKey, params),
  };
  if (actionKey) reason.action = t(input.locale, actionKey, params);
  if (issueKey !== undefined) reason.issueKey = issueKey;
  return reason;
}

/** Liste de chaînes d'un paramètre, avec repli si absente ou vide. */
export function paramStrings(params: Record<string, unknown>, name: string, fallback: string[]): string[] {
  const brut = params[name];
  if (!Array.isArray(brut)) return fallback;
  const valeurs = brut.filter((valeur): valeur is string => typeof valeur === 'string');
  return valeurs.length > 0 ? valeurs : fallback;
}

/** Chaîne d'un paramètre, avec repli si absente ou vide. */
export function paramString(params: Record<string, unknown>, name: string, fallback: string): string {
  const brut = params[name];
  return typeof brut === 'string' && brut.length > 0 ? brut : fallback;
}

/** Nombre d'un paramètre, avec repli si absent ou non numérique. */
export function paramNumber(params: Record<string, unknown>, name: string, fallback: number): number {
  const brut = params[name];
  return typeof brut === 'number' && Number.isFinite(brut) ? brut : fallback;
}

/** Statuts de livraison effectifs (paramètre `deliveredStatuses` sinon défaut). */
export function deliveredStatuses(params: Record<string, unknown>): string[] {
  return paramStrings(params, 'deliveredStatuses', DEFAULT_DELIVERED_STATUSES);
}
