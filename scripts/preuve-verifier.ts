#!/usr/bin/env -S npx vite-node --
/**
 * Vérifie le dossier de preuve, étape par étape.
 *
 * Pour chaque capture : l'empreinte SHA-256 est recalculée, la signature HMAC
 * est recomputée sur le corps enregistré, les données Jira sont relues sur le
 * site, et le cas est rejoué en direct pour voir si le verdict tient encore.
 * Le résultat est un tableau : une étape qui ne se vérifie plus est signalée.
 *
 * L'étape « PR Bitbucket réelle » a son propre fichier de preuve
 * (`docs/preuve/08-pr-bitbucket.json`), hors du dossier `captures/` : absent,
 * l'étape est **sautée** (la PR n'existe pas encore — l'accès en écriture à
 * l'espace Bitbucket n'est pas octroyé) ; présent, le fichier est contrôlé
 * comme les autres : empreinte recalculée, PR identifiée (identifiant, URL,
 * dépôt, espace), cohérence avec la PR brute et avec le résultat du contrôle
 * de fusion personnalisé.
 *
 * Usage : MAC_BRIDGE_URL=… MAC_SHARED_SECRET=… npx vite-node scripts/preuve-verifier.ts
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { computeSignature } from '../shared/src/bridge/sign';

import type { ControleFusion, PullRequest, ResultatsControles } from './bitbucket-api';
import {
  appelerCapture,
  CAPTURES,
  DOSSIER,
  empreinte,
  lireConfiguration,
  lireTicket,
  resumeTicket,
  type Capture,
  type Configuration,
} from './preuve-outils';

/** Libellé de l'étape « PR Bitbucket réelle » (compte rendu et fichier de preuve). */
export const ETAPE_PREUVE_PR = 'etape-8-pr-bitbucket';

/** Type de preuve porté par le fichier de la PR Bitbucket. */
export const TYPE_PREUVE_PR = 'pr-bitbucket';

/** Fichier de preuve de la PR Bitbucket (absent tant que la PR n'existe pas). */
export const CHEMIN_PREUVE_PR = join(DOSSIER, '08-pr-bitbucket.json');

const SITE = process.env.MAC_SITE_URL?.trim() || 'https://one-atlas-cndz.atlassian.net';

/** Une étape du contrôle : vérifiée, en échec, indisponible ou sautée. */
export interface Ligne {
  etape: string;
  preuve: string;
  etat: 'OK' | 'KO' | 'INDISPONIBLE' | 'SAUTEE';
  detail: string;
}

/** Identifiants de la PR attendus dans le fichier de preuve. */
interface PreuvePr {
  type?: string;
  workspace?: string;
  repo?: string;
  prId?: number;
  url?: string;
}

/** Compare deux objets sur leurs champs textuels (ordre des tableaux ignoré). */
function comparable(valeur: unknown): string {
  return JSON.stringify(valeur, (cle, v) => (Array.isArray(v) ? [...v].sort() : v));
}

/** Recalcule l'empreinte d'une capture et la compare à celle enregistrée. */
function empreinteIntacte(capture: Capture): boolean {
  return empreinte(capture) === capture.empreinte;
}

/** Vérifie une capture de ticket Jira : le ticket est-il toujours là, identique ? */
async function verifierTicket(capture: Capture, config: Configuration): Promise<Ligne> {
  const etape = String(capture.etape);
  const cle = String((capture.preuve as { cle?: string }).cle ?? '');
  const attendu = (capture.reponse as { resume?: Record<string, unknown> })?.resume;
  const ticket = await lireTicket(SITE, cle);
  if (!ticket) {
    return { etape, preuve: `ticket ${cle} relu sur ${SITE}`, etat: 'INDISPONIBLE', detail: 'lecture Jira impossible' };
  }
  const actuel = resumeTicket(ticket);
  const identique = comparable(attendu) === comparable(actuel);
  const cases = ((actuel?.cases as Array<unknown> | undefined) ?? [])
    .filter((ligne) => /\[[ x]\]/.test(String(ligne))).length;
  return {
    etape,
    preuve: `GET ${SITE}/rest/api/3/issue/${cle} → 200`,
    etat: identique ? 'OK' : 'KO',
    detail: identique
      ? `${cases} case(s) d'acceptation, statut ${actuel?.statutCategorie} (${actuel?.statutId})`
      : 'le ticket a changé depuis la capture',
  };
}

