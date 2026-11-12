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
 * Le scénario fictif d'origine (`PAY-123` etc.) reste disponible :
 *   npm run demo:fictif
 *
 * Usage : MAC_BRIDGE_URL=<pont> MAC_SHARED_SECRET=<secret> \
 *         [MAC_WORKSPACE='{uuid}'] npm run demo
 *
 * Sortie : 0 si tous les cas réels donnent le verdict attendu, 1 sinon.
 */
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

const SITE = process.env.MAC_SITE_URL?.trim() || 'https://one-atlas-cndz.atlassian.net';

/** Vrai espace Bitbucket où le Capteur est installé (uuid de one-atlas-cndz). */
const ESPACE_BITBUCKET = '{b44dcce8-0f72-4e36-bf40-65aead14ce35}';

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

function verifier(nom: string, condition: boolean, detail: string, ms = 0): void {
  if (!condition) echecs += 1;
  if (ms > 0) durees.push(ms);
  etape(nom, condition, detail, ms);
}

/** Règles citées, triées pour un affichage stable. */
function codes(corps: unknown): string[] {
  return ((corps as Verdict)?.reasons ?? [])
    .map((raison) => `${raison.rule ?? '?'}(${raison.level ?? '?'})`)
    .sort();
}

async function evaluer(config: Configuration, cas: typeof REEL.bloque, trigger = 'on-code-pushed') {
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

function resumer(): void {
  if (durees.length === 0) return;
  const triees = [...durees].sort((a, b) => a - b);
  const mediane = triees[Math.floor(triees.length / 2)];
  console.log(`\nLatences : ${triees.length} appels, médiane ${mediane} ms, max ${triees[triees.length - 1]} ms`);
}

/** Ce qu'il reste à prouver : la PR Bitbucket, bloquée par l'allowlist IP. */
function resteAProuver(): string {
  return 'La PR Bitbucket elle-même (dépôt, branche, activation des custom merge checks)'
    + ' reste bloquée par l’allowlist IP de l’espace one-atlas-cndz.';
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
  resumer();

  console.log('\n— Ce que prouvent ces étapes —');
  console.log('  · des tickets qui existent vraiment, lus par l’app déployée ;');
  console.log('  · des verdicts signés, rejouables et revérifiables (npm run preuve:verifier) ;');
  console.log('  · un refus sans signature, et une carte à treize règles.');
  console.log('— Ce qui reste à prouver —');
  console.log(`  ${resteAProuver()}\n`);

  console.log(`${echecs === 0 ? 'Démonstration réelle concluante' : `${echecs} cas en échec`}\n`);
  process.exit(echecs === 0 ? 0 : 1);
}

main();