#!/usr/bin/env -S npx vite-node --
/**
 * Preuve réelle — l'app déployée évalue de vrais tickets Jira.
 *
 * Différence avec `npm run demo` : **aucune donnée de démonstration**. Le
 * Cerveau tourne avec `MAC_DEMO_DATA=0`, lit le site Jira réel par REST, et les
 * tickets évalués existent vraiment (projet `MAC` du site de l'organisation) :
 * critères d'acceptation en cases à cocher, lien « Blocks », version publiée.
 * L'espace signé dans chaque requête est le vrai uuid de l'espace Bitbucket où
 * le Capteur est installé.
 *
 * Usage :
 *   MAC_BRIDGE_URL=<pont> MAC_SHARED_SECRET=<secret> MAC_WORKSPACE='{uuid}' \
 *     npx vite-node scripts/preuve-reelle.ts
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

/** Tickets réels créés sur le site (voir `docs/PREUVE-REELLE.md`). */
const REEL = {
  bloque: { cle: 'MAC-2', branche: 'feature/MAC-2-limite-tentatives', pr: 9001 },
  autorise: { cle: 'MAC-3', branche: 'feature/MAC-3-correctif-incident', pr: 9002 },
  inconnue: { cle: 'MAC-9999', branche: 'feature/MAC-9999-cle-inexistante', pr: 9003 },
  sansCle: { cle: '', branche: 'feature/migration-sans-ticket', pr: 9004 },
  depot: 'checkout-api',
} as const;

type Verdict = { verdict?: string; message?: string; reasons?: Regle[] };
type Regle = { rule?: string; level?: string; text?: string; waived?: boolean; observed?: boolean };

let echecs = 0;
const durees: number[] = [];

/** Note une étape et compte les échecs. */
function verifier(nom: string, condition: boolean, detail: string, ms = 0): void {
  if (!condition) echecs += 1;
  if (ms > 0) durees.push(ms);
  etape(nom, condition, detail, ms);
}

/** Règles citées dans la réponse, triées pour un affichage stable. */
function codes(corps: unknown): string[] {
  return ((corps as Verdict)?.reasons ?? [])
    .map((raison) => `${raison.rule ?? '?'}(${raison.level ?? '?'})`)
    .sort();
}

/** Évalue une PR réelle et rend la réponse du pont. */
async function evaluer(config: Configuration, cas: { cle: string; branche: string; pr: number }, trigger = 'on-code-pushed') {
  const payload = payloadPr(config, cas.pr, cas.cle, cas.branche, trigger, REEL.depot);
  const reponse = await appeler(config, 'evaluate', payload);
  return { reponse, corps: reponse.corps as Verdict };
}

/** Cas 1 — le ticket réel a deux critères non cochés et est bloqué par un autre. */
async function casBloquant(config: Configuration): Promise<void> {
  annonce(`Cas 1 — ${REEL.bloque.cle} : critères d'acceptation non cochés + lien « Blocks » (données réelles Jira)`);
  const { reponse, corps } = await evaluer(config, REEL.bloque);
  afficherMessage(String(corps?.message ?? ''));
  verifier('HTTP 200 sur requête signée', reponse.status === 200, `HTTP ${reponse.status}`, reponse.ms);
  verifier('Verdict blocked', corps?.verdict === 'blocked', `verdict ${corps?.verdict}`);
  verifier('Au moins 2 raisons bloquantes réelles', raisonsBloquantes(corps) >= 2, `${raisonsBloquantes(corps)} raison(s)`);
  verifier('R-03 cite les critères du vrai ticket', /MAC-2/.test(String(corps?.message)) && /crit/i.test(String(corps?.message)), codes(corps).join(' '));
  verifier('R-06 voit le vrai lien « Blocks »', codes(corps).some((c) => c.startsWith('R-06')), codes(corps).join(' '));
}

