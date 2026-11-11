/**
 * Cache des tickets du Cerveau (§13.4 : tenir les 5 secondes).
 *
 * Un instantané de ticket est servi tel quel pendant 60 secondes ; au-delà,
 * Jira est relu et le cache réécrit. Aucune fonction de ce module ne lève :
 * une panne de lecture rend `undefined` et laisse une ligne de journal.
 */
import type { IssueContext } from '../shared';
import type { IssueReader } from '../jira/reader';
import type { IssueCacheRepository } from './ports';

/** Durée de fraîcheur d'un instantané de ticket : 60 secondes. */
export const TTL_MS = 60_000;

/** Instantané marqué périmé sans être effacé (dernier recours lisible). */
const EPOQUE = '1970-01-01T00:00:00.000Z';

/** Ce dont tout cache a besoin : une horloge injectée, jamais `Date.now()`. */
export interface DepsHorloge {
  /** Horloge de l'appelant, en ISO 8601. */
  now: () => string;
  /** Fraîcheur demandée ; défaut `TTL_MS`. */
  ttlMs?: number;
  /** Journal des incidents de lecture (facultatif). */
  journal?: (message: string) => void;
}

/** Dépendances du cache des tickets. */
export interface DepsCacheTicket extends DepsHorloge {
  cache: IssueCacheRepository;
  lecteur: IssueReader;
}

/** Message lisible d'une erreur quelconque. */
export function messageErreur(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

/** Écrit une ligne de journal si l'appelant en a fourni un. */
export function journaliser(deps: DepsHorloge, message: string): void {
  deps.journal?.(message);
}

/**
 * Suit un déplacement de ticket (audit item 26, §17 cas 9).
 *
 * Un ticket déplacé de projet change de clé : Jira redirige l'ancienne et
 * rend le ticket sous la nouvelle. L'instantané est donc réécrit sous la clé
 * qui l'identifie désormais ; l'ancienne entrée est conservée mais marquée
 * périmée — pas effacée — pour la même raison que `invalider` : un instantané
 * périmé reste un dernier recours lisible, et toute relecture de l'ancienne
 * clé repassera par Jira, qui redirige à nouveau.
 */
async function suivreDeplacement(
  cle: string,
  issue: IssueContext,
  now: string,
  deps: DepsCacheTicket,
): Promise<void> {
  await ecrireEntree(issue.key, issue, now, deps);
  if (issue.key !== cle) await ecrireEntree(cle, issue, EPOQUE, deps);
}

/**
 * Vrai si `updatedAt` a moins de `ttlMs` au regard de l'horloge `now`.
 *
 * Un horodatage illisible ou dans le futur vaut périmé : mieux vaut relire
 * Jira que servir indéfiniment une entrée douteuse.
 */
export function estFrais(updatedAt: string, now: string, ttlMs: number): boolean {
  const ecrit = Date.parse(updatedAt);
  const instant = Date.parse(now);
  if (Number.isNaN(ecrit) || Number.isNaN(instant)) return false;
  const age = instant - ecrit;
  return age >= 0 && age < ttlMs;
}

/** Lit le cache sans jamais lever : une panne de stockage vaut absence. */
async function lireEntree(
  cle: string,
  deps: DepsCacheTicket,
): Promise<{ valeur: IssueContext; updatedAt: string } | undefined> {
  try {
    return await deps.cache.lire(cle);
  } catch (erreur) {
    journaliser(deps, `cache ${cle} : lecture impossible (${messageErreur(erreur)})`);
    return undefined;
  }
}

/** Réécrit le cache sans jamais lever : un cache en panne ne bloque pas l'évaluation. */
async function ecrireEntree(
  cle: string,
  snapshot: IssueContext,
  now: string,
  deps: DepsCacheTicket,
): Promise<void> {
  try {
    await deps.cache.ecrire(cle, snapshot, now);
  } catch (erreur) {
    journaliser(deps, `cache ${cle} : écriture impossible (${messageErreur(erreur)})`);
  }
}

/**
 * Instantané d'un ticket : le cache s'il a moins de 60 secondes, sinon Jira.
 *
 * Ne lève jamais : rend `undefined` si le cache est périmé et que Jira ne
 * répond pas, pour que l'appelant applique sa politique de repli (§13.5).
 */
export async function lireTicket(
  cle: string,
  deps: DepsCacheTicket,
): Promise<IssueContext | undefined> {
  const ttl = deps.ttlMs ?? TTL_MS;
  const now = deps.now();
  const entree = await lireEntree(cle, deps);
  if (entree && estFrais(entree.updatedAt, now, ttl)) return entree.valeur;
  try {
    const issue = await deps.lecteur.lire(cle);
    await suivreDeplacement(cle, issue, now, deps);
    return issue;
  } catch (erreur) {
    journaliser(deps, `ticket ${cle} : lecture Jira impossible (${messageErreur(erreur)})`);
    return undefined;
  }
}

/**
 * Marque l'entrée d'un ticket comme périmée (événement Jira, dérogation posée).
 *
 * L'instantané est conservé mais daté de l'époque : la prochaine lecture le
 * rafraîchira, et il reste lisible entre-temps.
 */
export async function invalider(cle: string, deps: DepsCacheTicket): Promise<void> {
  const entree = await lireEntree(cle, deps);
  if (!entree) return;
  await ecrireEntree(cle, entree.valeur, EPOQUE, deps);
}
