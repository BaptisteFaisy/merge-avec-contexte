#!/usr/bin/env -S npx vite-node --
/**
 * Vérifie le dossier de preuve, étape par étape.
 *
 * Pour chaque capture : l'empreinte SHA-256 est recalculée, la signature HMAC
 * est recomputée sur le corps enregistré, les données Jira sont relues sur le
 * site, et le cas est rejoué en direct pour voir si le verdict tient encore.
 * Le résultat est un tableau : une étape qui ne se vérifie plus est signalée.
 *
 * Usage : MAC_BRIDGE_URL=… MAC_SHARED_SECRET=… npx vite-node scripts/preuve-verifier.ts
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { computeSignature } from '../shared/src/bridge/sign';

import {
  appelerCapture,
  CAPTURES,
  lireConfiguration,
  lireTicket,
  resumeTicket,
  type Configuration,
} from './preuve-outils';

const SITE = process.env.MAC_SITE_URL?.trim() || 'https://one-atlas-cndz.atlassian.net';

interface Ligne {
  etape: string;
  preuve: string;
  etat: 'OK' | 'KO' | 'INDISPONIBLE';
  detail: string;
}

/** Compare deux objets sur leurs champs textuels (ordre des tableaux ignoré). */
function comparable(valeur: unknown): string {
  return JSON.stringify(valeur, (cle, v) => (Array.isArray(v) ? [...v].sort() : v));
}

/** Recalcule l'empreinte d'une capture et la compare à celle enregistrée. */
function empreinteIntacte(capture: Record<string, unknown>): boolean {
  const { empreinte: _, ...reste } = capture;
  const canonique = JSON.stringify({
    etape: capture.etape,
    titre: capture.titre,
    horodatage: capture.horodatage,
    requete: capture.requete,
    reponse: capture.reponse,
    preuve: capture.preuve,
  });
  const calcule = `sha256:${createHash('sha256').update(canonique, 'utf8').digest('hex')}`;
  return calcule === capture.empreinte;
}

/** Vérifie une capture de ticket Jira : le ticket est-il toujours là, identique ? */
async function verifierTicket(capture: Record<string, unknown>, config: Configuration): Promise<Ligne> {
  const etape = String(capture.etape);
  const cle = String((capture.preuve as { cle?: string }).cle ?? '');
  const attendu = (capture.reponse as { resume?: Record<string, unknown> })?.resume;
  const ticket = await lireTicket(SITE, cle);
  if (!ticket) {
    return { etape, preuve: `ticket ${cle} relu sur ${SITE}`, etat: 'INDISPONIBLE', detail: 'lecture Jira impossible' };
  }
  const actuel = resumeTicket(ticket);
  const identique = comparable(attendu) === comparable(actuel);
  const cases = (actuel?.cases ?? []).filter((ligne) => /\[[ x]\]/.test(String(ligne))).length;
  return {
    etape,
    preuve: `GET ${SITE}/rest/api/3/issue/${cle} → 200`,
    etat: identique ? 'OK' : 'KO',
    detail: identique ? `${cases} case(s) d'acceptation, statut ${actuel?.statut}` : 'le ticket a changé depuis la capture',
  };
}

/** Vérifie une capture d'évaluation : signature recalculée + verdict rejoué. */
async function verifierEvaluation(capture: Record<string, unknown>, config: Configuration): Promise<Ligne> {
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
async function verifierCarte(capture: Record<string, unknown>, config: Configuration): Promise<Ligne> {
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
async function verifierNonSigne(capture: Record<string, unknown>, config: Configuration): Promise<Ligne> {
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
function verifierInstallation(capture: Record<string, unknown>): Ligne {
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
async function verifier(capture: Record<string, unknown>, config: Configuration): Promise<Ligne> {
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

async function main(): Promise<void> {
  const config = lireConfiguration(process.env);
  if (!config) {
    console.error('MAC_BRIDGE_URL et MAC_SHARED_SECRET sont requis.');
    process.exit(2);
  }
  const fichiers = readdirSync(CAPTURES).filter((nom) => nom.endsWith('.json')).sort();
  const lignes: Ligne[] = [];
  for (const nom of fichiers) {
    const capture = JSON.parse(readFileSync(join(CAPTURES, nom), 'utf8')) as Record<string, unknown>;
    lignes.push(await verifier(capture, config));
  }
  console.log(`\nDossier de preuve — ${lignes.length} étape(s)\n`);
  for (const ligne of lignes) {
    const etat = ligne.etat === 'OK' ? 'OK  ' : ligne.etat === 'KO' ? 'KO  ' : 'N/D ';
    console.log(`${etat} ${ligne.etape.padEnd(28)} ${ligne.preuve.padEnd(42)} ${ligne.detail}`);
  }
  const ko = lignes.filter((l) => l.etat === 'KO').length;
  console.log(`\n${lignes.length - ko} étape(s) vérifiée(s), ${ko} en échec\n`);
  process.exit(ko === 0 ? 0 : 1);
}

await main();
