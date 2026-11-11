/**
 * Types spécifiques au module `bitbucket:mergeCheck` et à l'API Bitbucket REST.
 *
 * Décrit le payload d'invocation (§1.2 de docs/FORGE-API-NOTES.md) et les
 * structures JSON renvoyées par l'API Cloud Bitbucket (/pullrequests/{id},
 * /commits, /diffstat).
 */

/**
 * Retire les accolades `{…}` dont Bitbucket entoure ses UUID.
 *
 * Ni l'API Forge (`requestBitbucket` attend un identifiant nu) ni le KVS ne
 * les acceptent ; c'est le rôle de `unwrapUuid` côté `@forge/bitbucket`,
 * recodé ici pour ne pas ajouter de dépendance.
 */
export function unwrapUuid(uuid: string): string {
  return uuid.trim().replace(/^\{/, '').replace(/\}$/, '');
}

/** Payload d'invocation d'un merge check personnalisé Bitbucket. */
export interface PRCheckEvent {
  workspace: { uuid: string };
  repository: { uuid: string };
  pullrequest: { id: number };
  trigger: { type: string };
  mergeProperties?: {
    commitMessage: string;
    commitMessageTruncated: boolean;
    mergeStrategy: string;
    closeSourceBranch: boolean;
  };
}

/** Participant brut tel que renvoyé par l'API PR Bitbucket. */
export interface ParticipantBrut {
  role?: string;
  approved?: boolean;
  state?: 'approved' | 'changes_requested' | string | null;
  user?: {
    account_id?: string;
    uuid?: string;
    display_name?: string;
    nickname?: string;
  };
}

/** Objet Pull Request brut renvoyé par GET /2.0/repositories/.../pullrequests/{id}. */
export interface PullRequestBrut {
  id: number;
  title: string;
  description?: string;
  state?: string;
  /** Dépôt hôte : fournit le slug, absent du payload du merge check. */
  repository?: { slug?: string; name?: string; full_name?: string };
  source: {
    branch: { name: string };
    commit?: { hash: string };
    repository?: { uuid?: string; full_name?: string };
  };
  destination: {
    branch: { name: string };
    commit?: { hash: string };
    repository?: { uuid?: string; full_name?: string };
  };
  participants?: ParticipantBrut[];
  reviewers?: Array<{
    account_id?: string;
    uuid?: string;
    display_name?: string;
    nickname?: string;
  }>;
}

/** Entrée de commit renvoyée par GET /.../pullrequests/{id}/commits. */
export interface CommitBrut {
  hash: string;
  message: string;
  date?: string;
  author?: {
    raw?: string;
    user?: {
      account_id?: string;
      display_name?: string;
    };
  };
}

/** Entrée renvoyée par GET /.../pullrequests/{id}/diffstat. */
export interface DiffstatBrut {
  status?: 'added' | 'removed' | 'modified' | 'renamed' | string;
  lines_added?: number;
  lines_removed?: number;
  old?: { path?: string } | null;
  new?: { path?: string } | null;
}
