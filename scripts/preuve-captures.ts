#!/usr/bin/env -S npx vite-node --
/**
 * Produit le dossier de preuve : une capture par étape.
 *
 * Chaque capture contient la requête (corps + en-têtes de signature), la
 * réponse, les identifiants vérifiables (clé Jira, URL, uuid d'espace) et une
 * empreinte SHA-256 : `scripts/preuve-verifier.ts` recalcule le tout et
 * dit, étape par étape, si la preuve tient encore.
 *
 * L'étape « PR Bitbucket réelle » a son propre fichier de preuve
 * (`docs/preuve/08-pr-bitbucket.json`), hors du dossier `captures/` : elle
 * n'est écrite que si l'environnement donne un accès réel à l'espace
 * (`MAC_BB_TOKEN`, `MAC_BB_WORKSPACE`, `MAC_BB_REPO`, `MAC_BB_PR_ID`). Sans
 * ces variables, rien n'est écrit — le dossier de preuve reste intact.
 *
 * Usage : MAC_BRIDGE_URL=… MAC_SHARED_SECRET=… npx vite-node scripts/preuve-captures.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  ClientBitbucket,
  lireConfiguration as lireConfigurationBitbucket,
  type ConfigurationBitbucket,
  type PullRequest,
  type ResultatsControles,
} from './bitbucket-api';
import {
  appelerCapture,
  lireSortieForge,
  ecrireCapture,
  empreinte,
  lireConfiguration,
  lireTicket,
  resumeTicket,
  type Capture,
  type Configuration,
} from './preuve-outils';

/* Le format du fichier de preuve de PR (chemin, libellé, type) est défini par
 * le vérificateur : on l'importe sans le laisser vérifier — son point d'entrée
 * ne doit pas se jouer au milieu d'une capture. */
process.env.MAC_PREUVE_SANS_VERIFICATION = '1';
const { CHEMIN_PREUVE_PR, ETAPE_PREUVE_PR, TYPE_PREUVE_PR } = await import('./preuve-verifier');

const SITE = process.env.MAC_SITE_URL?.trim() || 'https://one-atlas-cndz.atlassian.net';
const ESPACE_BITBUCKET = 'one-atlas-cndz';

/** Variables d'environnement nécessaires à la capture de PR Bitbucket. */
const VARIABLES_PR = ['MAC_BB_TOKEN', 'MAC_BB_WORKSPACE', 'MAC_BB_REPO', 'MAC_BB_PR_ID'] as const;

/** Configuration de la capture « PR Bitbucket réelle ». */
interface ConfigPr {
  client: ConfigurationBitbucket;
  repo: string;
  prId: number;
}

/** Charge utile d'évaluation pour un ticket réel. */
function payload(config: Configuration, cle: string, branche: string, pr: number) {
  return {
    workspaceUuid: config.workspace,
    repositoryUuid: 'checkout-api',
    repositorySlug: 'checkout-api',
    pullRequestId: pr,
    trigger: 'on-code-pushed',
    issueKeys: [cle],
    sourceBranch: branche,
    targetBranch: 'main',
  };
}

/** Enregistre une capture et rend son chemin. */
function conserver(etape: string, titre: string, requete: unknown, reponse: unknown, preuve: Record<string, unknown>): string {
  const capture = { etape, titre, horodatage: new Date().toISOString(), requete, reponse, preuve };
  const chemin = ecrireCapture({ ...capture, empreinte: empreinte(capture) });
  console.log(`✓ ${etape} · ${titre} → ${chemin}`);
  return chemin;
}

/** Étape 1 — les tickets réels existent bien sur le site. */
async function capturerTickets(config: Configuration): Promise<void> {
  for (const [cle, branche, pr] of [
    ['MAC-2', 'feature/MAC-2-limite-tentatives', 9001],
    ['MAC-3', 'feature/MAC-3-correctif-incident', 9002],
  ] as const) {
    const ticket = await lireTicket(SITE, cle);
    conserver(
      `etape-1-ticket-${cle.toLowerCase()}`,
      `Ticket réel ${cle} sur le site Jira`,
      { site: SITE, cle, url: `${SITE}/browse/${cle}` },
      { brut: ticket ?? null, resume: resumeTicket(ticket) ?? null },
      {
        type: 'ticket-jira',
        url: `${SITE}/browse/${cle}`,
        cle,
        attendu: `branche de PR : ${branche} (PR ${pr})`,
        lectureDirecte: ticket ? 'réponse JSON de l’API Jira (200)' : 'lecture impossible',
      },
    );
  }
}

