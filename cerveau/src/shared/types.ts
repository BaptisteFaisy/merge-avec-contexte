/**
 * Contrat partagé entre le Capteur (Bitbucket) et le Cerveau (Jira).
 *
 * Aucune dépendance Forge ici : ces types décrivent le domaine (règles,
 * évaluation, gels, dérogations, pont signé). Les deux apps en reçoivent une
 * copie générée dans `<app>/src/shared/` — voir `scripts/shared-sync.mjs`.
 */

/** Les treize règles du catalogue (§8 du cahier des charges). */
export type RuleCode =
  | 'R-01' | 'R-02' | 'R-03' | 'R-04' | 'R-05' | 'R-06' | 'R-07'
  | 'R-08' | 'R-09' | 'R-10' | 'R-11' | 'R-12' | 'R-13';

/** Gravité d'une règle : bloque, avertit, ou informe seulement. */
export type Level = 'blocking' | 'warning' | 'information';

/** Une règle en mode observation est évaluée et journalisée, jamais affichée. */
export type RuleMode = 'active' | 'observe';

/** Issue d'une évaluation : bloqué, autorisé, ou non concluant (repli). */
export type Verdict = 'blocked' | 'allowed' | 'inconclusive';

/** Les trois déclencheurs d'un merge check Bitbucket. */
export type Trigger = 'on-code-pushed' | 'on-reviewer-status-changed' | 'on-merge';

/** Langue des messages utilisateur (soumission en anglais). */
export type Locale = 'fr' | 'en';

/** Politique de repli quand le Cerveau ne répond pas (§13.5). */
export type FallbackPolicy = 'open' | 'closed';

/** Cause d'un repli, pour le journal. */
export type FallbackCause = 'unreachable' | 'timeout' | 'unpaired' | 'error';

/** Une raison lisible : objet concerné, action attendue, aucun jargon. */
export interface Reason {
  rule: RuleCode;
  level: Level;
  /** Phrase affichée, déjà rédigée dans la langue demandée. */
  text: string;
  /** Marche à suivre, détaillée dans la carte de PR. */
  action?: string;
  issueKey?: string;
  link?: { label: string; url: string };
  /** Mode observation : journalisée, jamais affichée ni bloquante. */
  observed?: boolean;
  /** Une dérogation couvre cette raison : elle ne bloque plus. */
  waived?: boolean;
}

/** Portée d'une règle : dépôts et branches concernés (motifs glob). */
export interface RuleScope {
  repositories?: string[];
  branches?: string[];
}

/** Réglage d'une règle par l'administrateur. */
export interface RuleConfig {
  rule: RuleCode;
  level: Level;
  mode: RuleMode;
  scope: RuleScope;
  params: Record<string, unknown>;
}

/** Un relecteur et son avis. */
export interface Reviewer {
  accountId: string;
  displayName?: string;
  state: 'approved' | 'changes_requested' | 'none';
}

/** Tout ce qu'une règle peut savoir de la PR (métadonnées, jamais le code). */
export interface PrContext {
  workspaceUuid: string;
  repositoryUuid: string;
  repositorySlug?: string;
  pullRequestId: number;
  title: string;
  sourceBranch: string;
  targetBranch: string;
  commitMessages: string[];
  /** Chemins modifiés — envoi désactivable (§13.3, sobriété). */
  changedPaths: string[];
  reviewers: Reviewer[];
  trigger: Trigger;
}

/** Un critère d'acceptation coché ou non. */
export interface AcceptanceCriterion {
  text: string;
  done: boolean;
}

/**
 * Catégorie Jira d'un statut : `toDo`, `inProgress` ou `done`.
 *
 * Elle ne dépend pas de la langue du site : c'est l'identifiant stable qui
 * permet de comparer un statut d'un site à l'autre.
 */
export type StatusCategory = 'toDo' | 'inProgress' | 'done';

/** Un lien de ticket Jira (bloqué par, dépend de…). */
export interface IssueLink {
  /** Type de lien, tel que nommé dans le site Jira. */
  type: string;
  /** Sens du lien vu du ticket évalué. */
  direction: 'inward' | 'outward';
  targetKey: string;
  targetStatus: string;
  /** Identifiant du statut de la cible : stable, indépendant de la langue. */
  targetStatusId?: string;
  /** Catégorie Jira du statut de la cible : stable, indépendante de la langue. */
  targetStatusCategory?: StatusCategory;
}

/** Une version cible du ticket. */
export interface FixVersion {
  name: string;
  released: boolean;
}

