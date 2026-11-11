/**
 * Lecteur Jira de démonstration (§20, niveau 1).
 *
 * Le site de démonstration fourni par `forge site provision` ne contient ni le
 * projet `PAY`, ni les tickets du jeu d'exemple, ni d'incident JSM. Sans ce
 * décorateur, une évaluation en mode démonstration lirait Jira pour de vrai, ne
 * trouverait rien, et répondrait « clé inconnue » — la démo ne montrerait rien.
 *
 * Le décorateur répond depuis le jeu de démonstration pour les clés et les
 * services qu'il connaît, et **délègue au lecteur réel pour tout le reste** :
 * un vrai ticket du site reste lisible, la démo ne ment pas sur les données
 * réelles.
 *
 * Activé uniquement par la variable d'environnement `MAC_DEMO_DATA`
 * (`app/env.ts`) : en production normale, ce module n'est jamais branché.
 */
import type { Incident, IssueContext } from '../shared';
import type { IssueReader } from '../jira/reader';
import { createDemoDataset } from '../seed/dataset';

/** Lecteur mixte : jeu de démonstration d'abord, Jira réel ensuite. */
export function createDemoReader(sousJacent: IssueReader, now: string): IssueReader {
  const jeu = createDemoDataset(now);
  const tickets = new Map(jeu.issues.map((ticket) => [ticket.key.toUpperCase(), ticket]));
  const incidentsParService = new Map<string, Incident[]>();
  for (const incident of jeu.incidents) {
    const liste = incidentsParService.get(incident.service) ?? [];
    liste.push(incident);
    incidentsParService.set(incident.service, liste);
  }
  return {
    async lire(cle) {
      const trouve = tickets.get(cle.trim().toUpperCase());
      return trouve ?? sousJacent.lire(cle);
    },
    async incidentsOuverts(service) {
      const ouverts = (incidentsParService.get(service) ?? []).filter((incident) => incident.resolvedAt === undefined);
      if (ouverts.length > 0) return ouverts;
      return sousJacent.incidentsOuverts(service);
    },
  };
}

/** Clés de tickets servies par le jeu de démonstration (pour les écrans et les tests). */
export function clesDeDemo(now: string): string[] {
  return createDemoDataset(now).issues.map((ticket) => ticket.key);
}
