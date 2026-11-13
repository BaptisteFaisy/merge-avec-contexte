#!/usr/bin/env -S npx vite-node --
/**
 * Démonstration réelle — l'app déployée évalue de vrais tickets Jira.
 *
 * `npm run demo` lance **ce** scénario : aucune donnée de démonstration, le
 * Cerveau tourne avec `MAC_DEMO_DATA=0` et lit le site Jira réel de
 * l'organisation. Les tickets évalués existent vraiment (projet `MAC`) avec
 * leurs critères d'acceptation, leur lien « Blocks » et leur version publiée.
 * L'espace signé dans chaque requête est le vrai uuid de l'espace Bitbucket où
 * le Capteur est installé (`one-atlas-cndz`).
 *
 * L'étape 6 lit l'espace Bitbucket : dès qu'un jeton API est présent
 * (`MAC_BB_TOKEN`, `MAC_BB_WORKSPACE`), elle affiche la **vraie** pull request
 * — son URL, son identifiant, son état — et le verdict du contrôle de fusion
 * produit par l'app déployée. Sans jeton, ou quand l'espace refuse l'adresse
 * IP du poste, elle garde l'affichage honnête : ce qui est installé, ce qui a
 * été vérifié, et la raison exacte du blocage. Aucune pull request n'est
 * annoncée sans avoir été lue, et le scénario ne s'interrompt jamais sur une
 * erreur réseau.
 *
 * Le scénario fictif d'origine (`PAY-123` etc.) reste disponible :
 *   npm run demo:fictif
 *
 * Usage : MAC_BRIDGE_URL=<pont> MAC_SHARED_SECRET=<secret> \
 *         [MAC_WORKSPACE='{uuid}'] npm run demo
 *
 * Variables de l'étape Bitbucket (facultatives) : `MAC_BB_TOKEN`,
 * `MAC_BB_WORKSPACE`, `MAC_BB_REPO` (défaut `checkout-api`) et `MAC_BB_PR_ID`
 * (défaut : la pull request la plus récemment mise à jour du dépôt).
 *
 * Sortie : 0 si tous les cas réels donnent le verdict attendu, 1 sinon.
 */
import { writeFileSync } from 'node:fs';

import {
  afficherMessage,
  annonce,
  appeler,
  etape,
  lireConfiguration,
  payloadPr,
  raisonsBloquantes,
  type Configuration,
} from './demo-e2e';
import {
  API_BASE,
  ClientBitbucket,
  enTeteAutorisation,
  ErreurBitbucket,
  estErreurBlocageIp,
  lireConfiguration as lireConfigurationBitbucket,
  messageBlocageIp,
  recuperateurNatif,
  type ConfigurationBitbucket,
  type ControleFusion,
  type PullRequest,
  type RecuperateurHttp,
  type ResultatsControles,
} from './bitbucket-api';

const SITE = process.env.MAC_SITE_URL?.trim() || 'https://one-atlas-cndz.atlassian.net';

/** Vrai espace Bitbucket où le Capteur est installé (uuid de one-atlas-cndz). */
export const ESPACE_BITBUCKET = '{b44dcce8-0f72-4e36-bf40-65aead14ce35}';

/** Dépôt visé par l'étape Bitbucket, surchargeable par `MAC_BB_REPO`. */
export const DEPOT_DEFAUT = 'checkout-api';

/** Données réellement présentes sur le site (voir docs/preuve/). */
const REEL = {
  bloque: { cle: 'MAC-2', branche: 'feature/MAC-2-limite-tentatives', pr: 9001 },
  autorise: { cle: 'MAC-3', branche: 'feature/MAC-3-correctif-incident', pr: 9002 },
  inconnue: { cle: 'MAC-9999', branche: 'feature/MAC-9999-cle-inexistante', pr: 9003 },
  sansCle: { cle: '', branche: 'feature/migration-sans-ticket', pr: 9004 },
  depot: 'checkout-api',
} as const;

type Verdict = { verdict?: string; message?: string; reasons?: Regle[] };
type Regle = { rule?: string; level?: string };

let echecs = 0;
const durees: number[] = [];
const etapes: Array<{ nom: string; ok: boolean; detail: string; ms: number }> = [];

function verifier(nom: string, condition: boolean, detail: string, ms = 0): void {
  if (!condition) echecs += 1;
  if (ms > 0) durees.push(ms);
  etapes.push({ nom, ok: condition, detail, ms });
  etape(nom, condition, detail, ms);
}

