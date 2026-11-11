/**
 * Échantillons réalistes des réponses REST de Bitbucket Cloud 2.0.
 *
 * Formes conformes à l'API documentée (GET /2.0/repositories/{workspace}/
 * {repo_slug}/pullrequests/{id}, /commits, /diffstat) et à
 * docs/FORGE-API-NOTES.md §3.2 : relecteurs dans `participants[]`, chemins
 * dans `diffstat`, pagination par page avec lien `next`. Les champs sont
 * volontairement plus riches que les types `*Brut` de `src/bitbucket/types`
 * (type, links, dates) : la transformation pure doit les tolérer.
 *
 * Aucune donnée réelle : comptes, UUID et dépôts sont fictifs.
 */
import type {
  CommitBrut,
  DiffstatBrut,
  ParticipantBrut,
  PullRequestBrut,
} from '../src/bitbucket/types';
import type { ReponseBitbucket } from '../src/bitbucket/api';

/** Lien `links` tel que Bitbucket en renvoie partout. */
export interface LienBrut {
  href: string;
}

/** Utilisateur Bitbucket Cloud (compte rendu dans participants/reviewers). */
export interface UtilisateurEchantillon {
  type: 'user';
  uuid: string;
  account_id: string;
  display_name: string;
  nickname: string;
}

/** Participant de la PR : rôle, avis et compte (forme réelle). */
export interface ParticipantEchantillon extends ParticipantBrut {
  type: 'participant';
  user: UtilisateurEchantillon;
}

/** Dépôt cité dans source/destination d'une PR. */
export interface DepotEchantillon {
  type: 'repository';
  uuid: string;
  full_name: string;
  name: string;
}

/** PR brute, avec les champs réels non consommés par la transformation. */
export interface PrEchantillon extends PullRequestBrut {
  type: 'pullrequest';
  state: 'OPEN' | 'MERGED' | 'DECLINED' | 'SUPERSEDED';
  created_date: string;
  updated_date: string;
  author?: UtilisateurEchantillon;
  source: {
    type?: 'branch';
    branch: { type?: 'branch'; name: string };
    commit?: { type: 'commit'; hash: string };
    repository?: DepotEchantillon;
  };
  destination: {
    type?: 'branch';
    branch: { type?: 'branch'; name: string };
    commit?: { type: 'commit'; hash: string };
    repository?: DepotEchantillon;
  };
  participants?: ParticipantEchantillon[];
  reviewers?: UtilisateurEchantillon[];
  links: { self: LienBrut; html: LienBrut };
  close_source_branch: boolean;
  merge_commit: { type: 'commit'; hash: string } | null;
  comment_count: number;
  task_count: number;
}

/** Fichier d'une entrée de diffstat. */
export interface FichierDiffstatEchantillon {
  type: 'commit_file';
  path: string;
}

/** Entrée de diffstat, avec `type` et compteurs de lignes réels. */
export interface DiffstatEchantillon extends DiffstatBrut {
  type: 'diffstat';
  old?: FichierDiffstatEchantillon | null;
  new?: FichierDiffstatEchantillon | null;
}

/** Auteur d'un commit : `raw` toujours présent, `user` si compte lié. */
export interface AuteurEchantillon {
  type: 'author';
  raw: string;
  user?: { type: 'user'; account_id: string; display_name: string };
}

/** Commit brut, avec le rendu de message que Bitbucket ajoute. */
export interface CommitEchantillon extends CommitBrut {
  type: 'commit';
  author?: AuteurEchantillon;
  summary?: { type: 'rendered'; raw: string; markup: string; html: string };
  links?: { self: LienBrut; html?: LienBrut };
}

/** Page paginée telle que Bitbucket la renvoie (`values` + lien `next`). */
export interface PageEchantillon<T> {
  pagelen: number;
  page: number;
  size: number;
  values: T[];
  next?: string;
}

export const WS_UUID = '{b7e6c8d9-1a2b-4c3d-9e8f-0a1b2c3d4e5f}';
export const REPO_UUID = '{c9d8e7f6-5a4b-3c2d-1e0f-fedcba987654}';
export const FORK_UUID = '{1f0e9d8c-7b6a-5948-3726-1504abcdef01}';

const URL_API = 'https://api.bitbucket.org/2.0/repositories/acme/checkout/pullrequests';