/** Étape 2 — une requête signée est acceptée et produit un verdict. */
async function capturerVerdict(config: Configuration, cle: string, branche: string, pr: number, etape: string): Promise<void> {
  const requete = payload(config, cle, branche, pr);
  const appel = await appelerCapture(config, 'evaluate', requete);
  let corps: unknown = appel.reponse;
  try {
    corps = JSON.parse(appel.reponse);
  } catch {
    /* corps non JSON : on garde le texte */
  }
  const contenu = corps as { verdict?: string; message?: string; correlationId?: string };
  conserver(
    etape,
    `Verdict réel sur ${cle}`,
    { url: appel.url, methode: appel.methode, entetes: appel.entetes, corps: JSON.parse(appel.corps), corpsTexte: appel.corps },
    { statut: appel.statut, corps, dureeMs: appel.dureeMs },
    {
      type: 'evaluation-signee',
      signature: appel.entetes['x-mac-signature'] ?? null,
      horodatageSignature: appel.entetes['x-mac-timestamp'] ?? null,
      nonce: appel.entetes['x-mac-nonce'] ?? null,
      ticket: cle,
      urlJira: `${SITE}/browse/${cle}`,
      verdict: contenu.verdict ?? null,
      correlationId: contenu.correlationId ?? null,
    },
  );
}

/** Étape 3 — la carte expose les treize règles. */
async function capturerCarte(config: Configuration): Promise<void> {
  const requete = payload(config, 'MAC-2', 'feature/MAC-2-limite-tentatives', 9001);
  const appel = await appelerCapture(config, 'card', requete);
  let corps: unknown = appel.reponse;
  try {
    corps = JSON.parse(appel.reponse);
  } catch {
    /* corps non JSON */
  }
  const regles = ((corps as { rules?: unknown[] })?.rules ?? []).length;
  conserver(
    'etape-3-carte-13-regles',
    'Carte de PR détaillée (13 règles)',
    { url: appel.url, entetes: appel.entetes, corps: JSON.parse(appel.corps), corpsTexte: appel.corps },
    { statut: appel.statut, corps, dureeMs: appel.dureeMs },
    { type: 'carte-pr', nombreRegles: regles, ticket: 'MAC-2' },
  );
}

/** Étape 4 — une requête non signée est refusée. */
async function capturerNonSigne(config: Configuration): Promise<void> {
  const requete = payload(config, 'MAC-2', 'feature/MAC-2-limite-tentatives', 9001);
  const appel = await appelerCapture(config, 'evaluate', requete, false);
  conserver(
    'etape-4-requete-non-signee',
    'Requête non signée refusée (401)',
    { url: appel.url, entetes: appel.entetes, corps: JSON.parse(appel.corps), corpsTexte: appel.corps },
    { statut: appel.statut, corps: appel.reponse },
    { type: 'refus', statutAttendu: 401 },
  );
}

/** Étape 5 — l'espace Bitbucket et l'installation du Capteur. */
async function capturerBitbucket(): Promise<void> {
  const reponse = await fetch(`https://api.bitbucket.org/2.0/workspaces/${ESPACE_BITBUCKET}`);
  const espace = await reponse.json();
  const installation = lireSortieForge();
  conserver(
    'etape-5-capteur-installe',
    'Capteur installé sur l’espace Bitbucket réel',
    { commande: 'forge install list -e production', espace: ESPACE_BITBUCKET },
    { espace, installation },
    {
      type: 'installation-forge',
      appId: 'ari:cloud:ecosystem::app/0777c25e-2be7-44fc-aa99-6d82fd3789c1',
      urlEspace: `https://bitbucket.org/${ESPACE_BITBUCKET}`,
      uuid: (espace as { uuid?: string }).uuid ?? null,
      installation,
    },
  );
}