/** Règles citées, triées pour un affichage stable. */
function codes(corps: unknown): string[] {
  return ((corps as Verdict)?.reasons ?? [])
    .map((raison) => `${raison.rule ?? '?'}(${raison.level ?? '?'})`)
    .sort();
}

/** Cas de pull request : une clé de ticket, une branche, un identifiant. */
type CasPR = { cle: string; branche: string; pr: number };

async function evaluer(config: Configuration, cas: CasPR, trigger = 'on-code-pushed') {
  const payload = payloadPr(config, cas.pr, cas.cle, cas.branche, trigger, REEL.depot);
  const reponse = await appeler(config, 'evaluate', payload);
  return { reponse, corps: reponse.corps as Verdict };
}

/** Le ticket réel dont deux critères ne sont pas cochés, bloqué par un autre. */
async function casBloquant(config: Configuration): Promise<void> {
  annonce(`1 · ${REEL.bloque.cle} — deux critères d'acceptation non cochés, et bloqué par ${REEL.autorise.cle}`);
  console.log(`      ticket réel : ${SITE}/browse/${REEL.bloque.cle}`);
  const { reponse, corps } = await evaluer(config, REEL.bloque);
  afficherMessage(String(corps?.message ?? ''));
  verifier('HTTP 200, requête signée', reponse.status === 200, `HTTP ${reponse.status}`, reponse.ms);
  verifier('Verdict blocked', corps?.verdict === 'blocked', `verdict ${corps?.verdict}`);
  verifier('Les deux raisons réelles sont citées', raisonsBloquantes(corps) === 2, codes(corps).join(' '));
}

/** Le ticket réel propre : critères cochés, mais une version déjà publiée. */
async function casAutorise(config: Configuration): Promise<void> {
  annonce(`2 · ${REEL.autorise.cle} — critères cochés, version 2.3 déjà publiée`);
  console.log(`      ticket réel : ${SITE}/browse/${REEL.autorise.cle}`);
  const { reponse, corps } = await evaluer(config, REEL.autorise);
  afficherMessage(String(corps?.message ?? ''));
  verifier('HTTP 200', reponse.status === 200, `HTTP ${reponse.status}`, reponse.ms);
  verifier('Verdict allowed', corps?.verdict === 'allowed', `verdict ${corps?.verdict}`);
  verifier('Avertissement sur la version réellement publiée', codes(corps).includes('R-07(warning)'), codes(corps).join(' '));
}

/** Clé inexistante puis branche sans clé : R-01 sur données réelles. */
async function casCle(config: Configuration): Promise<void> {
  annonce('3 · clé inconnue du site, puis branche sans clé (R-01)');
  const inconnue = await evaluer(config, REEL.inconnue);
  verifier('R-01 signale une clé absente', codes(inconnue.corps).some((c) => c.startsWith('R-01')), codes(inconnue.corps).join(' ') || 'aucune raison', inconnue.reponse.ms);
  const sansCle = await evaluer(config, REEL.sansCle);
  verifier('R-01 signale l’absence de ticket', codes(sansCle.corps).some((c) => c.startsWith('R-01')), codes(sansCle.corps).join(' ') || 'aucune raison', sansCle.reponse.ms);
}

/** La carte détaillée d'une PR réelle. */
async function casCarte(config: Configuration): Promise<void> {
  annonce('4 · carte détaillée de la PR (treize règles)');
  const payload = payloadPr(config, REEL.bloque.pr, REEL.bloque.cle, REEL.bloque.branche, 'on-code-pushed', REEL.depot);
  const carte = await appeler(config, 'card', payload);
  const regles = ((carte.corps as { rules?: unknown[] })?.rules ?? []).length;
  verifier('La carte expose les 13 règles', regles === 13, `${regles} règle(s)`, carte.ms);
}

/** Sans signature, la porte reste close. */
async function casNonSigne(config: Configuration): Promise<void> {
  annonce('5 · requête non signée refusée');
  const payload = payloadPr(config, REEL.bloque.pr, REEL.bloque.cle, REEL.bloque.branche, 'on-code-pushed', REEL.depot);
  const nue = await appeler(config, 'evaluate', payload, false);
  verifier('HTTP 401 sans signature', nue.status === 401, `HTTP ${nue.status}`, nue.ms);
}

