/**
 * Écrans 6 et 7 — resolver de la console de test et du journal (§12).
 *
 * La simulation à blanc passe par le même moteur et rend le même message que le
 * contrôle réel (§18, scénario 7). Le journal ajoute les blocages par règle et
 * par service, les dérogations de la fenêtre et le délai de déblocage (§10
 * MC-16, items 12 et 13), ainsi que le rapport d'observation « ce qui aurait été
 * bloqué » (§7.3, MC-13) sur une **fenêtre configurable** (item 21).
 *
 * Le rapport se produit aussi **à la demande** (item 22) : `method: 'rapport'`
 * rend son texte. Ni module de manifeste supplémentaire, ni déclencheur horaire
 * — l'écran 7 demande, ce resolver calcule, la fonction de rendu reste pure.
 *
 * Logique pure : aucun import Forge. Les dépendances (`UiDeps`) et les aides
 * communes aux trois écrans viennent de `resolvers-ui`.
 */
import type { Evaluation, Locale } from '../shared';
import { vmConsole } from '../ui/view-model-console';
import {
  joursFenetre,
  texteRapport,
  vmJournal,
  type DerogationJournalisee,
  type EvaluationJournalisee,
  type VueJournal,
} from '../ui/view-model-journal';
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

/** Fenêtre demandée par l'écran, en jours ; défaut 30 (§7.3), bornée (item 21). */
function fenetreDemandee(payload: Record<string, unknown> | undefined): number {
  const brut = payload?.fenetre;
  const valeur = typeof brut === 'number' ? brut : Number(texte(payload, 'fenetre'));
  return joursFenetre(Number.isFinite(valeur) ? valeur : undefined);
}

/**
 * Correspondance dépôt → service, source 1 du §8 (item 13).
 *
 * Le journal n'interroge pas le Teamwork Graph : un écran ne doit pas dépendre
 * d'un service distant pour s'afficher. Les dépôts sans correspondance restent
 * groupés sous « service inconnu ». Sert aussi au menu déroulant de la console.
 */
async function servicesParDepot(deps: UiDeps): Promise<Map<string, string>> {
  const jumelage = await deps.store.pairing.current();
  if (!jumelage) return new Map();
  const lignes = await deps.store.repoService.listByWorkspace(jumelage.workspaceUuid);
  return new Map(lignes.map((ligne) => [ligne.repoUuid, ligne.service]));
}

/**
 * Journal de la fenêtre : évaluations, blocages, dérogations, observation.
 *
 * Les dérogations sont celles **demandées** dans la fenêtre (§10 MC-16 compte
 * les demandes, les accords et les refus d'une période).
 */
async function journal(deps: UiDeps, now: string, jours: number, services: Map<string, string>): Promise<VueJournal> {
  const depuis = new Date(Date.parse(now) - jours * 86_400_000).toISOString();
  const [lignes, blocs, derogations] = await Promise.all([
    deps.store.evaluations.listSince(depuis, now),
    deps.store.evaluations.observedBlocks(depuis, now),
    deps.store.waivers.listSince(depuis, now),
  ]);
  const evaluations: EvaluationJournalisee[] = lignes.map((ligne) => ({
    depot: ligne.repositoryUuid,
    prId: ligne.pullRequestId,
    evaluation: ligne as Evaluation,
    service: ligne.service ?? services.get(ligne.repositoryUuid),
    correlationId: ligne.correlationId,
  }));
  const tracees: DerogationJournalisee[] = derogations.map((derogation) => ({
    ...derogation,
    service: services.get(derogation.repositoryUuid),
  }));
  const parDepot = new Map<string, number>();
  for (const bloc of blocs) parDepot.set(bloc.repositoryUuid, (parDepot.get(bloc.repositoryUuid) ?? 0) + 1);
  return vmJournal({
    locale: deps.config.locale,
    evaluations,
    derogations: tracees,
    observation: {
      observed: lignes.length,
      wouldHaveBlocked: blocs.length,
      byRepository: [...parDepot].map(([depot, bloquees]) => ({ depot, bloquees })),
    },
    fenetreJours: jours,
    depuis,
    jusquA: now,
  });
}

/** Le rapport d'observation à la demande (item 22) : son texte et ses bornes. */
function rapportALaDemande(vue: VueJournal, locale: Locale, now: string) {
  return { genereLe: now, fenetreJours: vue.fenetre.jours, texte: texteRapport(vue, locale) };
}

/** `resolverConsole` : console de test, journal et rapport (§12, écrans 6 et 7). */
export async function handleResolverConsole(payload: Record<string, unknown> | undefined, deps: UiDeps, projetCtx?: string) {
  const now = deps.clock();
  const method = texte(payload, 'method') ?? 'charger';
  const jours = fenetreDemandee(payload);
  const evaluation = method === 'simuler' ? await simuler(payload, deps, now, projetEffectif(deps, projetCtx)) : undefined;
  const services = await servicesParDepot(deps);
  const vueJournal = await journal(deps, now, jours, services);
  const vue = vmConsole({
    locale: deps.config.locale,
    ticket: texte(payload, 'ticket'),
    brancheCible: texte(payload, 'brancheCible'),
    depot: texte(payload, 'depot'),
    depotsDisponibles: [...services.keys()],
    evaluation,
  });
  const rapport = method === 'rapport' ? rapportALaDemande(vueJournal, deps.config.locale, now) : null;
  return { locale: deps.config.locale, console: vue, journal: vueJournal, rapport };
}