/** Lit la configuration de la capture de PR ; `undefined` si une variable manque. */
function lireConfigPr(env: Record<string, string | undefined>): ConfigPr | undefined {
  const manquantes = VARIABLES_PR.filter((nom) => !env[nom]?.trim());
  if (manquantes.length > 0) {
    console.log(`· PR Bitbucket : ${manquantes.join(', ')} manquante(s) — preuve non écrite (accès à l’espace non encore octroyé).`);
    return undefined;
  }
  const client = lireConfigurationBitbucket(env);
  const prId = Number(env.MAC_BB_PR_ID?.trim());
  if (!client || !Number.isInteger(prId) || prId <= 0) {
    console.log('· PR Bitbucket : MAC_BB_PR_ID doit être un identifiant de pull request — preuve non écrite.');
    return undefined;
  }
  return { client, repo: env.MAC_BB_REPO?.trim() ?? '', prId };
}

/** Compose la preuve de PR : PR brute, contrôles de fusion bruts, horodatage. */
function construirePreuvePr(config: ConfigPr, pr: PullRequest, controles: ResultatsControles): Omit<Capture, 'empreinte'> {
  const base = `${config.client.baseUrl}/repositories/${config.client.workspace}/${config.repo}/pullrequests/${config.prId}`;
  return {
    etape: ETAPE_PREUVE_PR,
    titre: `Pull request Bitbucket #${config.prId} et contrôle de fusion du Capteur`,
    horodatage: new Date().toISOString(),
    requete: { methode: 'GET', url: base, urlControles: `${base}/mergeability/checks` },
    reponse: { pullRequest: pr, controles },
    preuve: {
      type: TYPE_PREUVE_PR,
      workspace: config.client.workspace,
      repo: config.repo,
      prId: config.prId,
      url: pr.links?.html?.href ?? '',
      etat: pr.state ?? null,
      source: pr.source?.branch?.name ?? null,
      cible: pr.destination?.branch?.name ?? null,
    },
  };
}

/** Écrit la preuve de PR (son propre fichier, hors du dossier `captures/`). */
function ecrirePreuvePr(capture: Capture): string {
  mkdirSync(dirname(CHEMIN_PREUVE_PR), { recursive: true });
  writeFileSync(CHEMIN_PREUVE_PR, `${JSON.stringify(capture, null, 2)}\n`, 'utf8');
  return CHEMIN_PREUVE_PR;
}

/** Étape 8 — la pull request Bitbucket réelle et son contrôle de fusion. */
async function capturerPrBitbucket(env: Record<string, string | undefined>): Promise<void> {
  const config = lireConfigPr(env);
  if (!config) return;
  const client = new ClientBitbucket(config.client);
  try {
    const pr = await client.lirePullRequest(config.repo, config.prId);
    const controles = await client.lireControlesFusion(config.repo, config.prId);
    const capture = construirePreuvePr(config, pr, controles);
    const chemin = ecrirePreuvePr({ ...capture, empreinte: empreinte(capture) });
    console.log(`✓ ${ETAPE_PREUVE_PR} · Pull request Bitbucket #${config.prId} → ${chemin}`);
  } catch (erreur) {
    console.log(`· PR Bitbucket : capture impossible — ${erreur}`);
  }
}

async function main(): Promise<void> {
  await capturerPrBitbucket(process.env);
  const config = lireConfiguration(process.env);
  if (!config) {
    console.error('MAC_BRIDGE_URL et MAC_SHARED_SECRET sont requis.');
    process.exit(2);
  }
  console.log(`Captures de preuve — pont ${config.url.slice(0, 44)}…`);
  await capturerTickets(config);
  await capturerVerdict(config, 'MAC-2', 'feature/MAC-2-limite-tentatives', 9001, 'etape-2-verdict-mac-2');
  await capturerVerdict(config, 'MAC-3', 'feature/MAC-3-correctif-incident', 9002, 'etape-2b-verdict-mac-3');
  await capturerCarte(config);
  await capturerNonSigne(config);
  await capturerBitbucket();
  console.log('\nCaptures écrites dans docs/preuve/captures/ — vérifiez avec scripts/preuve-verifier.ts');
}

await main();
