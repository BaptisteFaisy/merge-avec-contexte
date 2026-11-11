/**
 * Racine d'assemblage du Cerveau : un seul endroit où tous les modules sont
 * branchés derrière leurs ports. Ni Forge, ni réseau, ni heure système ici :
 * tout est injecté, ce qui rend le câblage testable de bout en bout.
 */
import type { BridgeDeps, EvaluateService } from '../bridge/deps';
import { gererRequetePont, type BridgeRequest } from '../bridge/handler';
import { createJiraReader, type IssueReader } from '../jira/reader';
import type { RovoDeps } from '../rovo/deps';
import { runEvaluateMerge } from '../rovo/evaluate-merge';
import { runExplainBlock } from '../rovo/explain-block';
import { runListFreezes } from '../rovo/list-freezes';
import { runListWaivers } from '../rovo/list-waivers';
import { runRequestWaiver } from '../rovo/request-waiver';
import { createMemoryStore } from '../storage/memory-store';
import type { Store } from '../storage/ports';
import { configParDefaut, type AppConfig } from './config';
import { createContextRepository } from './context-repo';
import { createEvaluateService, type DepsEvaluate } from './evaluate';
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
    nonces: store.nonces,
    evaluate,
    clock,
    logger,
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
    const { urlDuPontEffective } = await import('./pont-url');
    const bridgeUrl = await urlDuPontEffective();
    instance = assemblerCerveau({
      store,
      vault: createForgeSecretVault(),
      reglages: createForgeReglagesStore(),
      logger,
      config: {
        bridgeUrl,
        siteUrl: process.env.MAC_SITE_URL ?? configParDefaut().siteUrl,
      },
    });
    if (bridgeUrl === '') logger.warn('adresse du pont indisponible : le jumelage ne pourra pas aboutir');
  }
  return instance;
}

/** Réinitialise l'instance de production (tests d'intégration). */
export function reinitialiserProduction(): void {
  instance = undefined;
}
