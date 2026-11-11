/**
 * Jeu de données de démonstration (§20) : ce que les juges chargent dans la
 * console de test quand leur site n'a pas Bitbucket.
 *
 * Le jeu reproduit les situations du cahier des charges : un ticket dont il
 * reste deux critères d'acceptation à cocher, un gel « Black Friday », un
 * incident ouvert sur `checkout-api`, un ticket bloqué par un autre, une
 * version déjà publiée, une dérogation accordée et une dérogation expirée.
 *
 * Tout est figé : un instant de référence, aucun accès réseau, aucune base.
 */
import type {
  AcceptanceCriterion, Freeze, Incident, IssueContext, PrContext, Reviewer, RuleConfig, Waiver,
} from '../shared';

/** Instant de référence du jeu de démonstration. */
export const DEMO_NOW = '2026-11-27T16:30:00Z';

/** Correspondance dépôt → service (source 1 : table de réglages). */
export interface RepoService {
  repositorySlug: string;
  service: string;
  jiraComponent?: string;
}

/** Un workspace de démonstration. */
export interface DemoWorkspace {
  uuid: string;
  name: string;
  slug: string;
}

/** Le jeu complet. */
export interface DemoDataset {
  workspace: DemoWorkspace;
  now: string;
  issues: IssueContext[];
  freezes: Freeze[];
  incidents: Incident[];
  waivers: Waiver[];
  repoServices: RepoService[];
  prs: PrContext[];
  configs: RuleConfig[];
}

const critere = (text: string, done: boolean): AcceptanceCriterion => ({ text, done });

/** Instant décalé de `minutes`, pour que le jeu reste vrai quelle que soit la date. */
function decaler(now: string, minutes: number): string {
  return new Date(Date.parse(now) + minutes * 60_000).toISOString();
}

/** Jour de `now` décalé de `jours`, à l'heure donnée en UTC. */
function aHeure(now: string, jours: number, heure: number, minute = 0): string {
  const date = new Date(Date.parse(now));
  date.setUTCDate(date.getUTCDate() + jours);
  date.setUTCHours(heure, minute, 0, 0);
  return date.toISOString();
}

/** Ticket PAY-123 : deux critères d'acceptation ne sont pas cochés. */
const pay123: IssueContext = {
  key: 'PAY-123',
  id: '10001',
  exists: true,
  status: 'À faire',
  statusCategory: 'toDo',
  summary: 'Limiter le nombre de tentatives de paiement',
  criteria: [
    critere('La limite est configurable par projet', true),
    critere('Les clients sont prévenus avant le blocage', false),
    critere('Le compteur repart après 24 heures', false),
  ],
  links: [],
  fixVersions: [{ name: '2.4.0', released: false }],
  labels: ['checkout'],
  components: ['paiement'],
  incidentKeys: [],
  securityReviewRequired: false,
  securityReviewApproved: false,
  rollbackPlanAttached: false,
  url: 'https://demo.atlassian.net/browse/PAY-123',
};

/** Ticket PAY-124 : statut autorisé, tout est validé. */
const pay124: IssueContext = {
  key: 'PAY-124',
  id: '10002',
  exists: true,
  status: 'Prêt pour la livraison',
  statusCategory: 'done',
  summary: 'Journaliser les refus de paiement',
  criteria: [critere('Les refus sont journalisés avec leur motif', true)],
  links: [],
  fixVersions: [{ name: '2.4.0', released: false }],
  labels: [],
  components: ['paiement'],
  incidentKeys: [],
  url: 'https://demo.atlassian.net/browse/PAY-124',
};

/** Ticket PAY-125 : bloqué par PAY-126, qui n'est pas livré. */
const pay125: IssueContext = {
  key: 'PAY-125',
  id: '10003',
  exists: true,
  status: 'En cours',
  statusCategory: 'inProgress',
  summary: 'Réduire la latence du panier',
  criteria: [critere('Le panier répond en moins de 200 ms', true)],
  links: [{ type: 'bloque par', direction: 'outward', targetKey: 'PAY-126', targetStatus: 'En cours' }],
  fixVersions: [],
  labels: [],
  components: ['panier'],
  incidentKeys: [],
  url: 'https://demo.atlassian.net/browse/PAY-125',
};

/** Ticket PAY-130 : sa version cible est déjà publiée. */
const pay130: IssueContext = {
  key: 'PAY-130',
  id: '10004',
  exists: true,
  status: 'En cours',
  statusCategory: 'inProgress',
  summary: 'Corriger l’affichage des remises',
  criteria: [],
  links: [],
  fixVersions: [{ name: '2.3.0', released: true }],
  labels: [],
  components: ['catalogue'],
  incidentKeys: [],
  url: 'https://demo.atlassian.net/browse/PAY-130',
};

