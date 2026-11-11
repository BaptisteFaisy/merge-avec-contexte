/**
 * Configuration de l'installation du Cerveau.
 *
 * Une app Forge Jira est installée sur UN site : `siteUrl` et `projectId` sont
 * des constantes de l'installation, pas des données par requête. Aucune valeur
 * secrète ici — le secret du pont vit dans le coffre (`app/secrets.ts`).
 */
import type { FallbackPolicy, Locale } from '../shared';
import type { Store } from '../storage/ports';

export interface AppConfig {
  /** Site Jira jumelé, rendu au Capteur à la fin du jumelage. */
  siteUrl: string;
  /** Projet dont les réglages de règles sont lus. */
  projectId: string;
  /** URL publique du web trigger (`webTrigger.getUrl('pont-bitbucket')`). */
  bridgeUrl: string;
  /** Langue des messages rendus. */
  locale: Locale;
  /** Administrateur qui génère les codes de jumelage. */
  adminAccountId: string;
  /** Personnes habilitées à accorder une dérogation, à défaut de réglage. */
  approbateurs: string[];
}

/** Valeurs par défaut, à surcharger au déploiement ou dans les réglages. */
export function configParDefaut(surcharges: Partial<AppConfig> = {}): AppConfig {
  return {
    siteUrl: 'https://votre-site.atlassian.net',
    projectId: 'DEMO',
    bridgeUrl: '',
    locale: 'fr',
    adminAccountId: 'admin',
    approbateurs: [],
    ...surcharges,
  };
}

/** Politique de repli choisie par l'administrateur (§13.5), défaut `open`. */
export async function politiqueDeRepli(store: Store): Promise<FallbackPolicy> {
  try {
    return await store.pairing.fallbackPolicy();
  } catch {
    return 'open';
  }
}
