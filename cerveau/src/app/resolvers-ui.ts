/**
 * Logique des trois resolvers des écrans Jira (§12) — aucun import Forge.
 *
 * - `resolverReglages` : les treize règles, le jumelage, la correspondance
 *   dépôt → service et les approbateurs ;
 * - `resolverEncart` : les PR du ticket, la dernière évaluation, les
 *   dérogations, et la demande de dérogation depuis le ticket ;
 * - `resolverConsole` : la simulation à blanc (même moteur, même message que le
 *   contrôle réel, §18 scénario 7) et le journal.
 */
import { createPairingOffer, isRuleCode, type Evaluation, type FallbackPolicy, type RuleConfig, type RuleCode } from '../shared';
import type { StoredWaiver, Store } from '../storage/ports';
import { vmConsole } from '../ui/view-model-console';
import { vmEncart } from '../ui/view-model-encart';
import { vmJournal, type EvaluationJournalisee } from '../ui/view-model-journal';
import { vmReglages, type EtatJumelage } from '../ui/view-model-reglages';
import type { EvaluateService } from '../bridge/deps';
import { serviceDuDepot } from './context-repo';
import { chargerTickets, type DepsEvaluate } from './evaluate';
import { borneHeures, identifiant } from './waivers';
import type { AppConfig } from './config';
import type { HorlogeIso } from './horloge';
import type { ReglagesStore } from './reglages';

export interface UiDeps {
  store: Store;
  reglages: ReglagesStore;
  config: AppConfig;
  clock: HorlogeIso;
  evaluate: EvaluateService;
  depsEval: DepsEvaluate;
}

/** Champ texte d'une charge utile, ou `undefined`. */
function texte(payload: Record<string, unknown> | undefined, champ: string): string | undefined {
  const valeur = payload?.[champ];
  return typeof valeur === 'string' && valeur.trim() !== '' ? valeur.trim() : undefined;
}

/** Approbateurs effectifs : ceux des réglages, sinon ceux de la configuration. */
async function approbateurs(deps: UiDeps): Promise<string[]> {
  const lus = await deps.reglages.lire();
  return lus.approbateurs.length > 0 ? lus.approbateurs : deps.config.approbateurs;
}

/** Applique une action de la page de réglages ; `charger` ne change rien. */
async function appliquerReglages(method: string, payload: Record<string, unknown> | undefined, deps: UiDeps, now: string): Promise<void> {
  if (method === 'genererCode') {
    const offre = createPairingOffer({ siteUrl: deps.config.siteUrl, createdBy: deps.config.adminAccountId, now });
    await deps.store.pairing.saveOffer(offre);
    return;
  }
  if (method === 'repli') {
    const politique: FallbackPolicy = payload?.politique === 'closed' ? 'closed' : 'open';
    await deps.store.pairing.setFallbackPolicy(politique, now);
    return;
  }
  if (method === 'enregistrerRegles') await enregistrerRegles(payload, deps, now);
  if (method === 'ajouterCorrespondance') await ajouterCorrespondance(payload, deps, now);
  if (method === 'ajouterApprobateur') await ajouterApprobateur(texte(payload, 'approbateur'), deps);
}

/** Écrit les réglages de règles envoyés par l'écran. */
async function enregistrerRegles(payload: Record<string, unknown> | undefined, deps: UiDeps, now: string): Promise<void> {
  const regles = payload?.regles;
  if (!regles || typeof regles !== 'object') return;
  for (const [code, brut] of Object.entries(regles as Record<string, Record<string, unknown>>)) {
    if (!isRuleCode(code)) continue;
    const config: RuleConfig = {
      rule: code as RuleCode,
      level: (brut.niveau as RuleConfig['level']) ?? 'blocking',
      mode: (brut.mode as RuleConfig['mode']) ?? 'active',
      scope: (brut.portee as RuleConfig['scope']) ?? {},
      params: (brut.params as Record<string, unknown>) ?? {},
    };
    await deps.store.ruleConfig.upsert(deps.config.projectId, config, now);
  }
}