/** Ticket PAY-131 : exige une revue de sécurité. */
const pay131: IssueContext = {
  key: 'PAY-131',
  id: '10005',
  exists: true,
  status: 'En revue',
  statusCategory: 'inProgress',
  summary: 'Ouvrir la session par un fournisseur externe',
  criteria: [critere('Le test de pénétration est passé', true)],
  links: [],
  fixVersions: [{ name: '2.5.0', released: false }],
  labels: ['security-review'],
  components: ['compte'],
  incidentKeys: [],
  securityReviewRequired: true,
  securityReviewApproved: false,
  url: 'https://demo.atlassian.net/browse/PAY-131',
};

/** Ticket lié à l'incident : voie rapide du correctif (§7.2). */
const pay140: IssueContext = {
  key: 'PAY-140',
  id: '10006',
  exists: true,
  status: 'En cours',
  statusCategory: 'inProgress',
  summary: 'Correctif de l’incident sur le tunnel de paiement',
  criteria: [],
  links: [],
  fixVersions: [],
  labels: ['incident'],
  components: ['paiement'],
  incidentKeys: ['INC-52'],
  url: 'https://demo.atlassian.net/browse/PAY-140',
};

/** Ticket PAY-132 : statut interdit, jamais autorisé à fusionner (R-02). */
const pay132: IssueContext = {
  key: 'PAY-132',
  id: '10007',
  exists: true,
  status: 'Suspendu',
  statusCategory: 'toDo',
  summary: 'Retirer le paiement à la livraison',
  criteria: [],
  links: [],
  fixVersions: [{ name: '2.6.0', released: false }],
  labels: [],
  components: ['paiement'],
  incidentKeys: [],
  url: 'https://demo.atlassian.net/browse/PAY-132',
};

/** Ticket PAY-133 : dépendance amont PAY-134 non livrée (R-13). */
const pay133: IssueContext = {
  key: 'PAY-133',
  id: '10008',
  exists: true,
  status: 'En cours',
  statusCategory: 'inProgress',
  summary: 'Refondre le calcul des remises fidélité',
  criteria: [],
  links: [{ type: 'dépend de', direction: 'outward', targetKey: 'PAY-134', targetStatus: 'En cours' }],
  fixVersions: [{ name: '2.6.0', released: false }],
  labels: [],
  components: ['catalogue'],
  incidentKeys: [],
  url: 'https://demo.atlassian.net/browse/PAY-133',
};

/** Gel ponctuel dans trois jours, 8 h → 10 h UTC, sur `main`. */
const gelBlackFriday = (now: string): Freeze => ({
  id: 'freeze-black-friday',
  name: 'Black Friday',
  startsAt: aHeure(now, 3, 8),
  endsAt: aHeure(now, 3, 10),
  branches: ['main'],
  services: [],
  recurrence: { kind: 'none' },
  timezone: 'Europe/Paris',
  createdBy: 'release-manager',
});

/** Gel récurrent quotidien, 22 h → 23 h UTC, sur le service `checkout-api`. */
const gelNuit = (now: string): Freeze => ({
  id: 'freeze-nuit',
  name: 'Fenêtre nocturne',
  startsAt: aHeure(now, -30, 22),
  endsAt: aHeure(now, 34, 23),
  branches: ['main', 'release/*'],
  services: ['checkout-api'],
  recurrence: { kind: 'daily' },
  timezone: 'Europe/Paris',
  createdBy: 'release-manager',
});

/** Gel court réellement actif à `now` : deux heures centrées, branches `release/*`. */
const gelRelease = (now: string): Freeze => {
  const instant = Date.parse(now);
  return {
    id: 'freeze-release',
    name: 'Fenêtre release',
    startsAt: new Date(instant - 60 * 60_000).toISOString(),
    endsAt: new Date(instant + 60 * 60_000).toISOString(),
    branches: ['release/*'],
    services: [],
    recurrence: { kind: 'none' },
    timezone: 'Europe/Paris',
    createdBy: 'release-manager',
  };
};

/** Incident ouvert sur `checkout-api` depuis huit heures. */
const incidentCheckout = (now: string): Incident => ({
  service: 'checkout-api',
  incidentKey: 'INC-52',
  openedAt: decaler(now, -8 * 60),
});

/** Dérogation accordée, encore valable une heure et demie sur le gel. */
const derogationAccordee = (now: string): Waiver => ({
  id: 'waiver-1',
  prId: 42,
  repositoryUuid: 'demo-repo-uuid',
  rule: 'R-04',
  requestedBy: 'lea',
  grantedBy: 'tech-lead',
  reason: 'correctif de prix avant l’ouverture',
  requestedAt: decaler(now, -30),
  expiresAt: decaler(now, 90),
  status: 'granted',
});

/** Dérogation expirée il y a trois heures : elle ne protège plus rien. */
const derogationExpiree = (now: string): Waiver => ({
  id: 'waiver-2',
  prId: 42,
  repositoryUuid: 'demo-repo-uuid',
  rule: 'R-03',
  requestedBy: 'lea',
  grantedBy: 'tech-lead',
  reason: 'critères cochés après la fusion',
  requestedAt: decaler(now, -5 * 60),
  expiresAt: decaler(now, -3 * 60),
  status: 'expired',
});

