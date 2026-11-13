/**
 * Contenus et titres de la preuve Bitbucket (`scripts/preuve-bitbucket.ts`).
 *
 * Regroupés à part : ce sont des textes, pas de la logique — ils disent ce que
 * la pull request de preuve contient, et nulle part ailleurs.
 */

/** Contenu posé sur `main` : le squelette du dépôt. */
export function contenuInitial(ticket: string): string {
  return [
    `# ${ticket} — checkout-api`,
    '',
    "Service de paiement du panier. Ce dépôt est la cible de la preuve de",
    '« Merge avec contexte » : une branche, une pull request et le *custom merge',
    'check* du Capteur.',
    '',
  ].join('\n');
}

/** Contenu posé sur la branche : la limite de tentatives (ticket porté). */
export function contenuFonctionnalite(ticket: string): string {
  return [
    `# ${ticket} — Limite de tentatives d'authentification`,
    '',
    'Le endpoint `POST /checkout/auth` limite désormais les tentatives à **5 essais**',
    'par tranche de **15 minutes** et par adresse IP. Au-delà, la réponse `429` renvoie',
    'un délai de réessai (`Retry-After`).',
    '',
    '- 5 essais max, fenêtre glissante de 15 minutes ;',
    '- compteur par couple `(adresse IP, identifiant)` ;',
    '- verrou de 15 minutes puis remise à zéro automatique ;',
    '- journalisation anonymisée des verrous.',
    '',
  ].join('\n');
}

/**
 * Contenu du commit qui déclenche le contrôle de fusion.
 *
 * Le module `bitbucket:mergeCheck` n'écoute que `on-code-pushed` (nouveaux
 * commits sur la source), `on-reviewer-status-changed` et `on-merge` : un
 * dépôt de fichier fait *avant* l'ouverture de la pull request ne déclenche
 * donc rien. On pousse un second commit une fois la PR ouverte.
 */
export function contenuDeclenche(ticket: string): string {
  return [
    `# ${ticket} — déclenche le contrôle de fusion`,
    '',
    "Commit de déclenchement : la pull request est ouverte, ce nouveau commit",
    'sur sa branche source fait évaluer le *custom merge check* « Merge avec contexte ».',
    '',
  ].join('\n');
}

/** Titre de la pull request, qui porte la clé lue par la règle R-01. */
export function titrePullRequest(ticket: string): string {
  return `${ticket} — Limite de tentatives d'authentification`;
}

/** Description de la pull request : rappelle le ticket, la branche et la cible. */
export function descriptionPullRequest(ticket: string, branche: string, cible: string): string {
  return [
    `Implémente la limitation des tentatives d'authentification décrite dans ${ticket}.`,
    '',
    `- branche source : \`${branche}\``,
    `- branche cible : \`${cible}\``,
    '',
  ].join('\n');
}
