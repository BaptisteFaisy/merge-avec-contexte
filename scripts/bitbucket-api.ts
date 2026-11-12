/**
 * Client REST Bitbucket Cloud 2.0, réutilisable et typé.
 *
 * Ce module est la pièce « côté jeton » de l'outillage Bitbucket : il lit ses
 * identifiants dans l'environnement (`MAC_BB_TOKEN`, `MAC_BB_WORKSPACE`,
 * éventuellement `MAC_BB_USER` pour l'authentification basique) et ne porte
 * **aucun secret en dur**. Il couvre exactement le périmètre du scénario de
 * bout en bout (`scripts/preuve-bitbucket.ts`) : lister les dépôts, créer un
 * dépôt privé, créer une branche par l'API des refs, déposer un fichier par
 * l'API `src`, créer et lire une pull request, lire les résultats de contrôle
 * de fusion, et lister les « repository access tokens » si l'API les expose.
 *
 * Aucun réseau dans les tests : la fonction de récupération est injectée
 * (`RecuperateurHttp`), les tests fournissent une doublure.
 */

/** Base de l'API Bitbucket Cloud 2.0. Modifiable pour les tests. */
export const API_BASE = 'https://api.bitbucket.org/2.0';

/** Nom d'utilisateur conventionnel d'un « access token » Bitbucket. */
export const UTILISATEUR_JETON = 'x-token-auth';

/** Identifiants et cible d'un client, prêts à l'emploi. */
export interface ConfigurationBitbucket {
  /** Jeton d'accès (repository/project/workspace access token, ou app password). */
  token: string;
  /** Slug de l'espace de travail (ex. `one-atlas-cndz`). */
  workspace: string;
  /** Utilisateur de l'authentification basique (défaut `x-token-auth`). */
  user: string;
  /** Racine de l'API (défaut `https://api.bitbucket.org/2.0`). */
  baseUrl: string;
}