const LEA: UtilisateurEchantillon = {
  type: 'user',
  uuid: '{2a3b4c5d-6e7f-4a1b-8c9d-0e1f2a3b4c5d}',
  account_id: '5d7a9f0c82e05b22cc7d4ef1',
  display_name: 'Léa Martin',
  nickname: 'lea',
};

const MARC: UtilisateurEchantillon = {
  type: 'user',
  uuid: '{3b4c5d6e-7f8a-4b1c-9d0e-1f2a3b4c5d6e}',
  account_id: '5d7a9f0c82e05b22cc7d4ef2',
  display_name: 'Marc Dupuis',
  nickname: 'marc',
};

const AWA: UtilisateurEchantillon = {
  type: 'user',
  uuid: '{4c5d6e7f-8a9b-4c1d-0e1f-2a3b4c5d6e7f}',
  account_id: '5d7a9f0c82e05b22cc7d4ef3',
  display_name: 'Awa Ndiaye',
  nickname: 'awa',
};

const HUGO: UtilisateurEchantillon = {
  type: 'user',
  uuid: '{5d6e7f8a-9b0c-4d1e-1f20-3a4b5c6d7e8f}',
  account_id: '5d7a9f0c82e05b22cc7d4ef4',
  display_name: 'Hugo Petit',
  nickname: 'hugo',
};

/** PR ordinaire du dépôt hôte : trois relecteurs aux trois états. */
export const PR_ECHANTILLON: PrEchantillon = {
  type: 'pullrequest',
  id: 17,
  title: 'PAY-123 limite les tentatives de connexion',
  description: 'Ajoute un compteur de tentatives et durcit le délai (PAY-123).',
  state: 'OPEN',
  created_date: '2026-11-03T09:12:33.456789+00:00',
  updated_date: '2026-11-04T14:02:11.123456+00:00',
  author: LEA,
  source: {
    type: 'branch',
    branch: { type: 'branch', name: 'feature/PAY-123-limite-tentatives' },
    commit: { type: 'commit', hash: '9b7b1c2d3e4f5a60718293a4b5c6d7e8f90a1b2c' },
    repository: {
      type: 'repository',
      uuid: REPO_UUID,
      full_name: 'acme/checkout',
      name: 'checkout',
    },
  },
  destination: {
    type: 'branch',
    branch: { type: 'branch', name: 'main' },
    commit: { type: 'commit', hash: '1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d' },
    repository: {
      type: 'repository',
      uuid: REPO_UUID,
      full_name: 'acme/checkout',
      name: 'checkout',
    },
  },
  participants: [
    { type: 'participant', user: LEA, role: 'REVIEWER', approved: true, state: 'approved' },
    { type: 'participant', user: MARC, role: 'REVIEWER', approved: false, state: 'changes_requested' },
    { type: 'participant', user: AWA, role: 'REVIEWER', approved: false, state: null },
    { type: 'participant', user: HUGO, role: 'PARTICIPANT', approved: false, state: null },
  ],
  reviewers: [LEA, MARC, AWA],
  links: {
    self: { href: `${URL_API}/17` },
    html: { href: 'https://bitbucket.org/acme/checkout/pull-requests/17' },
  },
  close_source_branch: true,
  merge_commit: null,
  comment_count: 4,
  task_count: 0,
};

/**
 * PR issue d'un fork : aucun champ `repository` au sommet (l'API réelle n'en
 * renvoie pas), `source.repository` désigne le dépôt du contributeur, et le
 * titre ne porte aucune clé de ticket — la clé vient d'un message de commit.
 */
export const PR_FORK: PrEchantillon = {
  ...PR_ECHANTILLON,
  id: 23,
  title: 'Limite les tentatives de connexion',
  description: 'Correctif proposé depuis un fork.',
  source: {
    type: 'branch',
    branch: { type: 'branch', name: 'hotfix/limite-tentatives' },
    commit: { type: 'commit', hash: 'e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4' },
    repository: {
      type: 'repository',
      uuid: FORK_UUID,
      full_name: 'partenaire/checkout',
      name: 'checkout',
    },
  },
  links: {
    self: { href: `${URL_API}/23` },
    html: { href: 'https://bitbucket.org/acme/checkout/pull-requests/23' },
  },
};

