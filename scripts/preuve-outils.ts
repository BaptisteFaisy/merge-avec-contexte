/**
 * Outillage du dossier de preuve (`docs/preuve/`).
 *
 * Chaque étape de la preuve réelle produit une **capture** : la requête signée
 * telle qu'elle a été partie, la réponse telle qu'elle est revenue, et une
 * empreinte SHA-256 du tout. Le secret partagé n'apparaît jamais : c'est la
 * signature HMAC qui est conservée, et `preuve-verifier.ts` la recalcule.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { signRequest } from '../shared/src/bridge/sign';

export const RACINE = resolveRacine();
export const DOSSIER = join(RACINE, 'docs', 'preuve');
export const CAPTURES = join(DOSSIER, 'captures');

/** Racine du dépôt (le dossier du fichier). */
function resolveRacine(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..');
}

/** Configuration de la preuve : pont, secret, espace, site Jira. */
export interface Configuration {
  url: string;
  secret: string;
  workspace: string;
  site: string;
}

/** Lit la configuration depuis l'environnement, avec les valeurs du poste. */
export function lireConfiguration(env: Record<string, string | undefined>): Configuration | undefined {
  const secret = env.MAC_SHARED_SECRET?.trim() || lireSecret();
  const url = env.MAC_BRIDGE_URL?.trim() || lireFichier('~/.atlassian/bridge-url-prod.txt');
  if (!secret || !url) return undefined;
  return {
    url,
    secret,
    workspace: env.MAC_WORKSPACE?.trim() || 'ws-demo',
    site: env.MAC_SITE_URL?.trim() || 'https://one-atlas-cndz.atlassian.net',
  };
}

/** Contenu d'un fichier du poste, ou chaîne vide. */
function lireFichier(chemin: string): string {
  const absolu = chemin.startsWith('~') ? join(process.env.HOME ?? '', chemin.slice(1)) : chemin;
  return existsSync(absolu) ? readFileSync(absolu, 'utf8').trim() : '';
}

/** Secret partagé du poste (jamais écrit dans le dépôt). */
function lireSecret(): string {
  return lireFichier('~/.atlassian/demo-shared-secret');
}

/** Identifiants Jira du poste (jamais écrits dans le dépôt). */
export function identifiantsJira(): { email: string; token: string } | undefined {
  const contenu = lireFichier('~/.atlassian-login');
  const ligne = contenu.split('\n').find((l) => l.startsWith('email='));
  const token = lireFichier('~/.atlassian-api-token');
  if (!ligne || !token) return undefined;
  return { email: ligne.slice('email='.length).trim(), token };
}

/** Réponse d'un appel pont, avec la requête qui l'a produite. */
export interface Appel {
  url: string;
  methode: string;
  entetes: Record<string, string>;
  corps: string;
  statut: number;
  reponse: string;
  dureeMs: number;
  horodatage: string;
}

/** Appelle le pont en conservant la requête et la réponse (pour la capture). */
export async function appelerCapture(
  config: Configuration,
  route: string,
  payload: unknown,
  signer = true,
): Promise<Appel> {
  const corps = JSON.stringify({ route, payload });
  const entetes: Record<string, string> = { 'content-type': 'application/json' };
  if (signer) Object.assign(entetes, signRequest({ secret: config.secret, body: corps }).headers);
  const debut = Date.now();
  const reponse = await fetch(config.url, { method: 'POST', headers: entetes, body: corps });
  const texte = await reponse.text();
  return {
    url: config.url,
    methode: 'POST',
    entetes,
    corps,
    statut: reponse.status,
    reponse: texte,
    dureeMs: Date.now() - debut,
    horodatage: new Date().toISOString(),
  };
}

/** Capture d'une étape, prête à être écrite sur disque. */
export interface Capture {
  etape: string;
  titre: string;
  horodatage: string;
  requete: unknown;
  reponse: unknown;
  preuve: Record<string, unknown>;
  empreinte: string;
}

/** Calcule l'empreinte SHA-256 d'une capture (hors le champ « empreinte »). */
export function empreinte(capture: Omit<Capture, 'empreinte'>): string {
  const canonique = JSON.stringify({
    etape: capture.etape,
    titre: capture.titre,
    horodatage: capture.horodatage,
    requete: capture.requete,
    reponse: capture.reponse,
    preuve: capture.preuve,
  });
  return `sha256:${createHash('sha256').update(canonique, 'utf8').digest('hex')}`;
}

/** Écrit une capture dans `docs/preuve/captures/`. */
export function ecrireCapture(capture: Capture): string {
  mkdirSync(CAPTURES, { recursive: true });
  const chemin = join(CAPTURES, `${capture.etape}.json`);
  writeFileSync(chemin, `${JSON.stringify(capture, null, 2)}\n`, 'utf8');
  return chemin;
}

/**
 * Sortie de `forge install list` : la preuve d'installation est produite par la
 * CLI (qui a son propre runtime), sa sortie est donc lue depuis un fichier.
 */
export function lireSortieForge(chemin = '/tmp/forge-install-capteur.txt'): string {
  return lireFichier(chemin);
}

/** Lit un ticket Jira réel (réponse brute de l'API). */
export async function lireTicket(site: string, cle: string): Promise<Record<string, unknown> | undefined> {
  const identifiants = identifiantsJira();
  if (!identifiants) return undefined;
  const base = Buffer.from(`${identifiants.email}:${identifiants.token}`).toString('base64');
  const reponse = await fetch(`${site}/rest/api/3/issue/${cle}`, {
    headers: { Authorization: `Basic ${base}`, Accept: 'application/json' },
  });
  if (!reponse.ok) return undefined;
  return (await reponse.json()) as Record<string, unknown>;
}

/** Champs utiles d'un ticket, pour la comparaison lors de la vérification. */
export function resumeTicket(ticket: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!ticket) return undefined;
  const champs = (ticket.fields ?? {}) as Record<string, unknown>;
  const liens = (champs.issuelinks ?? []) as Array<Record<string, unknown>>;
  return {
    cle: ticket.key,
    resume: champs.summary,
    // Le nom du statut est **localisé** (l'API le renvoie dans la langue du
    // demandeur) : c'est l'identifiant et la catégorie qui sont comparables.
    statutId: (champs.status as { id?: string } | undefined)?.id,
    statutCategorie: (champs.status as { statusCategory?: { key?: string } } | undefined)?.statusCategory?.key,
    composants: ((champs.components ?? []) as Array<{ name?: string }>).map((c) => c.name),
    versions: ((champs.fixVersions ?? []) as Array<{ name?: string; released?: boolean }>).map((v) => v.name),
    cases: (((champs.description ?? {}) as { content?: Array<{ content?: Array<{ text?: string }> }> })
      .content ?? []).flatMap((bloc) => bloc.content ?? []).map((paragraphe) => paragraphe.text ?? ''),
    liens: liens.map((lien) => {
      const type = (lien.type ?? {}) as { name?: string };
      const entrant = (lien.inwardIssue ?? {}) as { key?: string };
      const sortant = (lien.outwardIssue ?? {}) as { key?: string };
      return `${type.name}:${entrant.key ?? '-'}>${sortant.key ?? '-'}`;
    }),
  };
}