/** Vérifie une capture d'évaluation : signature recalculée + verdict rejoué. */
async function verifierEvaluation(capture: Capture, config: Configuration): Promise<Ligne> {
  const etape = String(capture.etape);
  const requete = capture.requete as { entetes?: Record<string, string>; corps?: unknown; corpsTexte?: string };
  const entetes = requete?.entetes ?? {};
  const corps = requete?.corpsTexte ?? JSON.stringify(requete?.corps ?? {});
  const signature = entetes['x-mac-signature'] ?? '';
  const recalcule = computeSignature(config.secret, entetes['x-mac-timestamp'] ?? '', entetes['x-mac-nonce'] ?? '', corps);
  const signatureValide = recalcule === signature;
  const charge = (JSON.parse(corps) as { payload?: unknown }).payload;
  const rejoue = await appelerCapture(config, 'evaluate', charge);
  let verdict: string | undefined;
  try {
    verdict = (JSON.parse(rejoue.reponse) as { verdict?: string }).verdict;
  } catch {
    verdict = undefined;
  }
  const attendu = (capture.preuve as { verdict?: string }).verdict;
  const verdictTient = verdict === attendu;
  const etat = signatureValide && verdictTient ? 'OK' : 'KO';
  return {
    etape,
    preuve: `signature HMAC recalculée + cas rejoué (${attendu})`,
    etat,
    detail: `${signatureValide ? 'signature conforme' : 'signature non conforme'}, ${verdictTient ? 'verdict identique' : `verdict ${verdict}`}, ${rejoue.dureeMs} ms`,
  };
}

/** Vérifie la capture « carte » : la carte expose-t-elle toujours 13 règles ? */
async function verifierCarte(capture: Capture, config: Configuration): Promise<Ligne> {
  const etape = String(capture.etape);
  const corps = (capture.requete as { corpsTexte?: string })?.corpsTexte ?? '{}';
  const charge = (JSON.parse(corps) as { payload?: unknown }).payload;
  const rejoue = await appelerCapture(config, 'card', charge);
  let nombre = 0;
  try {
    nombre = (((JSON.parse(rejoue.reponse) as { rules?: unknown[] }).rules ?? []) as unknown[]).length;
  } catch {
    nombre = 0;
  }
  return {
    etape,
    preuve: 'route `card` rejouée',
    etat: nombre === 13 ? 'OK' : 'KO',
    detail: `${nombre} règle(s) exposée(s)`,
  };
}

/** Vérifie la capture « non signé » : le refus tient-il ? */
async function verifierNonSigne(capture: Capture, config: Configuration): Promise<Ligne> {
  const etape = String(capture.etape);
  const corps = (capture.requete as { corpsTexte?: string })?.corpsTexte ?? '{}';
  const charge = (JSON.parse(corps) as { payload?: unknown }).payload;
  const rejoue = await appelerCapture(config, 'evaluate', charge, false);
  return {
    etape,
    preuve: 'requête rejouée sans signature',
    etat: rejoue.statut === 401 ? 'OK' : 'KO',
    detail: `HTTP ${rejoue.statut}`,
  };
}

/** Vérifie la capture « installation » : le Capteur est-il toujours installé ? */
function verifierInstallation(capture: Capture): Ligne {
  const etape = String(capture.etape);
  const installation = String((capture.reponse as { installation?: string }).installation ?? '');
  const attendu = '0777c25e-2be7-44fc-aa99-6d82fd3789c1';
  const installe = installation.includes(attendu) || /bitbucket/i.test(installation);
  return {
    etape,
    preuve: 'forge install list -e production',
    etat: installe ? 'OK' : 'KO',
    detail: installe ? 'Capteur installé sur l’espace Bitbucket' : installation.slice(0, 120),
  };
}