const COMMIT_COMPTEUR: CommitEchantillon = {
  type: 'commit',
  hash: '2468a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7',
  date: '2026-11-03T10:15:02+00:00',
  message: 'PAY-123 ajoute le compteur de tentatives\n',
  summary: {
    type: 'rendered',
    raw: 'PAY-123 ajoute le compteur de tentatives\n',
    markup: 'markdown',
    html: '<p>PAY-123 ajoute le compteur de tentatives</p>',
  },
  author: { type: 'author', raw: 'Léa Martin <lea@example.com>', user: { type: 'user', account_id: LEA.account_id, display_name: LEA.display_name } },
  links: { self: { href: 'https://api.bitbucket.org/2.0/repositories/acme/checkout/commit/2468a0b1' } },
};

const COMMIT_CONFIG: CommitEchantillon = {
  type: 'commit',
  hash: '13579bdf8a6c4e2f0b1d3a5c7e9f8b6d4a2c0e1f',
  date: '2026-11-03T16:42:19+00:00',
  message: 'PAY-123 extrait la configuration du délai\n',
  author: { type: 'author', raw: 'Marc Dupuis <marc@example.com>' },
  links: { self: { href: 'https://api.bitbucket.org/2.0/repositories/acme/checkout/commit/13579bdf' } },
};

const COMMIT_FUSION: CommitEchantillon = {
  type: 'commit',
  hash: '0f1e2d3c4b5a69788796a5b4c3d2e1f001122334',
  date: '2026-11-04T08:05:44+00:00',
  message: 'PAY-123 relit le compteur depuis la config\n',
  author: { type: 'author', raw: 'Léa Martin <lea@example.com>' },
  links: { self: { href: 'https://api.bitbucket.org/2.0/repositories/acme/checkout/commit/0f1e2d3c' } },
};

/** Page complète des commits de la PR (une seule page, pas de `next`). */
export const COMMITS_PAGE: PageEchantillon<CommitEchantillon> = {
  pagelen: 100,
  page: 1,
  size: 3,
  values: [COMMIT_FUSION, COMMIT_CONFIG, COMMIT_COMPTEUR],
};

/** Page partielle : deux commits seulement et un lien `next` vers la suite. */
export const COMMITS_PAGE_PARTIELLE: PageEchantillon<CommitEchantillon> = {
  pagelen: 2,
  page: 1,
  size: 2,
  values: [COMMIT_FUSION, COMMIT_CONFIG],
  next: `${URL_API}/17/commits?page=2`,
};

const FICHIER = (path: string): FichierDiffstatEchantillon => ({ type: 'commit_file', path });

/** Diffstat couvrant les quatre statuts : modifié, ajouté, supprimé, renommé. */
export const DIFFSTAT_PAGE: PageEchantillon<DiffstatEchantillon> = {
  pagelen: 100,
  page: 1,
  size: 4,
  values: [
    {
      type: 'diffstat',
      status: 'modified',
      old: FICHIER('src/paiement.ts'),
      new: FICHIER('src/paiement.ts'),
      lines_removed: 4,
      lines_added: 10,
    },
    {
      type: 'diffstat',
      status: 'added',
      old: null,
      new: FICHIER('src/compteur.ts'),
      lines_removed: 0,
      lines_added: 42,
    },
    {
      type: 'diffstat',
      status: 'removed',
      old: FICHIER('src/legacy/tentatives.ts'),
      new: null,
      lines_removed: 31,
      lines_added: 0,
    },
    {
      type: 'diffstat',
      status: 'renamed',
      old: FICHIER('src/config.ts'),
      new: FICHIER('src/config/limites.ts'),
      lines_removed: 2,
      lines_added: 2,
    },
  ],
};

/** Diffstat en page partielle, avec lien `next` (pagination tronquée). */
export const DIFFSTAT_PAGE_PARTIELLE: PageEchantillon<DiffstatEchantillon> = {
  pagelen: 2,
  page: 1,
  size: 2,
  values: DIFFSTAT_PAGE.values.slice(0, 2),
  next: `${URL_API}/17/diffstat?page=2`,
};

/** Réponse JSON de doublure pour `lirePr` (port `ReponseBitbucket`). */
export function reponseEchantillon(corps: unknown, statut = 200): ReponseBitbucket {
  return {
    ok: statut >= 200 && statut < 300,
    status: statut,
    json: async () => corps,
  };
}