/** Ce que l'étape Bitbucket a réussi à montrer. */
export interface ResultatBitbucket {
  /** Vrai si une pull request a réellement été lue. */
  prLue: boolean;
  /** Raison exacte du repli, quand aucune pull request n'a pu être lue. */
  raison?: string;
}

/** Options de l'étape Bitbucket : environnement et récupération HTTP. */
export interface OptionsBitbucket {
  env?: Record<string, string | undefined>;
  recuperer?: RecuperateurHttp;
}

/** Dépôt et pull request visés par l'environnement. */
export interface CibleBitbucket {
  repo: string;
  prId?: number;
}

/** Lit le dépôt et la pull request visés : `MAC_BB_REPO`, `MAC_BB_PR_ID`. */
export function cibleBitbucket(env: Record<string, string | undefined>): CibleBitbucket {
  const repo = env.MAC_BB_REPO?.trim() || DEPOT_DEFAUT;
  const brut = env.MAC_BB_PR_ID?.trim();
  const id = brut ? Number(brut) : Number.NaN;
  return { repo, prId: Number.isInteger(id) && id > 0 ? id : undefined };
}

/** Une pull request listée : les champs de l'API, plus son horodatage. */
interface PullRequestListe extends PullRequest {
  updated_on?: string;
}

/**
 * Liste les pull requests d'un dépôt, les plus récemment mises à jour d'abord.
 *
 * `ClientBitbucket` lit une pull request *par son identifiant* ; l'endpoint de
 * liste n'en fait pas partie et `scripts/bitbucket-api.ts` est hors périmètre
 * ici : on appelle donc l'API avec les mêmes en-têtes et le même type d'erreur,
 * plutôt que de réécrire la lecture des contrôles de fusion.
 */
async function listerPullRequests(
  config: ConfigurationBitbucket,
  repo: string,
  recuperer: RecuperateurHttp,
): Promise<PullRequestListe[]> {
  const route = `/repositories/${config.workspace}/${repo}/pullrequests`;
  const url = `${config.baseUrl}${route}?sort=-updated_on&pagelen=5`;
  const reponse = await recuperer(url, { headers: { ...enTeteAutorisation(config), accept: 'application/json' } });
  const texte = await reponse.text();
  if (!reponse.ok) throw new ErreurBitbucket(reponse.status, route, texte);
  let page: { values?: PullRequestListe[] };
  try {
    page = JSON.parse(texte) as { values?: PullRequestListe[] };
  } catch {
    throw new Error(`réponse illisible sur ${route} (HTTP ${reponse.status})`);
  }
  const valeurs = page.values ?? [];
  return [...valeurs].sort((a, b) => (b.updated_on ?? '').localeCompare(a.updated_on ?? ''));
}

/** Lit la PR visée : par identifiant, sinon la plus récemment mise à jour. */
async function lirePullRequestVisee(
  client: ClientBitbucket,
  config: ConfigurationBitbucket,
  cible: CibleBitbucket,
  recuperer: RecuperateurHttp,
): Promise<{ pr: PullRequest; id: number }> {
  let id = cible.prId;
  if (id === undefined) {
    const recentes = await listerPullRequests(config, cible.repo, recuperer);
    const premiere = recentes[0];
    if (!premiere?.id) throw new Error(`aucune pull request lisible dans ${config.workspace}/${cible.repo}`);
    id = premiere.id;
  }
  const pr = await client.lirePullRequest(cible.repo, id);
  if (!pr?.id) throw new Error(`pull request #${id} illisible dans ${config.workspace}/${cible.repo}`);
  return { pr, id };
}

/** Raison exacte d'un échec de lecture : blocage IP, refus API, ou autre. */
function raisonEchec(erreur: unknown, workspace: string): string {
  if (estErreurBlocageIp(erreur)) return messageBlocageIp(workspace);
  if (erreur instanceof ErreurBitbucket) return `API Bitbucket : ${erreur.message}`;
  return `lecture impossible : ${erreur instanceof Error ? erreur.message : String(erreur)}`;
}

/** Le contrôle de fusion produit par l'app (type « custom », sinon kind « app »). */
export function controleDeLApp(controles: ResultatsControles): ControleFusion | undefined {
  const valeurs = controles.values ?? [];
  return valeurs.find((c) => c.type?.startsWith('custom')) ?? valeurs.find((c) => c.check?.kind === 'app');
}

