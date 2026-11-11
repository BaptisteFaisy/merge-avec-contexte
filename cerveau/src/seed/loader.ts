/**
 * Charge le jeu de démonstration dans le stockage (§20, niveau 1).
 *
 * Les juges n'ont pas forcément Bitbucket : ce chargeur installe en une fois
 * les tickets, gels, incidents, correspondances dépôt → service, dérogations et
 * réglages du jeu d'exemple, pour que la console de test, l'agent Rovo et les
 * outils MCP aient de la matière. Idempotent : chaque écriture est un upsert.
 *
 * Les tickets sont placés dans le cache (`issue_cache`) et non lus depuis Jira :
 * le jeu est autonome, il ne dépend d'aucun projet réel du site.
 */
import type { Store } from '../storage/ports';
import { createDemoDataset, type DemoDataset } from './dataset';

/** Ce qui a été chargé, pour l'afficher à l'écran. */
export interface ResumeChargement {
  tickets: number;
  gels: number;
  incidents: number;
  correspondances: number;
  derogations: number;
  regles: number;
}

export interface OptionsChargement {
  /** Projet dont les réglages de règles sont écrits. */
  projectId: string;
  /** Horodatage injecté : décide de la fraîcheur du cache et des échéances. */
  now: string;
  /** Espace de travail Bitbucket de la correspondance ; celui du jeu par défaut. */
  workspaceUuid?: string;
}

async function chargerTickets(store: Store, jeu: DemoDataset, now: string): Promise<number> {
  await store.issueCache.writeMany(
    jeu.issues.map((issue) => ({ issueKey: issue.key, issue, updatedAt: now })),
  );
  return jeu.issues.length;
}

async function chargerGels(store: Store, jeu: DemoDataset): Promise<number> {
  for (const gel of jeu.freezes) await store.freezes.save(gel);
  return jeu.freezes.length;
}

async function chargerIncidents(store: Store, jeu: DemoDataset): Promise<number> {
  for (const incident of jeu.incidents) await store.incidents.open(incident);
  return jeu.incidents.length;
}

async function chargerCorrespondances(store: Store, jeu: DemoDataset, workspaceUuid: string, now: string): Promise<number> {
  for (const ligne of jeu.repoServices) {
    await store.repoService.upsert(
      {
        workspaceUuid,
        repoUuid: ligne.repositorySlug,
        service: ligne.service,
        jiraComponent: ligne.jiraComponent,
      },
      now,
    );
  }
  return jeu.repoServices.length;
}

async function chargerDerogations(store: Store, jeu: DemoDataset, now: string): Promise<number> {
  for (const derogation of jeu.waivers) {
    await store.waivers.create({
      ...derogation,
      requestedAt: derogation.requestedAt || now,
      issueKeys: derogation.id === 'waiver-1' ? ['PAY-123'] : ['PAY-123'],
    });
  }
  return jeu.waivers.length;
}

async function chargerRegles(store: Store, jeu: DemoDataset, projectId: string, now: string): Promise<number> {
  for (const config of jeu.configs) await store.ruleConfig.upsert(projectId, config, now);
  return jeu.configs.length;
}

/** Écrit le jeu de démonstration dans le stockage et rend le résumé. */
export async function chargerJeuDeDemo(store: Store, options: OptionsChargement): Promise<ResumeChargement> {
  const jeu = createDemoDataset(options.now);
  const workspaceUuid = options.workspaceUuid ?? jeu.workspace.uuid;
  const [tickets, gels, incidents, correspondances, derogations, regles] = await Promise.all([
    chargerTickets(store, jeu, options.now),
    chargerGels(store, jeu),
    chargerIncidents(store, jeu),
    chargerCorrespondances(store, jeu, workspaceUuid, options.now),
    chargerDerogations(store, jeu, options.now),
    chargerRegles(store, jeu, options.projectId, options.now),
  ]);
  return { tickets, gels, incidents, correspondances, derogations, regles };
}