/** Cas 2 — ticket réel propre, mais sa version est déjà publiée (R-07). */
async function casAutorise(config: Configuration): Promise<void> {
  annonce(`Cas 2 — ${REEL.autorise.cle} : critères cochés, version 2.3 publiée (données réelles Jira)`);
  const { reponse, corps } = await evaluer(config, REEL.autorise);
  afficherMessage(String(corps?.message ?? ''));
  verifier('HTTP 200', reponse.status === 200, `HTTP ${reponse.status}`, reponse.ms);
  verifier('Verdict allowed', corps?.verdict === 'allowed', `verdict ${corps?.verdict}`);
  verifier('R-07 avertit sur la version réellement publiée', codes(corps).some((c) => c.startsWith('R-07')), codes(corps).join(' '));
  verifier('R-03 ne bloque pas : critères réellement cochés', !codes(corps).some((c) => c.startsWith('R-03')), codes(corps).join(' ') || 'aucune raison');
}

/** Cas 3 et 4 — clé inexistante, puis branche sans clé : R-01 sur données réelles. */
async function casCle(config: Configuration): Promise<void> {
  annonce('Cas 3 — clé inexistante sur le site réel (R-01)');
  const inconnue = await evaluer(config, REEL.inconnue);
  verifier('R-01 signale une clé absente du site', codes(inconnue.corps).some((c) => c.startsWith('R-01')), codes(inconnue.corps).join(' ') || 'aucune raison', inconnue.reponse.ms);

  annonce('Cas 4 — branche sans clé de ticket (R-01)');
  const sansCle = await evaluer(config, REEL.sansCle);
  verifier('R-01 signale l’absence de ticket', codes(sansCle.corps).some((c) => c.startsWith('R-01')), codes(sansCle.corps).join(' ') || 'aucune raison', sansCle.reponse.ms);
}

/** Cas 5 — la carte détaillée d'une PR réelle expose les treize règles. */
async function casCarte(config: Configuration): Promise<void> {
  annonce(`Cas 5 — carte détaillée de la PR ${REEL.bloque.pr} (${REEL.bloque.cle})`);
  const payload = payloadPr(config, REEL.bloque.pr, REEL.bloque.cle, REEL.bloque.branche, 'on-code-pushed', REEL.depot);
  const carte = await appeler(config, 'card', payload);
  const regles = ((carte.corps as { rules?: unknown[] })?.rules ?? []).length;
  verifier('La carte expose les 13 règles', regles === 13, `${regles} règle(s)`, carte.ms);
  verifier('La carte cite le ticket réel', JSON.stringify(carte.corps).includes(REEL.bloque.cle), REEL.bloque.cle);
}

/** Cas 6 — une requête non signée est refusée. */
async function casNonSigne(config: Configuration): Promise<void> {
  annonce('Cas 6 — requête non signée refusée');
  const payload = payloadPr(config, REEL.bloque.pr, REEL.bloque.cle, REEL.bloque.branche, 'on-code-pushed', REEL.depot);
  const nue = await appeler(config, 'evaluate', payload, false);
  verifier('HTTP 401 sans signature', nue.status === 401, `HTTP ${nue.status}`, nue.ms);
}

/** Médiane et maximum des durées observées. */
function resumerLatences(): void {
  if (durees.length === 0) return;
  const triees = [...durees].sort((a, b) => a - b);
  const mediane = triees[Math.floor(triees.length / 2)];
  console.log(`\nLatences : ${triees.length} appels, médiane ${mediane} ms, max ${triees[triees.length - 1]} ms`);
}

async function main(): Promise<void> {
  const config = lireConfiguration(process.env);
  if (!config) {
    console.error('MAC_BRIDGE_URL et MAC_SHARED_SECRET sont requis (MAC_WORKSPACE = uuid réel de l’espace).');
    process.exit(2);
  }
  console.log(`Preuve réelle — pont ${config.url.slice(0, 48)}…, espace ${config.workspace}`);
  const sante = await appeler(config, 'health', {});
  verifier('Pont joignable', sante.status === 200, `HTTP ${sante.status}`, sante.ms);

  await casBloquant(config);
  await casAutorise(config);
  await casCle(config);
  await casCarte(config);
  await casNonSigne(config);
  resumerLatences();

  console.log(`\n${echecs === 0 ? 'Preuve réelle concluante' : `${echecs} cas en échec`}\n`);
  process.exit(echecs === 0 ? 0 : 1);
}

main();