/** Ajoute une ligne à la correspondance dépôt → service. */
async function ajouterCorrespondance(payload: Record<string, unknown> | undefined, deps: UiDeps, now: string): Promise<void> {
  const depot = texte(payload, 'depot');
  const service = texte(payload, 'service');
  if (!depot || !service) return;
  const jumelage = await deps.store.pairing.current();
  if (!jumelage) return;
  await deps.store.repoService.upsert(
    { workspaceUuid: jumelage.workspaceUuid, repoUuid: depot, service, jiraComponent: texte(payload, 'composant') },
    now,
  );
}

/** Ajoute un approbateur de dérogations, sans doublon. */
async function ajouterApprobateur(nom: string | undefined, deps: UiDeps): Promise<void> {
  if (!nom) return;
  const actuels = await deps.reglages.lire();
  if (actuels.approbateurs.includes(nom)) return;
  await deps.reglages.ecrire({ approbateurs: [...actuels.approbateurs, nom] });
}

/** État du jumelage affiché par la page de réglages. */
async function etatJumelage(deps: UiDeps, now: string) {
  const [jumelage, offre, politique] = await Promise.all([
    deps.store.pairing.current(),
    deps.store.pairing.currentOffer(),
    deps.store.pairing.fallbackPolicy(),
  ]);
  const codeValide = Boolean(offre) && !offre?.used && Date.parse(now) < Date.parse(offre?.expiresAt ?? now);
  const etat: EtatJumelage = jumelage ? 'paired' : codeValide ? 'code-pending' : 'unpaired';
  return {
    etat,
    code: codeValide ? offre?.code : undefined,
    codeExpireA: codeValide ? offre?.expiresAt : undefined,
    siteUrl: deps.config.siteUrl,
    politiqueRepli: politique,
  };
}

/** `resolverReglages` : lecture et actions de la page de réglages du projet. */
export async function handleResolverReglages(payload: Record<string, unknown> | undefined, deps: UiDeps) {
  const now = deps.clock();
  const method = texte(payload, 'method') ?? 'charger';
  await appliquerReglages(method, payload, deps, now);
  const jumelage = await deps.store.pairing.current();
  const [configs, correspondances, liste] = await Promise.all([
    deps.store.ruleConfig.listByProject(deps.config.projectId),
    jumelage ? deps.store.repoService.listByWorkspace(jumelage.workspaceUuid) : Promise.resolve([]),
    approbateurs(deps),
  ]);
  const vue = vmReglages({
    locale: deps.config.locale,
    configs,
    jumelage: await etatJumelage(deps, now),
    correspondance: correspondances.map((ligne) => ({
      depot: ligne.repoUuid,
      service: ligne.service,
      composant: ligne.jiraComponent,
    })),
    approbateurs: liste,
    maintenant: now,
  });
  return { locale: deps.config.locale, vue };
}

/** Enregistre une demande de dérogation faite depuis l'encart du ticket. */
async function demanderDerogationEncart(payload: Record<string, unknown> | undefined, cle: string, deps: UiDeps, now: string): Promise<void> {
  const rule = texte(payload, 'rule');
  if (!rule || !isRuleCode(rule)) return;
  const heures = borneHeures(Number(payload?.hours ?? 2));
  const waiver: StoredWaiver = {
    id: identifiant('w-encart', cle, rule, Date.parse(now)),
    prId: 0,
    repositoryUuid: '',
    rule,
    requestedBy: deps.config.adminAccountId,
    reason: texte(payload, 'reason') ?? 'Dérogation demandée depuis le ticket',
    requestedAt: now,
    expiresAt: new Date(Date.parse(now) + heures * 3_600_000).toISOString(),
    status: 'requested',
    issueKeys: cle ? [cle] : [],
  };
  await deps.store.waivers.create(waiver);
}

/** `resolverEncart` : état du ticket vis-à-vis des règles (§12, écran 5). */
export async function handleResolverEncart(payload: Record<string, unknown> | undefined, issueKey: string | undefined, deps: UiDeps) {
  const now = deps.clock();
  const cle = (texte(payload, 'issueKey') ?? issueKey ?? '').toUpperCase();
  if (texte(payload, 'method') === 'demanderDerogation') {
    await demanderDerogationEncart(payload, cle, deps, now);
  }
  const [derniere, waivers, configs] = await Promise.all([
    cle ? deps.store.evaluations.latestByIssue(cle) : Promise.resolve(undefined),
    cle ? deps.store.waivers.listByIssue(cle) : Promise.resolve([]),
    deps.store.ruleConfig.listByProject(deps.config.projectId),
  ]);
  const prs = derniere
    ? [{ prId: derniere.pullRequestId, depot: derniere.repositoryUuid, evaluation: derniere as Evaluation }]
    : [];
  return { locale: deps.config.locale, vue: vmEncart({ locale: deps.config.locale, prs, waivers, configs, maintenant: now }) };
}

