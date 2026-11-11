/**
 * Lecture réelle de la PR par l'API Cloud Bitbucket (`asApp().requestBitbucket`).
 *
 * Adaptateur fin : il ne décide rien, il rapporte les structures brutes à
 * `pr.ts` qui les traduit. L'espace de travail et le dépôt sont désignés par
 * leur UUID, accolades retirées (l'API Forge attend un identifiant, pas un
 * slug). Les relecteurs n'ont pas d'endpoint dédié : ils viennent de
 * `participants[]` de la PR elle-même (§8.3 de docs/FORGE-API-NOTES.md).
 */
import api, { route } from '@forge/api';
import { unwrapUuid } from './types';
import type { CommitBrut, DiffstatBrut, PRCheckEvent, PullRequestBrut } from './types';

/** Type opaque renvoyé par le gabarit `route` de `@forge/api`. */
type Route = ReturnType<typeof route>;

/** Nombre maximal de commits lus : une seule page suffit au contrôle. */
export const MAX_COMMITS = 100;

/** Tout ce qu'une lecture de PR rapporte au contrôle. */
export interface LecturePr {
  pr: PullRequestBrut;
  commits: CommitBrut[];
  diffstat: DiffstatBrut[];
}

/** Lit une ressource JSON ; lève si l'API répond autre chose qu'un succès. */
async function lireJson<T>(chemin: Route): Promise<T> {
  const reponse = await api.asApp().requestBitbucket(chemin);
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
export async function lirePr(event: PRCheckEvent): Promise<LecturePr> {
  const pr = routePr(event);
  const detail = await lireJson<PullRequestBrut>(pr);
  const pageCommits = await lireJson<{ values?: CommitBrut[] }>(
    route`${pr}/commits?pagelen=${MAX_COMMITS}`,
  );
  const pageDiffstat = await lireJson<{ values?: DiffstatBrut[] }>(
    route`${pr}/diffstat?pagelen=${MAX_COMMITS}`,
  );
  return {
    pr: detail,
    commits: (pageCommits.values ?? []).slice(0, MAX_COMMITS),
    diffstat: pageDiffstat.values ?? [],
  };
}
