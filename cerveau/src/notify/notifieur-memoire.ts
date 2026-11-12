/**
 * Implémentation mémoire du port `Notifieur` : pour les tests, sans Forge ni
 * réseau (CONVENTIONS §1). Enregistre chaque commentaire posé et rend les
 * empreintes déjà commentées, exactement comme le ferait la relecture d'un
 * ticket réel.
 */
import type { Commentaire, Notifieur } from './ports';

/** Un commentaire tel qu'enregistré, avec le ticket visé. */
export interface CommentaireEnregistre extends Commentaire {
  cleTicket: string;
}

/** Notifieur mémoire : liste lisible + contrat complet du port. */
export interface NotifieurMemoire extends Notifieur {
  /** Commentaires posés, dans l'ordre. */
  readonly commentaires: CommentaireEnregistre[];
}

/** Crée un notifieur mémoire vide. */
export function notifieurMemoire(): NotifieurMemoire {
  const commentaires: CommentaireEnregistre[] = [];
  return {
    commentaires,
    async commenter(cleTicket, commentaire) {
      commentaires.push({ cleTicket, ...commentaire });
    },
    async empreintesCommentees(cleTicket) {
      return commentaires
        .filter((commentaire) => commentaire.cleTicket === cleTicket)
        .map((commentaire) => commentaire.empreinte);
    },
  };
}
