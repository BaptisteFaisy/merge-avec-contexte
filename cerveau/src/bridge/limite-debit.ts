/**
 * Limite de débit du pont (item 10).
 *
 * L'URL du web trigger est publique et sans authentification Forge : la
 * signature protège le **contenu** d'une requête, pas son **volume**. Sans
 * limite, un appelant peut saturer le conteneur et la base à coups de requêtes
 * refusées. Ce module compte donc les requêtes admises dans une fenêtre
 * glissante, par espace de travail et globalement.
 *
 * Choix assumés :
 * - aucune dépendance : une `Map` de fenêtres suffit ;
 * - seules les requêtes **admises** consomment la fenêtre : un flot de
 *   requêtes refusées n'allonge pas le blocage des appelants légitimes ;
 * - la mémoire est bornée (`maxCles`) : au-delà, la clé la plus ancienne est
 *   oubliée, ce qui ne peut que rouvrir une fenêtre, jamais en fermer une ;
 * - l'horloge est injectée : aucun test ne dépend de l'heure réelle.
 */

/** Bornes de la limite : une fenêtre glissante, en requêtes admises. */
export interface RateLimitConfig {
  /** Requêtes admises par fenêtre pour un espace de travail. */
  parEspace: number;
  /** Requêtes admises par fenêtre, tous espaces de travail confondus. */
  global: number;
  /** Longueur de la fenêtre glissante, en millisecondes. */
  fenetreMs: number;
  /** Nombre maximal de fenêtres gardées en mémoire. */
  maxCles: number;
}

/** Bornes par défaut : larges pour un Capteur honnête, fermes pour un flot. */
export const RATE_LIMIT_PAR_DEFAUT: RateLimitConfig = {
  parEspace: 60,
  global: 240,
  fenetreMs: 60_000,
  maxCles: 512,
};

/** Quelle borne a été atteinte. */
export type RateLimitScope = 'global' | 'workspace';

/** Verdict : la requête passe, ou dit combien de temps attendre. */
export interface RateLimitVerdict {
  allowed: boolean;
  /** Borne atteinte, quand la requête est refusée. */
  scope?: RateLimitScope;
  /** Millisecondes avant qu'une place se libère dans la fenêtre. */
  retryAfterMs: number;
}

/** Compteur de requêtes du pont. */
export interface RateLimiter {
  /**
   * Demande une place pour une requête.
   *
   * `workspaceUuid` est l'espace annoncé dans le corps ; sans lui, seule la
   * borne globale est consultée (la requête sera de toute façon refusée plus
   * loin si elle prétend agir au nom d'un espace).
   */
  verifier(workspaceUuid: string | undefined): Promise<RateLimitVerdict>;
}

/** Clé de la fenêtre globale. */
const CLE_GLOBALE = 'global';

/** Fenêtres encore ouvertes à cet instant, dans l'ordre chronologique. */
function fenetreOuverte(horodatages: number[], debut: number): number[] {
  return horodatages.filter((instant) => instant > debut);
}

/**
 * Limiteur en fenêtre glissante, borné en mémoire.
 *
 * `clock` rend les millisecondes depuis l'epoch ; il est injecté pour que les
 * tests fassent avancer le temps sans attendre.
 */
export function creerLimiteurDebit(
  config: RateLimitConfig = RATE_LIMIT_PAR_DEFAUT,
  clock: () => number = Date.now,
): RateLimiter {
  const fenetres = new Map<string, number[]>();

  /** Oublie la clé la plus ancienne si la mémoire déborde. */
  const borner = () => {
    while (fenetres.size > config.maxCles) {
      const plusAncienne = fenetres.keys().next();
      if (plusAncienne.done === true) break;
      fenetres.delete(plusAncienne.value);
    }
  };

  /** Place encore libre dans la fenêtre d'une clé ? */
  const place = (cle: string, limite: number, maintenant: number, debut: number): boolean =>
    fenetreOuverte(fenetres.get(cle) ?? [], debut).length < limite;

  /** Note une requête admise dans la fenêtre d'une clé. */
  const noter = (cle: string, maintenant: number, debut: number): void => {
    fenetres.set(cle, [...fenetreOuverte(fenetres.get(cle) ?? [], debut), maintenant]);
  };

  /** Attente avant qu'une place se libère dans la fenêtre d'une clé. */
  const attente = (cle: string, maintenant: number, debut: number): number => {
    const ouverts = fenetreOuverte(fenetres.get(cle) ?? [], debut);
    const premier = ouverts[0] ?? maintenant;
    return Math.max(1, premier + config.fenetreMs - maintenant);
  };

  return {
    async verifier(workspaceUuid) {
      const maintenant = clock();
      const debut = maintenant - config.fenetreMs;
      const cleEspace = workspaceUuid === undefined ? undefined : `ws:${workspaceUuid}`;
      if (!place(CLE_GLOBALE, config.global, maintenant, debut)) {
        return { allowed: false, scope: 'global', retryAfterMs: attente(CLE_GLOBALE, maintenant, debut) };
      }
      if (cleEspace !== undefined && !place(cleEspace, config.parEspace, maintenant, debut)) {
        return { allowed: false, scope: 'workspace', retryAfterMs: attente(cleEspace, maintenant, debut) };
      }
      noter(CLE_GLOBALE, maintenant, debut);
      if (cleEspace !== undefined) noter(cleEspace, maintenant, debut);
      borner();
      return { allowed: true, retryAfterMs: 0 };
    },
  };
}

/** En-tête `Retry-After` d'un refus, en secondes (arrondi supérieur). */
export function retryAfterSecondes(verdict: RateLimitVerdict): string {
  return String(Math.max(1, Math.ceil(verdict.retryAfterMs / 1000)));
}
