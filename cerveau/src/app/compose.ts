/**
 * Racine d'assemblage du Cerveau : un seul endroit où tous les modules sont
 * branchés derrière leurs ports. Ni Forge, ni réseau, ni heure système ici :
 * tout est injecté, ce qui rend le câblage testable de bout en bout.
 */
import type { BridgeDeps, EvaluateService } from '../bridge/deps';
import { gererRequetePont, type BridgeRequest } from '../bridge/handler';
import { creerLimiteurDebit, RATE_LIMIT_PAR_DEFAUT, type RateLimitConfig } from '../bridge/limite-debit';
import { creerPurgeurNonces } from '../bridge/purge-nonces';
import { createJiraReader, type IssueReader } from '../jira/reader';
import type { RovoDeps } from '../rovo/deps';
import { runEvaluateMerge } from '../rovo/evaluate-merge';
import { runExplainBlock } from '../rovo/explain-block';
import { runListApprovers } from '../rovo/list-approvers';
import { runListFreezes } from '../rovo/list-freezes';
import { runListWaivers } from '../rovo/list-waivers';
import { runRequestWaiver } from '../rovo/request-waiver';
import { createMemoryStore } from '../storage/memory-store';
import type { Store } from '../storage/ports';
import { configParDefaut, type AppConfig } from './config';
import { createContextRepository } from './context-repo';
import { createEvaluateService, type DepsEvaluate } from './evaluate';
import { creerLecteurFiable } from './fiabilite';
import { horlogeReelle, type HorlogeIso } from './horloge';
import { loggerConsole, type LoggerCommun } from './logger';
import { createPairingRepository } from './pairing-repo';
import { createMemoryReglagesStore, type ReglagesStore } from './reglages';
import { handleResolverConsole, handleResolverEncart, handleResolverReglages, type UiDeps } from './resolvers-ui';
import { createRovoDeps } from './rovo-adaptateurs';
import { createMemorySecretVault, type SecretVault } from './secrets';
import { creerStoreProduction } from './store-factory';
import { createWaiverService } from './waivers';

/** Tout ce que les handlers du manifeste utilisent. */
export interface Cerveau {
  store: Store;
  vault: SecretVault;
  reglages: ReglagesStore;
  config: AppConfig;
  clock: HorlogeIso;
  logger: LoggerCommun;
  jira: IssueReader;
  bridgeDeps: BridgeDeps;
  rovoDeps: RovoDeps;
  uiDeps: UiDeps;
  evaluate: EvaluateService;
}

export interface OptionsAssemblage {
  store?: Store;
  vault?: SecretVault;
  reglages?: ReglagesStore;
  config?: Partial<AppConfig>;
  clock?: HorlogeIso;
  logger?: LoggerCommun;
  jira?: IssueReader;
  /** Bornes de la limite de débit du pont (item 10) ; défaut : `RATE_LIMIT_PAR_DEFAUT`. */
  limiteDebit?: Partial<RateLimitConfig>;
}

/**
 * Approbateurs habilités à décider d'une dérogation (item 48).
 *
 * La liste éditée depuis l'écran de réglages prime ; à défaut, celle de la
 * configuration. Vide, le pont ne peut pas vérifier une identité : il la
 * journalise comme déclarée.
 */
function lecteurApprobateurs(reglages: ReglagesStore, config: AppConfig): () => Promise<string[]> {
  return async () => {
    try {
      const lus = await reglages.lire();
      return lus.approbateurs.length > 0 ? lus.approbateurs : config.approbateurs;
    } catch {
      return config.approbateurs;
    }
  };
}

/**
 * Purge les nonces expirés au démarrage (item 26).
 *
 * Un échec est journalisé, jamais propagé : une base injoignable au démarrage
 * ne doit pas empêcher l'app de répondre — elle répondra une erreur lisible.
 */
async function purgerNoncesDemarrage(store: Store, now: string, logger: LoggerCommun): Promise<void> {
  if (store.nonces.purge === undefined) return;
  try {
    const effaces = await store.nonces.purge(now);
    if (effaces > 0) logger.info('nonces expirés purgés au démarrage', { effaces });
  } catch (erreur) {
    logger.warn('purge des nonces impossible au démarrage', { erreur: String(erreur) });
  }
}

/** Assemble le Cerveau : dépendances fournies, ou valeurs par défaut. */
export function assemblerCerveau(options: OptionsAssemblage = {}): Cerveau {
  const store = options.store ?? createMemoryStore();
  const vault = options.vault ?? createMemorySecretVault();
  const reglages = options.reglages ?? createMemoryReglagesStore();
  const config = configParDefaut(options.config);
  const clock = options.clock ?? horlogeReelle();
  const logger = options.logger ?? loggerConsole();
  const jira = options.jira ?? createJiraReader({ baseUrl: config.siteUrl });

  const depsEval: DepsEvaluate = { store, jira, clock, logger };
  const evaluate = createEvaluateService(depsEval);

  const bridgeDeps: BridgeDeps = {
    pairing: createPairingRepository(store, vault, config),
    context: createContextRepository(store, config),
    waivers: createWaiverService(store, clock),
    // Le journal d'audit des dérogations est un port de stockage : les écrans
    // le lisent par `store.waiverAudit` (item 50), le pont y écrit ici.
    nonces: store.nonces,
    evaluate,
    clock,
    logger,
    limite: creerLimiteurDebit({ ...RATE_LIMIT_PAR_DEFAUT, ...options.limiteDebit }, () => Date.parse(clock())),
    purgeNonces: creerPurgeurNonces(store.nonces),
    audit: { record: (entree) => store.waiverAudit.record(entree) },
    approbateurs: lecteurApprobateurs(reglages, config),
    config: {
      bridgeUrl: config.bridgeUrl,
      version: '1.0.0',
      siteUrl: config.siteUrl,
      adminAccountId: config.adminAccountId,
      locale: config.locale,
    },
  };

  return {
    store,
    vault,
    reglages,
    config,
    clock,
    logger,
    jira,
    bridgeDeps,
    evaluate,
    rovoDeps: createRovoDeps(store, reglages, config, clock, logger, evaluate, depsEval),
    uiDeps: { store, reglages, config, clock, evaluate, depsEval, logger },
  };
}