/** Instantané d'un ticket, lu par le cache ou par Jira. */
export interface IssueContext {
  key: string;
  id: string;
  /** Faux si la clé ne correspond à aucun ticket du site jumelé. */
  exists: boolean;
  status: string;
  /** Identifiant du statut dans le site : stable, indépendant de la langue. */
  statusId?: string;
  statusCategory?: StatusCategory;
  summary?: string;
  criteria: AcceptanceCriterion[];
  links: IssueLink[];
  fixVersions: FixVersion[];
  labels: string[];
  components: string[];
  /** Incidents JSM liés à ce ticket (voie rapide des correctifs). */
  incidentKeys: string[];
  securityReviewRequired?: boolean;
  securityReviewApproved?: boolean;
  rollbackPlanAttached?: boolean;
  url?: string;
}

/** Récurrence d'un gel. */
export type Recurrence =
  | { kind: 'none' }
  | { kind: 'daily' }
  | { kind: 'weekly'; daysOfWeek: number[] };

/** Un gel : période pendant laquelle on ne fusionne pas. */
export interface Freeze {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  /** Motifs de branches (`main`, `release/*`) ; vide = toutes. */
  branches: string[];
  /** Services concernés ; vide = tous. */
  services: string[];
  recurrence: Recurrence;
  /** Fuseau IANA de la fenêtre récurrente (défaut : UTC). */
  timezone?: string;
  createdBy?: string;
}

/** Un incident JSM ouvert sur un service. */
export interface Incident {
  service: string;
  incidentKey: string;
  openedAt: string;
  resolvedAt?: string;
}

/** État d'une demande de dérogation. */
export type WaiverStatus = 'requested' | 'granted' | 'refused' | 'expired';

/** Une dérogation : exception tracée, bornée dans le temps. */
export interface Waiver {
  id: string;
  /** PR visée ; 0 si la demande vient d'un ticket, sans PR connue. */
  prId: number;
  /** Dépôt visé ; vide si la demande vient d'un ticket, sans PR connue. */
  repositoryUuid: string;
  rule: RuleCode;
  requestedBy: string;
  grantedBy?: string;
  reason: string;
  requestedAt: string;
  expiresAt?: string;
  status: WaiverStatus;
  /**
   * Tickets rattachés (§7.1) : la dérogation lève le blocage de n'importe
   * quelle PR qui cite l'un d'eux, pendant sa durée. Vide ou absent =
   * dérogation valable pour la PR visée seule.
   */
  issueKeys?: string[];
}

/** Une dérogation telle que le journal l'affiche (§12, écran 7). */
export interface JournalWaiver {
  id: string;
  rule: RuleCode;
  status: WaiverStatus;
  /** PR visée ; 0 pour une dérogation rattachée à des tickets seuls. */
  prId: number;
  /** Dépôt visé ; vide pour une dérogation rattachée à des tickets seuls. */
  repositoryUuid: string;
  /** Tickets rattachés ; vide pour une dérogation par PR seule. */
  issueKeys: string[];
  requestedBy: string;
  grantedBy?: string;
  reason: string;
  requestedAt: string;
  expiresAt?: string;
  /** Phrase déjà rédigée : qui a accordé jusqu'à quand et pourquoi, ou l'expiration. */
  text: string;
}

/** Les dérogations d'une entrée du journal : l'écran affiche sans recomposer. */
export interface JournalWaivers {
  evaluationId: string;
  waivers: JournalWaiver[];
}

/** Entrée complète d'une règle : tout est déjà chargé, rien n'est lu. */
export interface RuleInput {
  pr: PrContext;
  issues: IssueContext[];
  freezes: Freeze[];
  incidents: Incident[];
  waivers: Waiver[];
  /** Correspondance dépôt → service ; absente = service inconnu. */
  service?: string;
  config: RuleConfig;
  /** Horodatage ISO injecté : aucune règle ne lit l'heure. */
  now: string;
  locale: Locale;
}

/** Verdict d'une règle prise isolément. */
export type RuleStatus = 'pass' | 'fail' | 'not-evaluated';

export interface RuleOutcome {
  status: RuleStatus;
  reasons: Reason[];
  /** Explication d'une non-évaluation (« service inconnu pour ce dépôt »). */
  note?: string;
}

/** Une règle : du code pur, testable sans Jira ni Bitbucket. */
export interface Rule {
  code: RuleCode;
  evaluate(input: RuleInput): RuleOutcome;
}

/** Résultat complet d'une évaluation, journalisé et renvoyé au Capteur. */
export interface Evaluation {
  verdict: Verdict;
  reasons: Reason[];
  /** Clés reconnues dans la PR (vide si aucune). */
  issueKeys: string[];
  trigger: Trigger;
  evaluatedAt: string;
  durationMs: number;
  /** Renseigné quand le verdict vient d'une politique de repli. */
  fallback?: FallbackPolicy;
  cause?: FallbackCause;
  /** Vrai si toutes les règles en échec étaient en mode observation. */
  observedOnly?: boolean;
}