/** Réponse HTTP minimale, satisfaite par `fetch` comme par une doublure. */
export interface ReponseHttp {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

/** Fonction de récupération injectée : une URL et une initiative vers une réponse. */
export type RecuperateurHttp = (url: string, init?: RequestInit) => Promise<ReponseHttp>;

/** `fetch` natif, repli de production du client. */
export const recuperateurNatif: RecuperateurHttp = (url, init) => fetch(url, init) as Promise<ReponseHttp>;

/** Lit la configuration dans l'environnement ; explique quoi poser sinon. */
export function lireConfiguration(env: Record<string, string | undefined>): ConfigurationBitbucket | undefined {
  const token = env.MAC_BB_TOKEN?.trim();
  const workspace = env.MAC_BB_WORKSPACE?.trim();
  if (!token || !workspace) {
    const manquantes = [!token && 'MAC_BB_TOKEN', !workspace && 'MAC_BB_WORKSPACE'].filter(Boolean);
    console.error(`Variables manquantes : ${manquantes.join(', ')}`);
    console.error('  Créez un « repository access token » (Repository settings → Security → Access tokens)');
    console.error('  et posez MAC_BB_TOKEN=<jeton> MAC_BB_WORKSPACE=<espace>.');
    return undefined;
  }
  return {
    token,
    workspace,
    user: env.MAC_BB_USER?.trim() || UTILISATEUR_JETON,
    baseUrl: env.MAC_BB_API?.trim() || API_BASE,
  };
}

/** En-tête d'authentification basique, construit à partir de la configuration. */
export function enTeteAutorisation(config: ConfigurationBitbucket): Record<string, string> {
  const cree = Buffer.from(`${config.user}:${config.token}`, 'utf8').toString('base64');
  return { authorization: `Basic ${cree}` };
}

/** Erreur portant le statut, le chemin et le corps de la réponse Bitbucket. */
export class ErreurBitbucket extends Error {
  constructor(
    public readonly statut: number,
    public readonly chemin: string,
    public readonly corps: string,
  ) {
    super(`Bitbucket a répondu ${statut} sur ${chemin} : ${corps.slice(0, 200)}`);
    this.name = 'ErreurBitbucket';
  }
}

/** Vrai si une réponse 403 annonce le blocage d'adresse IP de l'espace. */
export function estBlocageIp(corps: string): boolean {
  return /whitelist/i.test(corps);
}

/** Vrai si une erreur est le refus « whitelist your IP » d'un espace. */
export function estErreurBlocageIp(erreur: unknown): erreur is ErreurBitbucket {
  return erreur instanceof ErreurBitbucket && erreur.statut === 403 && estBlocageIp(erreur.corps);
}

/** Message clair quand l'espace refuse l'adresse IP (voir `docs/PREUVE-REELLE.md` §5). */
export function messageBlocageIp(workspace: string): string {
  return `L'espace « ${workspace} » refuse cette adresse IP (HTTP 403 « whitelist your IP »). `
    + 'Demandez à un administrateur d' + "'" + `ajouter l'adresse IP à la liste blanche de l'espace, puis relancez.`;
}

/** Dépôt renvoyé par l'API, limité aux champs utilisés par l'outillage. */
export interface Depot {
  uuid?: string;
  full_name?: string;
  slug?: string;
  name?: string;
  is_private?: boolean;
  links?: { html?: { href?: string }; self?: { href?: string } };
}

/** Page de dépôts (collection paginée Bitbucket). */
export interface PageDepots {
  values?: Depot[];
  size?: number;
  page?: number;
  pagelen?: number;
  next?: string;
}

/** Référence (branche ou tag) renvoyée par l'API des refs. */
export interface Ref {
  name?: string;
  target?: { hash?: string };
  links?: { html?: { href?: string } };
}

/** Branche source ou cible d'une pull request. */
export interface ExtrPullRequest {
  branch?: { name?: string };
  repository?: { full_name?: string; uuid?: string };
}

/** Pull request renvoyée par l'API, limitée aux champs utilisés. */
export interface PullRequest {
  id?: number;
  title?: string;
  description?: string;
  state?: string;
  source?: ExtrPullRequest;
  destination?: ExtrPullRequest;
  links?: { html?: { href?: string }; self?: { href?: string } };
}

/** Un contrôle de fusion (type, statut, blocage) renvoyé par `mergeability/checks`. */
export interface ControleFusion {
  type?: string;
  status?: string;
  required?: boolean;
  blocking?: boolean;
  message?: string;
  check?: { id?: string; name?: string; kind?: string };
}

/** Résultat de l'endpoint `mergeability/checks`. */
export interface ResultatsControles {
  values?: ControleFusion[];
}

/** Jeton d'accès de dépôt, si l'API l'expose (aujourd'hui indisponible). */
export interface JetonAcces {
  id?: string;
  name?: string;
  scopes?: string[];
}

/** Corps de création d'un dépôt. */
export interface CorpsDepot {
  scm: 'git';
  is_private: boolean;
}

/** Corps de création d'une pull request. */
export interface CorpsPullRequest {
  title: string;
  description?: string;
  source: { branch: { name: string } };
  destination: { branch: { name: string } };
}

/**
 * Client Bitbucket Cloud 2.0. Chaque méthode couvre un endpoint précis ; la
 * récupération est injectée pour rendre le tout testable sans réseau.
 */
export class ClientBitbucket {
  constructor(
    private readonly config: ConfigurationBitbucket,
    private readonly recuperer: RecuperateurHttp = recuperateurNatif,
  ) {}

  /** URL complète d'une route relative, en 2.0. */
  private href(route: string): string {
    return `${this.config.baseUrl}${route}`;
  }

  /** Envoie une requête, lit le corps texte, lève sur un statut non 2xx. */
  private async envoyer(
    method: string,
    route: string,
    corps?: unknown,
    entetes: Record<string, string> = {},
  ): Promise<string> {
    const init: RequestInit = { method, headers: { ...enTeteAutorisation(this.config), accept: 'application/json', ...entetes } };
    if (corps !== undefined) {
      init.body = typeof corps === 'string' ? corps : JSON.stringify(corps);
    }
    const reponse = await this.recuperer(this.href(route), init);
    const texte = await reponse.text();
    if (!reponse.ok) throw new ErreurBitbucket(reponse.status, route, texte);
    return texte;
  }

