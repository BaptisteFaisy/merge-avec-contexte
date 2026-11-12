/**
 * Lecture réelle de la PR par l'API Cloud Bitbucket (`asApp().requestBitbucket`).
 *
 * Adaptateur fin : il ne décide rien, il rapporte les structures brutes à
 * `pr.ts` qui les traduit. L'espace de travail et le dépôt sont désignés par
 * leur UUID, accolades retirées (l'API Forge attend un identifiant, pas un
 * slug). Les relecteurs n'ont pas d'endpoint dédié : ils viennent de
 * `participants[]` de la PR elle-même (§8.3 de docs/FORGE-API-NOTES.md).
 *
 * La fonction de requête est injectée (`RequeteBitbucket`, même principe que
 * `FetchPont` dans `bridge/client.ts`) : les tests passent une doublure, le
 * comportement par défaut reste `api.asApp().requestBitbucket`.
 */
import api, { route } from '@forge/api';
import { unwrapUuid } from './types';
import type { CommitBrut, DiffstatBrut, PRCheckEvent, PullRequestBrut } from './types';

/** Type opaque renvoyé par le gabarit `route` de `@forge/api`. */
type Route = ReturnType<typeof route>;

/** Nombre maximal de commits lus : une seule page suffit au contrôle. */
export const MAX_COMMITS = 100;

/** Réponse minimale de `requestBitbucket` ; les tests passent une doublure. */
export interface ReponseBitbucket {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

/** Fonction de requête injectée : un chemin `route` vers une réponse JSON. */
export type RequeteBitbucket = (chemin: Route) => Promise<ReponseBitbucket>;

/** Tout ce qu'une lecture de PR rapporte au contrôle. */
export interface LecturePr {
  pr: PullRequestBrut;
  commits: CommitBrut[];
  diffstat: DiffstatBrut[];
}

/** Requête réelle : identité de l'app, via le gabarit `route` (anti-injection). */
export const requeteForge: RequeteBitbucket = (chemin) =>
  api.asApp().requestBitbucket(chemin) as unknown as Promise<ReponseBitbucket>;

/** Lit une ressource JSON ; lève si l'API répond autre chose qu'un succès. */
async function lireJson<T>(chemin: Route, requete: RequeteBitbucket): Promise<T> {
  const reponse = await requete(chemin);
  if (!reponse.ok) {
    throw new Error(`Bitbucket a répondu ${reponse.status} sur ${chemin.value}`);
  }
  return (await reponse.json()) as T;
}

/** Chemin de la PR, construit avec le gabarit `route` (anti-injection). */
export function routePr(event: PRCheckEvent): Route {
  const workspace = unwrapUuid(event.workspace.uuid);
  const depot = unwrapUuid(event.repository.uuid);
  const id = event.pullrequest.id;
  return route`/2.0/repositories/${workspace}/${depot}/pullrequests/${id}`;
}

/** Lit la PR, ses commits (100 au plus) et son diffstat en une passe. */
export async function lirePr(
  event: PRCheckEvent,
  requete: RequeteBitbucket = requeteForge,
): Promise<LecturePr> {
  const pr = routePr(event);
  const detail = await lireJson<PullRequestBrut>(pr, requete);
  const pageCommits = await lireJson<{ values?: CommitBrut[] }>(
    route`${pr}/commits?pagelen=${MAX_COMMITS}`,
    requete,
  );
  const pageDiffstat = await lireJson<{ values?: DiffstatBrut[] }>(
    route`${pr}/diffstat?pagelen=${MAX_COMMITS}`,
    requete,
  );
  return {
    pr: detail,
    commits: (pageCommits.values ?? []).slice(0, MAX_COMMITS),
    diffstat: pageDiffstat.values ?? [],
  };
}

/**
 * Lecture d'un fichier brut du dépôt (MC-17, §23) : `.merge-context.yml`.
 *
 * Adaptateur fin ajouté sans toucher à `lirePr` : le endpoint `src` renvoie le
 * contenu texte du fichier (pas du JSON), d'où un port `text()` distinct. La
 * révision (branche ou commit) est fournie par l'appelant — le payload du merge
 * check ne porte que l'identifiant de la PR, la branche vient de `lirePr`.
 */

/** Chemin du fichier de règles, à la racine du dépôt (§23). */
export const FICHIER_REGLES_DEPOT = '.merge-context.yml';

/** Réponse texte de `requestBitbucket` pour la lecture d'un fichier brut. */
export interface ReponseFichierBitbucket {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

/** Fonction de requête injectée rendant un fichier brut (texte). */
export type RequeteFichierBitbucket = (chemin: Route) => Promise<ReponseFichierBitbucket>;

/** Requête réelle d'un fichier brut : identité de l'app, gabarit `route`. */
export const requeteForgeFichier: RequeteFichierBitbucket = (chemin) =>
  api.asApp().requestBitbucket(chemin) as unknown as Promise<ReponseFichierBitbucket>;

/** Chemin `src` d'un fichier du dépôt à une révision (gabarit anti-injection). */
export function routeFichierDepot(
  workspaceUuid: string,
  depotUuid: string,
  revision: string,
  cheminFichier: string,
): Route {
  return route`/2.0/repositories/${unwrapUuid(workspaceUuid)}/${unwrapUuid(depotUuid)}/src/${revision}/${cheminFichier}`;
}

/**
 * Lit `.merge-context.yml` à la racine du dépôt. Rend son contenu texte, ou
 * `undefined` si le fichier est absent (404), vide, illisible ou injoignable :
 * la lecture ne fait **jamais** échouer le contrôle (§23, robustesse).
 */
export async function lireReglesDepot(
  ids: { workspaceUuid: string; depotUuid: string; revision: string },
  requete: RequeteFichierBitbucket = requeteForgeFichier,
): Promise<string | undefined> {
  try {
    const reponse = await requete(
      routeFichierDepot(ids.workspaceUuid, ids.depotUuid, ids.revision, FICHIER_REGLES_DEPOT),
    );
    if (!reponse.ok) return undefined;
    const texte = await reponse.text();
    return typeof texte === 'string' && texte.trim().length > 0 ? texte : undefined;
  } catch {
    return undefined;
  }
}