const relecteurs = (etat: Reviewer['state'][]): Reviewer[] =>
  etat.map((state, index) => ({ accountId: `account-${index + 1}`, displayName: `Relecteur ${index + 1}`, state }));

/** PR #42 : celle du parcours §7.1, avec deux critères non cochés. */
const pr42: PrContext = {
  workspaceUuid: 'demo-workspace-uuid',
  repositoryUuid: 'demo-repo-uuid',
  repositorySlug: 'checkout-api',
  pullRequestId: 42,
  title: 'PAY-123 : limiter les tentatives de paiement',
  sourceBranch: 'feature/PAY-123-limite-tentatives',
  targetBranch: 'main',
  commitMessages: ['PAY-123 : limite les tentatives à trois par heure'],
  changedPaths: ['src/paiement/limites.ts', 'src/paiement/limites.test.ts'],
  reviewers: relecteurs(['approved', 'none']),
  trigger: 'on-code-pushed',
};

/** PR #43 : sur le service en incident, sans lien avec l'incident. */
const pr43: PrContext = {
  ...pr42,
  pullRequestId: 43,
  title: 'PAY-124 : journaliser les refus de paiement',
  sourceBranch: 'feature/PAY-124-journal-refus',
  commitMessages: ['PAY-124 : journalise les refus'],
  reviewers: relecteurs(['changes_requested']),
};

/** PR #44 : correctif lié à l'incident. */
const pr44: PrContext = {
  ...pr42,
  pullRequestId: 44,
  title: 'PAY-140 : correctif de l’incident du tunnel',
  sourceBranch: 'hotfix/PAY-140-incident-52',
  commitMessages: ['PAY-140 : corrige le tunnel de paiement'],
  changedPaths: ['src/paiement/tunnel.ts'],
  trigger: 'on-merge',
};

/** Correspondance des dépôts de démonstration. */
const correspondances: RepoService[] = [
  { repositorySlug: 'checkout-api', service: 'checkout-api', jiraComponent: 'paiement' },
  { repositorySlug: 'pricing-api', service: 'pricing-api', jiraComponent: 'catalogue' },
];

/** Règles par défaut de la démonstration (§8, lot M). */
function configsDemo(): RuleConfig[] {
  return [
    { rule: 'R-01', level: 'warning', mode: 'active', scope: {}, params: {} },
    { rule: 'R-02', level: 'blocking', mode: 'active', scope: {}, params: { allowedStatuses: ['À faire', 'En cours', 'En revue', 'Prêt pour la livraison'] } },
    { rule: 'R-03', level: 'blocking', mode: 'active', scope: {}, params: { source: 'description-checkboxes' } },
    { rule: 'R-04', level: 'blocking', mode: 'active', scope: {}, params: {} },
    { rule: 'R-05', level: 'blocking', mode: 'active', scope: {}, params: { jsmProjects: ['ITS'] } },
    { rule: 'R-06', level: 'blocking', mode: 'active', scope: {}, params: { linkTypes: ['bloque par'] } },
    { rule: 'R-07', level: 'warning', mode: 'active', scope: {}, params: {} },
    { rule: 'R-09', level: 'blocking', mode: 'observe', scope: {}, params: {} },
    { rule: 'R-13', level: 'blocking', mode: 'active', scope: {}, params: {} },
  ];
}

/** Construit le jeu de démonstration complet. */
export function createDemoDataset(now: string = DEMO_NOW): DemoDataset {
  return {
    workspace: { uuid: 'demo-workspace-uuid', name: 'Démo Codegeist', slug: 'demo' },
    now,
    issues: [pay123, pay124, pay125, pay130, pay131, pay140, pay132, pay133],
    freezes: [gelBlackFriday(now), gelNuit(now), gelRelease(now)],
    incidents: [incidentCheckout(now)],
    waivers: [derogationAccordee(now), derogationExpiree(now)],
    repoServices: correspondances,
    prs: [pr42, pr43, pr44],
    configs: configsDemo(),
  };
}

/** Service d'un dépôt de démonstration. */
export function serviceOf(dataset: DemoDataset, repositorySlug: string): string | undefined {
  return dataset.repoServices.find((entree) => entree.repositorySlug === repositorySlug)?.service;
}

/** Ticket de démonstration par clé. */
export function issueOf(dataset: DemoDataset, key: string): IssueContext | undefined {
  return dataset.issues.find((ticket) => ticket.key === key);
}

/** PR de démonstration par numéro. */
export function prOf(dataset: DemoDataset, pullRequestId: number): PrContext | undefined {
  return dataset.prs.find((pr) => pr.pullRequestId === pullRequestId);
}