  /** Requête JSON vers le retour typé `T`. */
  private async json<T>(method: string, route: string, corps?: unknown): Promise<T> {
    const texte = await this.envoyer(method, route, corps, { 'content-type': 'application/json' });
    return texte ? (JSON.parse(texte) as T) : (undefined as unknown as T);
  }

  /** Liste les dépôts de l'espace. */
  async listerDepots(): Promise<PageDepots> {
    return this.json<PageDepots>('GET', `/repositories/${this.config.workspace}`);
  }

  /** Lit l'espace de travail (vérifie l'accès). */
  async lireEspace(): Promise<{ name?: string; slug?: string; uuid?: string; is_private?: boolean }> {
    return this.json('GET', `/workspaces/${this.config.workspace}`);
  }

  /** Lit un dépôt de l'espace, ou lève 404 s'il n'existe pas. */
  async lireDepot(slug: string): Promise<Depot> {
    return this.json<Depot>('GET', `/repositories/${this.config.workspace}/${slug}`);
  }

  /** Crée un dépôt privé Git dans l'espace. */
  async creerDepot(slug: string, privé: boolean): Promise<Depot> {
    const corps: CorpsDepot = { scm: 'git', is_private: privé };
    return this.json<Depot>('POST', `/repositories/${this.config.workspace}/${slug}`, corps);
  }

  /** Lit une branche (son hash cible sert à créer une autre branche). */
  async lireBranche(slug: string, nom: string): Promise<Ref> {
    return this.json<Ref>('GET', `/repositories/${this.config.workspace}/${slug}/refs/branches/${nom}`);
  }

  /** Crée une branche à partir du hash d'une branche existante. */
  async creerBranche(slug: string, nom: string, hashCible: string): Promise<Ref> {
    return this.json<Ref>('POST', `/repositories/${this.config.workspace}/${slug}/refs/branches`, {
      name: nom,
      target: { hash: hashCible },
    });
  }

  /**
   * Dépose un fichier texte sur une branche (endpoint `src`, commit par formulaire).
   *
   * `chemin` est interprété depuis la racine du dépôt ; `message` est le message
   * de commit. Le corps est encodé en `application/x-www-form-urlencoded`.
   */
  async deposerFichier(slug: string, chemin: string, contenu: string, message: string, branche: string): Promise<void> {
    const requete = new URLSearchParams();
    requete.set('branch', branche);
    requete.set('message', message);
    requete.set(chemin, contenu);
    await this.envoyer('POST', `/repositories/${this.config.workspace}/${slug}/src`, requete.toString(), {
      'content-type': 'application/x-www-form-urlencoded',
    });
  }

  /** Crée une pull request avec source et destination nommées. */
  async creerPullRequest(slug: string, corps: CorpsPullRequest): Promise<PullRequest> {
    return this.json<PullRequest>('POST', `/repositories/${this.config.workspace}/${slug}/pullrequests`, corps);
  }

  /** Lit une pull request par son identifiant. */
  async lirePullRequest(slug: string, identifiant: number): Promise<PullRequest> {
    return this.json<PullRequest>('GET', `/repositories/${this.config.workspace}/${slug}/pullrequests/${identifiant}`);
  }

  /** Lit les résultats de contrôle de fusion d'une pull request. */
  async lireControlesFusion(slug: string, identifiant: number): Promise<ResultatsControles> {
    return this.json<ResultatsControles>('GET', `/repositories/${this.config.workspace}/${slug}/pullrequests/${identifiant}/mergeability/checks`);
  }

  /**
   * Liste les « repository access tokens » du dépôt, ou `undefined` si l'API ne
   * les expose pas (endpoint absent : HTTP 404, cf. `docs/PREUVE-REELLE.md` §5).
   */
  async listerJetonsAcces(slug: string): Promise<JetonAcces[] | undefined> {
    try {
      const page = await this.json<{ values?: JetonAcces[] }>(
        'GET',
        `/repositories/${this.config.workspace}/${slug}/access-tokens`,
      );
      return page.values ?? [];
    } catch (erreur) {
      if (erreur instanceof ErreurBitbucket && erreur.statut === 404) return undefined;
      throw erreur;
    }
  }
}