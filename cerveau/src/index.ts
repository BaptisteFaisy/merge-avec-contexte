/**
 * Point d'entrée de l'app Forge Jira « Cerveau ».
 *
 * Branche les douze fonctions déclarées dans `cerveau/manifest.yml` sur
 * l'assemblage (`app/compose.ts`) :
 * - `gererPont` : le web trigger signé, seule porte d'entrée du Capteur ;
 * - trois resolvers d'écran (réglages, encart ticket, console et journal) ;
 * - six actions, aussi exposées en MCP par `rovo:mcp` (§11) ;
 * - `surTicketModifie` : événement Jira, invalide le cache du ticket ;
 * - `migrerSchema` : déclencheur horaire, migrations Forge SQL idempotentes.
 *
 * Aucun handler ne lève vers Forge : une exception devient une réponse
 * d'erreur JSON, lisible et sans détail sensible.
 */
import Resolver from '@forge/resolver';
import { invaliderPourEvenement } from './app/cache-adaptateurs';
import { actionsRovo, cerveauProduction, resolversUi, traiterPont } from './app/compose';
import { notifieurJira } from './notify/notifieur-jira';
import { creerServiceNotification, type ServiceNotification } from './notify/notifier';
import type { BridgeEnvelope, Evaluation, Reason, Trigger, Verdict } from './shared';

/** Requête reçue par un web trigger Forge. */
export interface WebTriggerRequest {
  body: string;
  headers: Record<string, string[]>;
  queryParameters: Record<string, string[]>;
}

/** Réponse d'un web trigger Forge (`response: { type: dynamic }`). */
export interface WebTriggerResponse {
  statusCode: number;
  headers?: Record<string, string[]>;
  body: string;
}

/** Contexte d'extension reçu par les modules d'interface Jira. */
export interface JiraExtensionContext {
  type: string;
  location: string;
  project?: { id: string; key: string };
  issue?: { id: string; key: string };
  extension?: { project?: { id: string; key: string }; issue?: { id: string; key: string } };
}

/** Aplatit les en-têtes `string[]` du web trigger en `string` simples. */
export function aplatirHeaders(headers: Record<string, string[]> | undefined): Record<string, string | undefined> {
  const plat: Record<string, string | undefined> = {};
  for (const [cle, valeurs] of Object.entries(headers ?? {})) {
    plat[cle.toLowerCase()] = Array.isArray(valeurs) ? valeurs[0] : String(valeurs);
  }
  return plat;
}

/** Service de notification des blocages : singleton par conteneur (dédup). */
let notification: ServiceNotification | undefined;

/** Construit (une fois) le service de notification branché sur Jira. */
function serviceNotification(cerveau: Awaited<ReturnType<typeof cerveauProduction>>): ServiceNotification {
  notification ??= creerServiceNotification({ notifieur: notifieurJira(), logger: cerveau.logger });
  return notification;
}

/** Route annoncée dans le corps du pont ; `undefined` si illisible. */
function routeDuCorps(body: string): string | undefined {
  try {
    return (JSON.parse(body) as { route?: unknown }).route as string | undefined;
  } catch {
    return undefined;
  }
}

/** Évaluation minimale reconstruite depuis le corps d'une réponse `evaluate`. */
function evaluationDepuisCorps(corps: string): Evaluation | undefined {
  try {
    const brut = JSON.parse(corps) as {
      verdict?: Verdict;
      reasons?: Reason[];
      issueKeys?: string[];
      evaluatedAt?: string;
      durationMs?: number;
      observedOnly?: boolean;
    };
    if (brut.verdict !== 'blocked') return undefined;
    return {
      verdict: brut.verdict,
      reasons: brut.reasons ?? [],
      issueKeys: brut.issueKeys ?? [],
      trigger: 'on-code-pushed' as Trigger,
      evaluatedAt: brut.evaluatedAt ?? '',
      durationMs: brut.durationMs ?? 0,
      observedOnly: brut.observedOnly,
    };
  } catch {
    return undefined;
  }
}

/**
 * Notifie les tickets d'un contrôle `evaluate` bloqué (audit item 18).
 *
 * Effet de bord non bloquant : lancé sans `await` pour ne pas ajouter de
 * latence au merge check (§13.4), le service ne lève jamais et la réponse du
 * pont est déjà rendue. Le garde-fou (empreinte par ticket + ensemble de
 * raisons) empêche toute duplication aux relances.
 */
function notifierSiBlocage(cerveau: Awaited<ReturnType<typeof cerveauProduction>>, body: string, corpsReponse: string): void {
  if (routeDuCorps(body) !== 'evaluate') return;
  const evaluation = evaluationDepuisCorps(corpsReponse);
  if (!evaluation) return;
  void serviceNotification(cerveau)
    .notifierBlocage(evaluation, cerveau.config.locale)
    .catch((erreur) => cerveau.logger.warn('notification de blocage : échec inattendu', { erreur: String(erreur) }));
}