/** Vérifie une capture selon son type. */
async function verifier(capture: Capture, config: Configuration): Promise<Ligne> {
  if (!empreinteIntacte(capture)) {
    return { etape: String(capture.etape), preuve: 'empreinte SHA-256', etat: 'KO', detail: 'capture modifiée depuis son écriture' };
  }
  const type = String((capture.preuve as { type?: string }).type ?? '');
  if (type === 'ticket-jira') return verifierTicket(capture, config);
  if (type === 'evaluation-signee') return verifierEvaluation(capture, config);
  if (type === 'carte-pr') return verifierCarte(capture, config);
  if (type === 'refus') return verifierNonSigne(capture, config);
  if (type === 'installation-forge') return verifierInstallation(capture);
  return { etape: String(capture.etape), preuve: type || 'type inconnu', etat: 'INDISPONIBLE', detail: 'aucun contrôle prévu' };
}

/** Le contrôle de fusion personnalisé (celui du Capteur) dans la réponse brute. */
function controlePersonnalise(controles: ResultatsControles | undefined): ControleFusion | undefined {
  return (controles?.values ?? []).find((controle) => String(controle?.type ?? '').startsWith('custom'));
}

/** La PR brute contenue dans la réponse de la preuve. */
function pullRequestBrute(capture: Capture): PullRequest | undefined {
  return (capture.reponse as { pullRequest?: PullRequest }).pullRequest;
}

/** Écarts entre le résumé de la preuve et la PR brute enregistrée. */
function ecarts(capture: Capture): string[] {
  const preuve = capture.preuve as PreuvePr;
  const pr = pullRequestBrute(capture);
  const problemes: string[] = [];
  if (preuve.type !== TYPE_PREUVE_PR) problemes.push(`type « ${preuve.type ?? '?'} » au lieu de « ${TYPE_PREUVE_PR} »`);
  if (!preuve.workspace) problemes.push('espace manquant');
  if (!preuve.repo) problemes.push('dépôt manquant');
  if (!Number.isInteger(preuve.prId) || (preuve.prId ?? 0) <= 0) problemes.push('identifiant de PR manquant');
  if (!preuve.url || !/^https:\/\/bitbucket\.org\/[^/]+\/[^/]+\/pull-requests\/\d+$/.test(preuve.url)) {
    problemes.push('URL de PR absente ou inattendue');
  }
  if (!pr) {
    problemes.push('PR brute absente de la réponse');
    return problemes;
  }
  if (pr.id !== preuve.prId) problemes.push(`PR brute #${pr.id} ≠ #${preuve.prId}`);
  const html = pr.links?.html?.href;
  if (html !== undefined && html !== preuve.url) problemes.push('URL enregistrée ≠ URL de la PR brute');
  const complet = pr.source?.repository?.full_name;
  if (complet !== `${preuve.workspace}/${preuve.repo}`) {
    problemes.push(`dépôt « ${complet ?? '?'} » ≠ « ${preuve.workspace}/${preuve.repo} »`);
  }
  return problemes;
}

/** Vérifie le contenu du fichier de preuve de PR : identifiants et contrôle de fusion. */
function verifierPreuvePr(capture: Capture): Ligne {
  if (!empreinteIntacte(capture)) {
    return { etape: ETAPE_PREUVE_PR, preuve: 'empreinte SHA-256', etat: 'KO', detail: 'empreinte fausse — preuve modifiée depuis son écriture' };
  }
  const problemes = ecarts(capture);
  const controles = (capture.reponse as { controles?: ResultatsControles }).controles;
  const check = controlePersonnalise(controles);
  if (!check) {
    problemes.push('aucun contrôle de fusion personnalisé dans la réponse');
  } else if (!check.status) {
    problemes.push('contrôle de fusion sans statut');
  }
  if (problemes.length > 0) {
    return { etape: ETAPE_PREUVE_PR, preuve: 'preuve de PR Bitbucket', etat: 'KO', detail: problemes.join(' ; ') };
  }
  const pr = pullRequestBrute(capture);
  const nom = check?.check?.name ?? check?.type ?? 'contrôle';
  return {
    etape: ETAPE_PREUVE_PR,
    preuve: `PR #${pr?.id} — contrôle « ${nom} » : ${check?.status ?? '?'}`,
    etat: 'OK',
    detail: `${pr?.state ?? '?'} · ${check?.blocking ? 'bloquant' : 'non bloquant'}${check?.message ? ` — ${check.message}` : ''}`,
  };
}

