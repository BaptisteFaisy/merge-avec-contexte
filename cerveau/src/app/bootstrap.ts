/**
 * Amorçage d'une installation neuve.
 *
 * Deux opérations facultatives, déclenchées par des variables d'environnement
 * (`app/env.ts`), pour qu'une démonstration ou un déploiement automatisé n'ait
 * pas besoin d'un navigateur :
 *
 * 1. **jumelage d'office** : un espace de travail Bitbucket et un secret posés
 *    par `forge variables set` sont enregistrés comme jumelage — le secret va
 *    dans le coffre, la base ne garde que sa référence (§16) ;
 * 2. **jeu de démonstration** : les tickets, gels, incidents et correspondances
 *    du §20 sont écrits dans le stockage, pour que la console de test, l'agent
 *    Rovo et le pont aient de la matière.
 *
 * Les deux sont idempotents : un redémarrage ne recrée rien et ne remplace pas
 * un jumelage déjà établi par l'interface.
 */
import type { Store } from '../storage/ports';
import { chargerJeuDeDemo } from '../seed/loader';
import type { AppConfig } from './config';
import type { HorlogeIso } from './horloge';
import type { LoggerCommun } from './logger';
import type { SecretVault } from './secrets';
import type { AmorcageEnv } from './env';
import { jumelageDemande } from './env';

export type EtatJumelageAmorcage = 'cree' | 'existant' | 'non-demande';
export type EtatDemoAmorcage = 'charge' | 'deja-present' | 'non-demande';

export interface ResumeAmorcage {
  jumelage: EtatJumelageAmorcage;
  demo: EtatDemoAmorcage;
  /** Compte des données chargées, quand le jeu de démonstration est écrit. */
  demoResume?: { tickets: number; gels: number; incidents: number; regles: number };
}

export interface DepsAmorcage {
  store: Store;
  vault: SecretVault;
  config: AppConfig;
  clock: HorlogeIso;
  logger: LoggerCommun;
  env: AmorcageEnv;
}

/** Enregistre le jumelage demandé par l'environnement, s'il n'existe pas déjà. */
async function amorcerJumelage(deps: DepsAmorcage): Promise<EtatJumelageAmorcage> {
  const { env, store, vault, clock, logger } = deps;
  if (!jumelageDemande(env) || !env.workspaceUuid || !env.secret) return 'non-demande';
  const existant = await store.pairing.current();
  if (existant) {
    logger.info('amorçage : jumelage déjà en place, conservé', { workspace: existant.workspaceUuid });
    return 'existant';
  }
  const secretRef = await vault.write(env.secret);
  await store.pairing.recordPairing({
    workspaceUuid: env.workspaceUuid,
    secretRef,
    pairedAt: clock(),
    pairedBy: 'amorçage-par-environnement',
  });
  logger.info('amorçage : jumelage enregistré', { workspace: env.workspaceUuid });
  return 'cree';
}

/** Écrit le jeu de démonstration si le stockage est vide. */
async function amorcerDemo(deps: DepsAmorcage, workspaceUuid: string): Promise<{ etat: EtatDemoAmorcage; resume?: ResumeAmorcage['demoResume'] }> {
  const { env, store, clock, config, logger } = deps;
  if (!env.jeuDeDemo) return { etat: 'non-demande' };
  // Le jeu est daté relativement à l'instant du chargement : sans
  // rafraîchissement, un site chargé hier montre un gel déjà passé. Les
  // écritures sont des upserts, recharger est donc sans risque.
  const gels = env.rafraichirDemo ? [] : await store.freezes.list();
  if (gels.length > 0) {
    logger.info('amorçage : jeu de démonstration déjà chargé, rien à faire');
    return { etat: 'deja-present' };
  }
  const resume = await chargerJeuDeDemo(store, { projectId: config.projectId, now: clock(), workspaceUuid });
  logger.info('amorçage : jeu de démonstration chargé', { ...resume });
  return {
    etat: 'charge',
    resume: { tickets: resume.tickets, gels: resume.gels, incidents: resume.incidents, regles: resume.regles },
  };
}

/** Espace de travail à utiliser pour la correspondance dépôt → service. */
async function workspaceDeReference(deps: DepsAmorcage): Promise<string> {
  const existant = await deps.store.pairing.current();
  return existant?.workspaceUuid ?? deps.env.workspaceUuid ?? 'ws-demo';
}

/** Amorce l'installation : jumelage d'abord, jeu de démonstration ensuite. */
export async function amorcerInstallation(deps: DepsAmorcage): Promise<ResumeAmorcage> {
  const jumelage = await amorcerJumelage(deps);
  const workspaceUuid = await workspaceDeReference(deps);
  const demo = await amorcerDemo(deps, workspaceUuid);
  return { jumelage, demo: demo.etat, demoResume: demo.resume };
}
