/**
 * Variables d'environnement de l'app Forge.
 *
 * Elles servent deux cas légitimes : le déploiement automatisé (une adresse de
 * pont et un secret posés par `forge variables set` plutôt qu'à la main dans
 * l'interface) et la démonstration sans navigateur. Rien d'obligatoire : sans
 * elles, le produit fonctionne par l'interface (jumelage par code à usage
 * unique, bouton de chargement du jeu d'exemple).
 *
 * Le secret est posé chiffré (`forge variables set --encrypt`) et n'est jamais
 * journalisé.
 */

/** Une variable posée et non vide, sinon `undefined`. */
export function variable(nom: string): string | undefined {
  const valeur = process.env[nom];
  return typeof valeur === 'string' && valeur.trim() !== '' ? valeur.trim() : undefined;
}

/** Une variable drapeau : `1`, `true` ou `oui` valent vrai. */
export function drapeau(nom: string): boolean {
  const valeur = variable(nom)?.toLowerCase();
  return valeur === '1' || valeur === 'true' || valeur === 'oui' || valeur === 'yes';
}

/** Configuration d'amorçage lue dans l'environnement. */
export interface AmorcageEnv {
  /** Espace de travail Bitbucket à jumeler d'office. */
  workspaceUuid?: string;
  /** Secret partagé du pont (variable chiffrée). */
  secret?: string;
  /** Site Jira, si différent de celui de la configuration. */
  siteUrl?: string;
  /** Charger le jeu de démonstration au démarrage. */
  jeuDeDemo: boolean;
}

/** Lit l'amorçage demandé par l'environnement. */
export function lireAmorcageEnv(): AmorcageEnv {
  return {
    workspaceUuid: variable('MAC_PAIRED_WORKSPACE'),
    secret: variable('MAC_SHARED_SECRET'),
    siteUrl: variable('MAC_SITE_URL'),
    jeuDeDemo: drapeau('MAC_DEMO_DATA'),
  };
}

/** Vrai si un jumelage d'office est demandé (les deux moitiés sont présentes). */
export function jumelageDemande(amorcage: AmorcageEnv): boolean {
  return amorcage.workspaceUuid !== undefined && amorcage.secret !== undefined;
}