/**
 * Vérifie l'étape « PR Bitbucket réelle ».
 *
 * Le fichier de preuve est absent tant que la pull request n'a pas été
 * photographiée : l'étape est alors **sautée** (pas un échec — l'accès en
 * écriture à l'espace n'est pas encore octroyé).
 */
export async function verifierEtapePr(chemin: string = CHEMIN_PREUVE_PR): Promise<Ligne> {
  if (!existsSync(chemin)) {
    return {
      etape: ETAPE_PREUVE_PR,
      preuve: 'fichier de preuve absent',
      etat: 'SAUTEE',
      detail: 'pas encore de PR Bitbucket capturée (accès à l’espace non octroyé)',
    };
  }
  let capture: Capture;
  try {
    capture = JSON.parse(readFileSync(chemin, 'utf8')) as Capture;
  } catch {
    return { etape: ETAPE_PREUVE_PR, preuve: 'fichier de preuve illisible', etat: 'KO', detail: 'JSON illisible' };
  }
  return verifierPreuvePr(capture);
}

/** Étiquette d'affichage d'un état d'étape. */
export function etiquette(etat: Ligne['etat']): string {
  if (etat === 'OK') return 'OK  ';
  if (etat === 'KO') return 'KO  ';
  if (etat === 'SAUTEE') return 'SAUT';
  return 'N/D ';
}

/** Résumé du contrôle : étapes vérifiées, en échec, sautées. */
export function resumer(lignes: Ligne[]): string {
  const ko = lignes.filter((ligne) => ligne.etat === 'KO').length;
  const sautees = lignes.filter((ligne) => ligne.etat === 'SAUTEE').length;
  return `${lignes.length - ko - sautees} étape(s) vérifiée(s), ${ko} en échec, ${sautees} sautée(s)`;
}

async function main(): Promise<void> {
  const config = lireConfiguration(process.env);
  if (!config) {
    console.error('MAC_BRIDGE_URL et MAC_SHARED_SECRET sont requis.');
    process.exit(2);
  }
  const fichiers = readdirSync(CAPTURES).filter((nom) => nom.endsWith('.json')).sort();
  const lignes: Ligne[] = [];
  for (const nom of fichiers) {
    const capture = JSON.parse(readFileSync(join(CAPTURES, nom), 'utf8')) as Capture;
    lignes.push(await verifier(capture, config));
  }
  lignes.push(await verifierEtapePr());
  console.log(`\nDossier de preuve — ${lignes.length} étape(s)\n`);
  for (const ligne of lignes) {
    console.log(`${etiquette(ligne.etat)} ${ligne.etape.padEnd(28)} ${ligne.preuve.padEnd(42)} ${ligne.detail}`);
  }
  const ko = lignes.filter((l) => l.etat === 'KO').length;
  console.log(`\n${resumer(lignes)}\n`);
  process.exit(ko === 0 ? 0 : 1);
}

/* L'import (par les tests, ou par `preuve-captures.ts` qui n'en veut que le
 * format du fichier) ne doit rien exécuter : `VITEST` est posé par vitest,
 * `MAC_PREUVE_SANS_VERIFICATION` par l'importeur qui ne veut pas la
 * vérification. Lancé en propre (`vite-node scripts/preuve-verifier.ts`), les
 * deux sont absents : le contrôle se joue. */
if (!process.env.VITEST && !process.env.MAC_PREUVE_SANS_VERIFICATION) {
  await main();
}