/** Affiche la pull request réellement lue : identifiant, état, URL web. */
function afficherPullRequest(pr: PullRequest): void {
  const url = pr.links?.html?.href ?? '(URL indisponible)';
  verifier('Pull request lue', Boolean(pr.id), `#${pr.id} — ${pr.state ?? '?'}`);
  console.log(`      ${url}`);
  if (pr.title) console.log(`      titre : ${pr.title}`);
}

/** Affiche le verdict du contrôle de fusion : succès ou refus, et son message. */
function afficherVerdict(controles: ResultatsControles): void {
  const controle = controleDeLApp(controles);
  if (!controle) {
    verifier('Contrôle de fusion du Capteur publié par Bitbucket', false, 'aucun contrôle personnalisé exposé sur cette pull request');
    return;
  }
  const nom = controle.check?.name ?? controle.type ?? 'contrôle';
  const statut = (controle.status ?? '?').toUpperCase();
  const portee = controle.blocking ? 'bloquant' : 'non bloquant';
  verifier('Contrôle de fusion du Capteur publié par Bitbucket', true, `${nom} — ${statut} (${portee})`);
  if (controle.message) afficherMessage(controle.message);
}

/** GET public : le JSON, ou `undefined` si l'API refuse ou ne répond pas. */
async function lireJsonPublic(url: string, recuperer: RecuperateurHttp): Promise<unknown> {
  try {
    const reponse = await recuperer(url, { headers: { accept: 'application/json' } });
    if (!reponse.ok) return undefined;
    return JSON.parse(await reponse.text()) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Repli honnête : ce qui est installé, ce qui a été vérifié, et la raison
 * exacte du blocage. Aucune pull request n'est annoncée — rien n'a été lu.
 */
async function repliHoneste(
  env: Record<string, string | undefined>,
  recuperer: RecuperateurHttp,
  raison: string,
): Promise<ResultatBitbucket> {
  annonce('6 · côté Bitbucket — l’app y est installée, la pull request n’a pas pu être lue');
  console.log(`      raison : ${raison}`);
  const baseUrl = env.MAC_BB_API?.trim() || API_BASE;
  const espace = (await lireJsonPublic(`${baseUrl}/workspaces/${ESPACE_BITBUCKET}`, recuperer)) as { uuid?: string } | undefined;
  if (!espace) {
    console.log('      l’espace Bitbucket n’a pas pu être relu (lecture refusée ou API injoignable)');
    return { prLue: false, raison };
  }
  verifier('L’espace Bitbucket existe et a le bon uuid', espace.uuid === ESPACE_BITBUCKET, espace.uuid ?? '?');
  const page = (await lireJsonPublic(`${baseUrl}/repositories/${ESPACE_BITBUCKET}`, recuperer)) as { values?: unknown[] } | undefined;
  const nombre = Array.isArray(page?.values) ? page.values.length : 0;
  console.log(`      dépôts visibles dans l’espace : ${nombre} (le contrôle se déclenche sur une pull request réelle)`);
  console.log('      aucune pull request n’est annoncée : rien n’a pu être lu');
  return { prLue: false, raison };
}

/**
 * Étape « côté Bitbucket » : la vraie pull request et son verdict de fusion
 * dès qu'un accès écriture existe ; sinon l'affichage honnête d'aujourd'hui.
 */
export async function casBitbucket(options: OptionsBitbucket = {}): Promise<ResultatBitbucket> {
  const env = options.env ?? process.env;
  const recuperer = options.recuperer ?? recuperateurNatif;
  const config = lireConfigurationBitbucket(env);
  if (!config) {
    return await repliHoneste(
      env,
      recuperer,
      'aucun jeton API dans l’environnement (MAC_BB_TOKEN, MAC_BB_WORKSPACE) : la pull request ne peut pas être lue',
    );
  }
  const cible = cibleBitbucket(env);
  const client = new ClientBitbucket(config, recuperer);
  let lu: { pr: PullRequest; id: number };
  try {
    lu = await lirePullRequestVisee(client, config, cible, recuperer);
  } catch (erreur) {
    return await repliHoneste(env, recuperer, raisonEchec(erreur, config.workspace));
  }
  annonce('6 · côté Bitbucket — la vraie pull request et son verdict de fusion');
  afficherPullRequest(lu.pr);
  try {
    afficherVerdict(await client.lireControlesFusion(cible.repo, lu.id));
  } catch (erreur) {
    verifier('Contrôle de fusion du Capteur publié par Bitbucket', false, raisonEchec(erreur, config.workspace));
  }
  return { prLue: true };
}

function resumer(): void {
  if (durees.length === 0) return;
  const triees = [...durees].sort((a, b) => a - b);
  const mediane = triees[Math.floor(triees.length / 2)];
  console.log(`\nLatences : ${triees.length} appels, médiane ${mediane} ms, max ${triees[triees.length - 1]} ms`);
}

/** Ce qu'il reste à prouver : dépend de ce que l'étape Bitbucket a montré. */
function resteAProuver(cote: ResultatBitbucket): string {
  if (cote.prLue) {
    return 'Rien côté Bitbucket : la pull request et son verdict de fusion ont été lus dans l’espace.';
  }
  const raison = cote.raison ?? 'accès API indisponible';
  return 'La PR Bitbucket elle-même (dépôt, branche, activation des custom merge checks)'
    + ` reste hors de portée : ${raison.endsWith('.') ? raison : `${raison}.`}`;
}

/** Bilan de la démonstration : ce qui est prouvé, ce qui reste à prouver. */
function afficherBilan(cote: ResultatBitbucket): void {
  console.log('\n— Ce que prouvent ces étapes —');
  console.log('  · des tickets qui existent vraiment, lus par l’app déployée ;');
  console.log('  · des verdicts signés, rejouables et revérifiables (npm run preuve:verifier) ;');
  console.log('  · un refus sans signature, et une carte à treize règles.');
  if (cote.prLue) console.log('  · la pull request réelle et le verdict du contrôle de fusion publiés par Bitbucket.');
  console.log('— Ce qui reste à prouver —');
  console.log(`  ${resteAProuver(cote)}\n`);
}

/** Écrit le rapport JSON (mode `MAC_DEMO_JSON`) si demandé. */
function exporterRapport(config: Configuration): void {
  if (process.env.MAC_DEMO_JSON !== '1') return;
  const triees = [...durees].sort((a, b) => a - b);
  const rapport = {
    horodatage: new Date().toISOString(),
    site: SITE,
    espace: config.workspace,
    echecs,
    medianeMs: triees.length ? triees[Math.floor(triees.length / 2)] : null,
    etapes,
  };
  if (process.env.MAC_DEMO_JSON_PATH) {
    writeFileSync(process.env.MAC_DEMO_JSON_PATH, JSON.stringify(rapport, null, 2) + '\n');
  } else {
    console.log(`__DEMO_JSON__${JSON.stringify(rapport)}`);
  }
}

async function main(): Promise<void> {
  // L'espace annoncé par défaut est le vrai : la démonstration signe au nom
  // de l'espace où le Capteur est installé.
  process.env.MAC_WORKSPACE = process.env.MAC_WORKSPACE?.trim() || ESPACE_BITBUCKET;
  const config = lireConfiguration(process.env);
  if (!config) {
    console.error('MAC_BRIDGE_URL et MAC_SHARED_SECRET sont requis (MAC_WORKSPACE = uuid de l’espace).');
    process.exit(2);
  }
  console.log('Démonstration réelle — Merge avec contexte\n');
  console.log(`site Jira          : ${SITE}`);
  console.log(`espace Bitbucket   : ${config.workspace}`);
  console.log(`pont               : ${config.url.slice(0, 48)}…`);

  const sante = await appeler(config, 'health', {});
  verifier('Pont joignable', sante.status === 200, `HTTP ${sante.status}`, sante.ms);

  await casBloquant(config);
  await casAutorise(config);
  await casCle(config);
  await casCarte(config);
  await casNonSigne(config);
  const cote = await casBitbucket();
  resumer();
  afficherBilan(cote);

  console.log(`${echecs === 0 ? 'Démonstration réelle concluante' : `${echecs} cas en échec`}\n`);
  exporterRapport(config);
  process.exit(echecs === 0 ? 0 : 1);
}

/* L'import (par les tests) ne doit rien exécuter : `vitest` pose `VITEST=true`.
 * À l'invocation directe (`npm run demo`), la variable est absente et la
 * démonstration se joue. */
if (!process.env.VITEST) {
  main();
}
