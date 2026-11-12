/**
 * Notifieur Jira réel (audit item 18) : adaptateur fin, seul fichier de ce
 * module qui importe `@forge/*`.
 *
 * Écriture : `POST /rest/api/3/issue/{cle}/comment` avec le corps au format
 * ADF (§9 + marche à suivre, scellé par l'empreinte). Relecture :
 * `GET /rest/api/3/issue/{cle}/comment`, dont on extrait les empreintes déjà
 * posées. La construction du document et l'extraction vivent dans `adf.ts`
 * (logique pure) ; ce fichier ne fait que poser la requête et vérifier la
 * réponse, comme `jira/reader.ts`.
 */
import api, { route } from '@forge/api';
import type { Route } from '@forge/api';
import { adfDepuisTexte, extraireEmpreintes } from './adf';
import type { Commentaire, Notifieur } from './ports';

/** Réponse REST minimale : ce que le notifieur sait exploiter. */
export interface ReponseJira {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

/** Requête REST Jira : `asApp()` en production, doublure en test. */
export type RequeteJira = (
  chemin: Route,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<ReponseJira>;

/** Requête par défaut : l'app elle-même, jamais l'utilisateur. */
const requeteParDefaut: RequeteJira = (chemin, init) => api.asApp().requestJira(chemin, init);

/** Chemin REST des commentaires d'un ticket. */
function cheminCommentaires(cle: string): Route {
  return route`/rest/api/3/issue/${cle}/comment`;
}

/** Crée le notifieur Jira ; `requete` injectable pour les tests. */
export function notifieurJira(requete: RequeteJira = requeteParDefaut): Notifieur {
  return {
    async commenter(cleTicket: string, commentaire: Commentaire): Promise<void> {
      const reponse = await requete(cheminCommentaires(cleTicket), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: adfDepuisTexte(commentaire.corps, commentaire.empreinte) }),
      });
      if (!reponse.ok) {
        throw new Error(`commentaire Jira refusé sur ${cleTicket} (HTTP ${reponse.status})`);
      }
    },
    async empreintesCommentees(cleTicket: string): Promise<string[]> {
      const reponse = await requete(cheminCommentaires(cleTicket));
      // Des commentaires illisibles ne doivent pas empêcher de notifier :
      // le registre mémoire du garde-fou reste la première ligne de défense.
      if (!reponse.ok) return [];
      return extraireEmpreintes(await reponse.json());
    },
  };
}
