/**
 * Écrans 6 et 7 — resolver de la console de test et du journal (§12).
 *
 * La simulation à blanc passe par le même moteur et rend le même message que le
 * contrôle réel (§18, scénario 7) ; le journal ajoute le rapport d'observation
 * « ce qui aurait été bloqué » (§10, MC-16).
 *
 * Logique pure : aucun import Forge. Les dépendances (`UiDeps`) et les aides
 * communes aux trois écrans viennent de `resolvers-ui`.
 */
import type { Evaluation } from '../shared';
import { vmConsole } from '../ui/view-model-console';
import { vmJournal, type EvaluationJournalisee } from '../ui/view-model-journal';
import { reglesEffectives, serviceDuDepot } from './context-repo';
import { chargerTickets } from './evaluate';
import { projetEffectif, texte, type UiDeps } from './resolvers-ui';

/** Évaluation à blanc demandée par la console de test (§12, écran 6). */
async function simuler(payload: Record<string, unknown> | undefined, deps: UiDeps, now: string, projet: string): Promise<Evaluation | undefined> {
  const ticket = (texte(payload, 'ticket') ?? '').toUpperCase();
  if (!ticket) return undefined;
  const depot = texte(payload, 'depot') ?? '';
  const brancheCible = texte(payload, 'brancheCible') ?? 'main';
  const service = depot ? await serviceDuDepot(deps.store, depot) : undefined;
  const [freezes, waivers, configs, issues, politique] = await Promise.all([
    deps.store.freezes.list(),
    deps.store.waivers.listByIssue(ticket),
    reglesEffectives(deps.store, projet),
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
export async function handleResolverConsole(payload: Record<string, unknown> | undefined, deps: UiDeps, projetCtx?: string) {
  const now = deps.clock();
  const method = texte(payload, 'method') ?? 'charger';
  const evaluation = method === 'simuler' ? await simuler(payload, deps, now, projetEffectif(deps, projetCtx)) : undefined;
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