/** Traite une requête du pont avec l'assemblage fourni. */
export function traiterPont(cerveau: Cerveau, requete: BridgeRequest) {
  return gererRequetePont(requete, cerveau.bridgeDeps);
}

/** Les cinq actions Rovo/MCP, liées à l'assemblage. */
export function actionsRovo(cerveau: Cerveau) {
  const deps = cerveau.rovoDeps;
  return {
    evaluateMerge: (payload: Record<string, unknown>) => runEvaluateMerge(deps, payload),
    explainBlock: (payload: Record<string, unknown>) => runExplainBlock(deps, payload),
    listFreezes: (payload: Record<string, unknown>) => runListFreezes(deps, payload),
    listApprovers: (payload: Record<string, unknown>) => runListApprovers(deps, payload),
    listWaivers: (payload: Record<string, unknown>) => runListWaivers(deps, payload),
    requestWaiver: (payload: Record<string, unknown>) => runRequestWaiver(deps, payload),
  };
}

/** Les trois resolvers d'écran, liés à l'assemblage. */
export function resolversUi(cerveau: Cerveau) {
  const deps = cerveau.uiDeps;
  return {
    reglages: (payload?: Record<string, unknown>, projet?: string) => handleResolverReglages(payload, deps, projet),
    encart: (payload?: Record<string, unknown>, issueKey?: string, projet?: string) =>
      handleResolverEncart(payload, issueKey, deps, projet),
    console: (payload?: Record<string, unknown>, projet?: string) => handleResolverConsole(payload, deps, projet),
  };
}

let instance: Cerveau | undefined;
let migrationsTentees: Promise<void> | undefined;

/**
 * Applique le schéma au premier appel, une seule fois par conteneur.
 *
 * Le déclencheur horaire reste le chemin nominal, mais sans ce rattrapage une
 * installation neuve répond `ForgeSQLError` sur toutes les routes jusqu'au
 * premier tick — constaté en vrai sur le site de démonstration. Les DDL sont
 * idempotents (`CREATE TABLE IF NOT EXISTS`) et l'échec est journalisé, jamais
 * propagé : une base absente doit produire une erreur lisible, pas un crash.
 */
function assurerMigrations(logger: LoggerCommun): Promise<void> {
  migrationsTentees ??= (async () => {
    try {
      const { runMigrations } = await import('../storage/migrate');
      const rapport = await runMigrations();
      logger.info('migrations au démarrage', {
        mode: rapport.mode,
        appliquees: rapport.applied.length,
        echec: rapport.failure ?? '',
      });
    } catch (erreur) {
      logger.warn('migrations impossibles au démarrage', { erreur: String(erreur) });
    }
  })();
  return migrationsTentees;
}

/** Assemblage de production, créé une seule fois par conteneur Forge. */
export async function cerveauProduction(): Promise<Cerveau> {
  if (!instance) {
    const logger = loggerConsole();
    const store = await creerStoreProduction(logger);
    const [{ createForgeSecretVault }, { createForgeReglagesStore }] = await Promise.all([
      import('./secrets'),
      import('./reglages'),
    ]);
    await assurerMigrations(logger);
    const { amorcerInstallation } = await import('./bootstrap');
    const { lireAmorcageEnv } = await import('./env');
    const env = lireAmorcageEnv();
    const { urlDuPontEffective } = await import('./pont-url');
    const bridgeUrl = await urlDuPontEffective();
    const vault = createForgeSecretVault();
    const horloge = horlogeReelle();
    await purgerNoncesDemarrage(store, horloge(), logger);
    const config = configParDefaut({
      bridgeUrl,
      siteUrl: env.siteUrl ?? configParDefaut().siteUrl,
    });
    await amorcerInstallation({ store, vault, config, clock: horloge, logger, env });
    // En mode démonstration, les tickets et les incidents du jeu d'exemple sont
    // servis localement : le site de démo ne contient ni le projet PAY ni de
    // JSM, et le cache à 60 s serait sinon écrasé par une lecture Jira vide.
    // Chaîne de lecture : Jira réel, jeu de démonstration par-dessus en mode
    // démo, puis délai maximal, retentative bornée et disjoncteur (§13.4,
    // §13.5). Sans le lecteur fiable, un Jira lent mange le budget de 5 s.
    let jira: IssueReader = createJiraReader({ baseUrl: config.siteUrl });
    if (env.jeuDeDemo) {
      const { createDemoReader } = await import('./demo-reader');
      jira = createDemoReader(jira, horloge());
      logger.info('mode démonstration actif : tickets et incidents servis depuis le jeu d’exemple');
    }
    jira = creerLecteurFiable(jira);
    instance = assemblerCerveau({
      store,
      vault,
      reglages: createForgeReglagesStore(),
      logger,
      config,
      clock: horloge,
      jira,
    });
    if (bridgeUrl === '') logger.warn('adresse du pont indisponible : le jumelage ne pourra pas aboutir');
  }
  return instance;
}

/** Réinitialise l'instance de production (tests d'intégration). */
export function reinitialiserProduction(): void {
  instance = undefined;
}