/** Évaluation à blanc demandée par la console de test (§12, écran 6). */
async function simuler(payload: Record<string, unknown> | undefined, deps: UiDeps, now: string): Promise<Evaluation | undefined> {
  const ticket = (texte(payload, 'ticket') ?? '').toUpperCase();
  if (!ticket) return undefined;
  const depot = texte(payload, 'depot') ?? '';
  const brancheCible = texte(payload, 'brancheCible') ?? 'main';
  const service = depot ? await serviceDuDepot(deps.store, depot) : undefined;
  const [freezes, waivers, configs, issues, politique] = await Promise.all([
    deps.store.freezes.list(),
    deps.store.waivers.listByIssue(ticket),
    deps.store.ruleConfig.listByProject(deps.config.projectId),
    chargerTickets([ticket], deps.depsEval),
    deps.store.pairing.fallbackPolicy(),
  ]);
  return deps.evaluate({
    pr: {
      workspaceUuid: 'console',
      repositoryUuid: depot || 'console',
      repositorySlug: depot || undefined,
      pullRequestId: 0,
      title: `${ticket} (simulation)`,
      sourceBranch: `feature/${ticket}`,
      targetBranch: brancheCible,
      commitMessages: [],
      changedPaths: [],
      reviewers: [],
      trigger: 'on-code-pushed',
    },
    issueKeys: [ticket],
    siteUrl: deps.config.siteUrl,
    freezes,
    waivers,
    service,
    configs,
    now,
    locale: deps.config.locale,
    fallbackPolicy: politique,
  });
}

/** Journal et rapport d'observation sur la fenêtre retenue (§10, MC-16). */
async function journal(deps: UiDeps, now: string) {
  const depuis = new Date(Date.parse(now) - 30 * 86_400_000).toISOString();
  const [lignes, blocs] = await Promise.all([
    deps.store.evaluations.listSince(depuis, now),
    deps.store.evaluations.observedBlocks(depuis, now),
  ]);
  const evaluations: EvaluationJournalisee[] = lignes.map((ligne) => ({
    depot: ligne.repositoryUuid,
    prId: ligne.pullRequestId,
    evaluation: ligne as Evaluation,
  }));
  const parDepot = new Map<string, number>();
  for (const bloc of blocs) parDepot.set(bloc.repositoryUuid, (parDepot.get(bloc.repositoryUuid) ?? 0) + 1);
  return vmJournal({
    locale: deps.config.locale,
    evaluations,
    observation: {
      observed: lignes.length,
      wouldHaveBlocked: blocs.length,
      byRepository: [...parDepot].map(([depot, bloquees]) => ({ depot, bloquees })),
    },
  });
}

/** `resolverConsole` : console de test et journal (§12, écrans 6 et 7). */
export async function handleResolverConsole(payload: Record<string, unknown> | undefined, deps: UiDeps) {
  const now = deps.clock();
  const method = texte(payload, 'method') ?? 'charger';
  const evaluation = method === 'simuler' ? await simuler(payload, deps, now) : undefined;
  const [vueJournal, depots] = await Promise.all([journal(deps, now), listeDepots(deps)]);
  const vue = vmConsole({
    locale: deps.config.locale,
    ticket: texte(payload, 'ticket'),
    brancheCible: texte(payload, 'brancheCible'),
    depot: texte(payload, 'depot'),
    depotsDisponibles: depots,
    evaluation,
  });
  return { locale: deps.config.locale, console: vue, journal: vueJournal };
}

/** Dépôts connus de la correspondance, pour le menu déroulant de la console. */
async function listeDepots(deps: UiDeps): Promise<string[]> {
  const jumelage = await deps.store.pairing.current();
  if (!jumelage) return [];
  const lignes = await deps.store.repoService.listByWorkspace(jumelage.workspaceUuid);
  return lignes.map((ligne) => ligne.repoUuid);
}
