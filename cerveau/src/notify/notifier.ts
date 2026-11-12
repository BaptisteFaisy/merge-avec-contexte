/**
 * Garde-fou de notification (audit item 18) : décider QUAND commenter, et
 * ne jamais commenter deux fois la même chose.
 *
 * Trois garde-fous, dans l'ordre :
 * 1. **Jamais en mode observation** : une règle observée ne bloque pas, le
 *    verdict reste `allowed` — on ne commente que les blocages réels (et jamais
 *    un repli « contexte indisponible », qui est `inconclusive`).
 * 2. **Au plus un commentaire par ticket et par ensemble de raisons** :
 *    l'empreinte (`empreinte.ts`) identifie le blocage ; déjà vue, on se tait.
 * 3. **Jamais de duplication à chaque relance du contrôle** : le registre
 *    mémoire couvre la vie du conteneur, et les empreintes lues sur le ticket
 *    (`notifieur.empreintesCommentees`) couvrent les conteneurs suivants.
 *
 * La notification est un effet de bord : elle ne lève jamais vers l'appelant,
 * un échec Jira est journalisé et le contrôle continue.
 */
import type { LoggerCommun } from '../app/logger';
import type { Evaluation, Locale } from '../shared';
import { corpsCommentaire } from './message';
import { empreinteBlocage, raisonsBloquantesTriees } from './empreinte';
import type { Notifieur } from './ports';

/** Dépendances du service de notification : tout ce qui sort est injecté. */
export interface DepsNotification {
  /** Sortie : pose le commentaire sur le ticket Jira. */
  notifieur: Notifieur;
  /** Journal des échecs (jamais d'exception propagée). */
  logger: LoggerCommun;
}

/** Service de notification des blocages. */
export interface ServiceNotification {
  /** Commente les tickets d'une évaluation bloquée, si ce n'est pas déjà fait. */
  notifierBlocage(evaluation: Evaluation, locale: Locale): Promise<void>;
}

/** Un blocage est-il réel (ni observation, ni repli, ni raisons levées) ? */
export function blocageReel(evaluation: Evaluation): boolean {
  if (evaluation.verdict !== 'blocked') return false;
  if (evaluation.observedOnly === true) return false;
  return raisonsBloquantesTriees(evaluation).length > 0;
}

/** Crée le service : le registre des empreintes vues vit dans la clôture. */
export function creerServiceNotification(deps: DepsNotification): ServiceNotification {
  const vues = new Set<string>();

  async function notifierUnTicket(cle: string, evaluation: Evaluation, locale: Locale): Promise<void> {
    const empreinte = empreinteBlocage(cle, evaluation);
    if (vues.has(empreinte)) return;
    vues.add(empreinte);
    try {
      const deja = (await deps.notifieur.empreintesCommentees?.(cle)) ?? [];
      if (deja.includes(empreinte)) return;
      await deps.notifieur.commenter(cle, {
        corps: corpsCommentaire(evaluation, locale),
        empreinte,
      });
    } catch (erreur) {
      // Le marquage est retiré : la prochaine relance réessaiera.
      vues.delete(empreinte);
      deps.logger.warn('notification de blocage impossible', { ticket: cle, erreur: String(erreur) });
    }
  }

  return {
    async notifierBlocage(evaluation, locale) {
      if (!blocageReel(evaluation)) return;
      for (const cle of evaluation.issueKeys) {
        await notifierUnTicket(cle, evaluation, locale);
      }
    },
  };
}
