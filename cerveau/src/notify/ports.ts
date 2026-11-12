/**
 * Port de notification (audit item 18) : commenter le ticket Jira concerné
 * quand une PR est bloquée.
 *
 * Comme tous les accès distants du dépôt (CONVENTIONS §1), la notification
 * passe par une interface : une implémentation réelle via `requestJira`
 * (`notifieur-jira.ts`), une implémentation mémoire pour les tests
 * (`notifieur-memoire.ts`). Le garde-fou anti-duplication vit dans
 * `notifier.ts`, pas ici : ce port ne fait qu'écrire et relire.
 */

/** Commentaire à poser sur un ticket, avec l'empreinte qui l'identifie. */
export interface Commentaire {
  /** Corps du commentaire (texte brut, une idée par ligne). */
  corps: string;
  /** Empreinte du blocage notifié : sert à la déduplication durable. */
  empreinte: string;
}

/** Sortie : poser un commentaire de blocage sur un ticket Jira. */
export interface Notifieur {
  /** Pose le commentaire ; lève en cas d'échec (l'appelant journalise). */
  commenter(cleTicket: string, commentaire: Commentaire): Promise<void>;
  /**
   * Empreintes des blocages déjà commentés sur ce ticket (déduplication qui
   * survit au conteneur). Facultatif : sans lui, le garde-fou mémoire de
   * `notifier.ts` reste seul en course.
   */
  empreintesCommentees?(cleTicket: string): Promise<string[]>;
}