/** Pont signé : vérification, routage, évaluation, réponse JSON. */
export async function gererPont(request: WebTriggerRequest): Promise<WebTriggerResponse> {
  const cerveau = await cerveauProduction();
  const reponse = await traiterPont(cerveau, {
    body: request.body ?? '',
    headers: aplatirHeaders(request.headers),
  });
  notifierSiBlocage(cerveau, request.body ?? '', reponse.body);
  const headers: Record<string, string[]> = {};
  for (const [cle, valeur] of Object.entries(reponse.headers)) headers[cle] = [valeur];
  return { statusCode: reponse.statusCode, headers, body: reponse.body };
}

/** Projet porté par le contexte d'extension Jira (page ou encart de projet). */
export function projetDuContexte(contexte: JiraExtensionContext | undefined): string | undefined {
  return contexte?.project?.key ?? contexte?.extension?.project?.key ?? contexte?.project?.id ?? contexte?.extension?.project?.id;
}

/** Clé du ticket portée par le contexte d'extension Jira. */
export function cleTicketDuContexte(contexte: JiraExtensionContext | undefined): string | undefined {
  return contexte?.issue?.key ?? contexte?.extension?.issue?.key;
}

const resolver = new Resolver();

resolver.define('resolverReglages', async (requete) => {
  const cerveau = await cerveauProduction();
  const payload = (requete.payload ?? {}) as Record<string, unknown>;
  const projet = projetDuContexte(requete.context as JiraExtensionContext | undefined);
  return resolversUi(cerveau).reglages(payload, projet);
});

resolver.define('resolverEncart', async (requete) => {
  const cerveau = await cerveauProduction();
  const payload = (requete.payload ?? {}) as Record<string, unknown>;
  const contexte = requete.context as JiraExtensionContext | undefined;
  return resolversUi(cerveau).encart(payload, cleTicketDuContexte(contexte), projetDuContexte(contexte));
});

resolver.define('resolverConsole', async (requete) => {
  const cerveau = await cerveauProduction();
  const payload = (requete.payload ?? {}) as Record<string, unknown>;
  const projet = projetDuContexte(requete.context as JiraExtensionContext | undefined);
  return resolversUi(cerveau).console(payload, projet);
});

/** Gestionnaire unique : le resolver aiguille sur la clé demandée par l'écran. */
const definitions = resolver.getDefinitions();

export const resolverReglages = definitions;
export const resolverEncart = definitions;
export const resolverConsole = definitions;

/** Action `evaluate-merge` : évaluation à blanc, sans fusion réelle. */
export async function evaluateMerge(payload: unknown): Promise<unknown> {
  const cerveau = await cerveauProduction();
  return actionsRovo(cerveau).evaluateMerge((payload ?? {}) as Record<string, unknown>);
}

/** Action `explain-block` : dernière évaluation réelle des PR du ticket. */
export async function explainBlock(payload: unknown): Promise<unknown> {
  const cerveau = await cerveauProduction();
  return actionsRovo(cerveau).explainBlock((payload ?? {}) as Record<string, unknown>);
}

/** Action `list-freezes` : gels en cours et à venir. */
export async function listFreezes(payload: unknown): Promise<unknown> {
  const cerveau = await cerveauProduction();
  return actionsRovo(cerveau).listFreezes((payload ?? {}) as Record<string, unknown>);
}

/** Action `list-waivers` : dérogations en cours d'un ticket. */
export async function listWaivers(payload: unknown): Promise<unknown> {
  const cerveau = await cerveauProduction();
  return actionsRovo(cerveau).listWaivers((payload ?? {}) as Record<string, unknown>);
}

/** Action `list-approvers` : qui peut accorder une dérogation (lecture seule). */
export async function listApprovers(payload: unknown): Promise<unknown> {
  const cerveau = await cerveauProduction();
  return actionsRovo(cerveau).listApprovers((payload ?? {}) as Record<string, unknown>);
}

/** Action `request-waiver` : demande de dérogation tracée. */
export async function requestWaiver(payload: unknown): Promise<unknown> {
  const cerveau = await cerveauProduction();
  return actionsRovo(cerveau).requestWaiver((payload ?? {}) as Record<string, unknown>);
}

/** Événement Jira : le cache du ticket est invalidé, la prochaine lecture lit Jira. */
/**
 * Événement Jira : invalide le cache du ticket **et** celui des incidents des
 * services concernés (§13.4). Sans la seconde moitié, un incident clos ou ouvert
 * restait invisible jusqu'à l'expiration du cache.
 */
export async function surTicketModifie(event: unknown): Promise<void> {
  const cerveau = await cerveauProduction();
  await invaliderPourEvenement(event, {
    store: cerveau.store,
    jira: cerveau.jira,
    clock: cerveau.clock,
    logger: cerveau.logger,
  });
}

/** Migrations Forge SQL : idempotentes, rejouées chaque heure. */
export async function migrerSchema(): Promise<void> {
  const { runMigrations } = await import('./storage/migrate');
  const rapport = await runMigrations();
  const cerveau = await cerveauProduction();
  cerveau.logger.info('migrations', { mode: rapport.mode, appliquees: rapport.applied.length, echec: rapport.failure ?? '' });
}

export type { BridgeEnvelope };
