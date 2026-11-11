/**
 * Ports injectés des cinq actions Rovo/MCP (§11).
 *
 * Les actions sont de la logique pure : elles ne lisent ni Jira, ni Forge SQL,
 * ni l'heure système. Tout ce qui vient du dehors passe par ces interfaces,
 * toutes asynchrones — une implémentation Forge en production, une
 * implémentation mémoire dans les tests (docs/CONVENTIONS.md §1).
 *
 * Le fichier porte aussi les utilitaires communs aux cinq actions (refus
 * lisible, clé de ticket, mise à plat d'une raison) : une seule
 * implémentation, jamais recopiée d'un module à l'autre.
 */
import type {
  Evaluation,
  Freeze,
  Incident,
  IssueContext,
  Level,
  Locale,
  PrContext,
  Reason,
  RuleCode,
  RuleConfig,
  Trigger,
  Verdict,
  Waiver,
  WaiverStatus,
} from '../shared';

/** Entrée d'une évaluation : tout est déjà chargé, rien n'est lu. */
export interface EvaluationInput {
  /** PR simulée : métadonnées seulement, aucun contenu de code. */
  pr: PrContext;
  issues: IssueContext[];
  freezes: Freeze[];
  incidents: Incident[];
  waivers: Waiver[];
  /** Service alimenté par le dépôt ; absent = service inconnu. */
  service?: string;
  configs: RuleConfig[];
  /** Horodatage ISO injecté : aucune action ne lit l'heure. */
  now: string;
  locale: Locale;
}

/** Le moteur d'évaluation du Cerveau, réduit à son entrée et sa sortie. */
export type EvaluationService = (input: EvaluationInput) => Promise<Evaluation>;

/** Contexte déjà chargé pour une évaluation à blanc (§13.4). */
export interface EvaluationContext {
  issues: IssueContext[];
  incidents: Incident[];
  configs: RuleConfig[];
  /** Service alimenté par le dépôt ; absent = service inconnu. */
  service?: string;
}

/**
 * Charge le contexte d'un ticket et le service d'un dépôt.
 * Une clé inconnue rend `issues: []` : les règles la traitent comme absente.
 */
export interface ContextRepository {
  load(issueKey: string, repository: string | null): Promise<EvaluationContext>;
}

/** Calendrier des gels (§14, table `freeze`). */
export interface FreezeRepository {
  /** Gels actifs à cet instant. */
  active(now: string): Promise<Freeze[]>;
  /** Gels qui commencent d'ici `horizonDays` jours. */
  upcoming(now: string, horizonDays: number): Promise<Freeze[]>;
}

/** Demande de dérogation telle qu'elle est enregistrée (statut `requested`). */
export interface WaiverRequestDraft {
  issueKey: string;
  rule: RuleCode;
  reason: string;
  requestedAt: string;
  expiresAt: string;
}

/** Dérogations (§14, table `waiver`). */
export interface WaiverRepository {
  /** Dérogations rattachées au ticket, tous statuts. */
  listByIssue(issueKey: string): Promise<Waiver[]>;
  /** Enregistre la demande et rend la dérogation créée, identifiant compris. */
  createRequest(draft: WaiverRequestDraft): Promise<Waiver>;
}

/** Évaluation réelle conservée au journal, telle que la carte de PR l'a montrée. */
export interface StoredEvaluation {
  prId: number;
  repository: string;
  verdict: Verdict;
  reasons: Reason[];
  issueKeys: string[];
  trigger: Trigger;
  evaluatedAt: string;
  durationMs: number;
}

/** Journal des évaluations (§14, table `evaluation`). */
export interface EvaluationRepository {
  /** Dernières évaluations réelles des PR de ce ticket, la plus récente d'abord. */
  latestByIssue(issueKey: string): Promise<StoredEvaluation[]>;
}

/** Une personne habilitée à accorder une dérogation. */
export interface Approver {
  accountId: string;
  displayName: string;
}

/** Annuaire des approbateurs notifiés par une demande de dérogation. */
export interface ApproverDirectory {
  list(issueKey: string): Promise<Approver[]>;
}

/** Horloge injectée : les tests la fixent, la production lit l'heure réelle. */
export interface Clock {
  now(): string;
}

/** Journal applicatif : une trace par action, sans donnée de code. */
export interface Logger {
  info(message: string, details?: Record<string, unknown>): void;
  warn(message: string, details?: Record<string, unknown>): void;
}

/** Tout ce dont les cinq actions ont besoin, fourni par l'adaptateur Forge. */
export interface RovoDeps {
  evaluation: EvaluationService;
  context: ContextRepository;
  freezes: FreezeRepository;
  waivers: WaiverRepository;
  evaluations: EvaluationRepository;
  approvers: ApproverDirectory;
  clock: Clock;
  logger: Logger;
  /** Langue des messages rendus (réglage de l'espace de travail). */
  locale: Locale;
}

/** Une raison mise à plat pour la sortie JSON : jamais d'`undefined`. */
export interface RaisonSortie {
  rule: RuleCode;
  level: Level;
  text: string;
  action: string | null;
}

/** Entrée invalide d'une action : message déjà rédigé, jamais de jargon. */
export class ActionInputError extends Error {
  /** Champ fautif, pour que l'appelant sache quoi corriger. */
  readonly champ: string;

  constructor(champ: string, message: string) {
    super(message);
    this.name = 'ActionInputError';
    this.champ = champ;
  }
}

/** Texte utile d'une valeur d'entrée : chaîne nettoyée, sinon vide. */
export function texte(valeur: unknown): string {
  return typeof valeur === 'string' ? valeur.trim() : '';
}

/** Phrase bilingue locale, quand aucune clé de `strings.ts` ne convient. */
export function phrase(locale: Locale, fr: string, en: string): string {
  return locale === 'fr' ? fr : en;
}

/** Clé de ticket normalisée ; refuse une entrée vide par un message lisible. */
export function cleTicket(valeur: unknown, locale: Locale): string {
  const cle = texte(valeur).toUpperCase();
  if (cle !== '') return cle;
  throw new ActionInputError(
    'issueKey',
    phrase(locale, 'La clé du ticket est requise (ex. PAY-123).', 'The issue key is required (e.g. PAY-123).'),
  );
}

/** Une raison du contrat, mise à plat pour une sortie sérialisable. */
export function raisonSortie(raison: Reason): RaisonSortie {
  return { rule: raison.rule, level: raison.level, text: raison.text, action: raison.action ?? null };
}

/** Statut de dérogation, réexporté pour les vues des actions. */
export type { WaiverStatus };
