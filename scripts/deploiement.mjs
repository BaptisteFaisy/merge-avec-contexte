#!/usr/bin/env node
/**
 * Déploiement reproductible d'une app Forge (audit 78, 79, 81).
 *
 * Enchaîne pour une app et un environnement donnés :
 *   1. `npm run verify` (contrat synchronisé + empreinte, style, typecheck,
 *      tests, limites) — garantit que l'app embarque la version courante du
 *      contrat partagé ;
 *   2. `forge lint` puis `forge deploy -e <environnement> --non-interactive` ;
 *   3. pour le Cerveau seulement : contrôle `health` du pont signé (route
 *      publique, aucun secret nécessaire — l'adresse vient de MAC_BRIDGE_URL).
 *
 * Le CLI Forge n'est pas dans le PATH : il est cherché dans l'ordre via
 * `FORGE_BIN`, `~/.atlassian/cli/node_modules/.bin/forge`, puis `forge` du
 * PATH ; absent, le script échoue proprement. La version du CLI est
 * **verrouillée** dans `tools/forge-cli.version` (audit 81) : une autre
 * version refuse de déployer sauf `FORGE_CLI_VERSION=<version>` explicite.
 *
 * Aucun secret dans ce script : les secrets d'app (variable chiffrée Forge)
 * restent posés par l'opérateur via `forge variables set --encrypt`.
 *
 * Usage : node scripts/deploiement.mjs <capteur|cerveau> <development|staging|production>
 *         [--skip-verify] [--skip-health]
 * Codes : 0 = déployé, 1 = échec d'une étape, 2 = usage ou CLI introuvable.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lireEmpreinte } from './shared-sync.mjs';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const APPS = ['capteur', 'cerveau'];
export const ENVIRONNEMENTS = ['development', 'staging', 'production'];
const OPTIONS = ['--skip-verify', '--skip-health'];
const CHEMIN_VERSION_CLI = join(RACINE, 'tools', 'forge-cli.version');

function usage() {
  return `Usage : node scripts/deploiement.mjs <${APPS.join('|')}> <${ENVIRONNEMENTS.join('|')}> [--skip-verify] [--skip-health]`;
}

/** Paramètres validés ; lève une erreur d'usage sinon. */
export function analyserArgs(argv) {
  const positionnels = argv.filter((a) => !a.startsWith('--'));
  const options = argv.filter((a) => a.startsWith('--'));
  for (const option of options) {
    if (!OPTIONS.includes(option)) throw new Error(`Option inconnue : ${option}\n${usage()}`);
  }
  const [app, environnement] = positionnels;
  if (!APPS.includes(app) || !ENVIRONNEMENTS.includes(environnement)) throw new Error(usage());
  return {
    app,
    environnement,
    verification: !options.includes('--skip-verify'),
    sante: !options.includes('--skip-health'),
  };
}

/** Version du CLI verrouillée : `FORGE_CLI_VERSION` sinon le fichier outillé. */
export function lireVersionVerrouillee(env = process.env) {
  if (env.FORGE_CLI_VERSION?.trim()) return env.FORGE_CLI_VERSION.trim();
  if (!existsSync(CHEMIN_VERSION_CLI)) return null;
  return readFileSync(CHEMIN_VERSION_CLI, 'utf8').trim().split('\n')[0].trim() || null;
}

/** Binaire Forge : FORGE_BIN, installation Atlassian, puis PATH. */
export function resoudreForgeBin(env = process.env) {
  if (env.FORGE_BIN) {
    if (existsSync(env.FORGE_BIN)) return env.FORGE_BIN;
    throw new Error(`FORGE_BIN=${env.FORGE_BIN} : binaire introuvable`);
  }
  const atlassian = join(env.HOME ?? homedir(), '.atlassian', 'cli', 'node_modules', '.bin', 'forge');
  if (existsSync(atlassian)) return atlassian;
  const which = spawnSync('which', ['forge'], { encoding: 'utf8', env: { PATH: env.PATH ?? '' } });
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
  throw new Error(
    'CLI Forge introuvable : installez-le sous ~/.atlassian/cli '
    + 'ou pointez FORGE_BIN vers le binaire `forge`.',
  );
}

/** Première version semver d'une sortie de `forge --version`, ou `null`. */
export function extraireVersion(sortie) {
  return sortie.match(/\b\d+\.\d+\.\d+(?:[-+][\w.-]+)?\b/)?.[0] ?? null;
}

/** Lance une commande en flux direct ; rend le code de sortie. */
function lancer(commande, args, cwd) {
  const resultat = spawnSync(commande, args, { cwd, stdio: 'inherit' });
  if (resultat.error) throw resultat.error;
  return resultat.status ?? 1;
}

/** Sortie capturée (stdout + stderr) d'une commande. */
function capturer(commande, args) {
  const resultat = spawnSync(commande, args, { cwd: RACINE, encoding: 'utf8', timeout: 120_000 });
  return `${resultat.stdout ?? ''}${resultat.stderr ?? ''}`;
}

/** Contrôle `health` du pont : POST route publique, aucun secret. */
export async function controleSante(url, fetcher = fetch) {
  const reponse = await fetcher(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ route: 'health', payload: {} }),
    signal: AbortSignal.timeout(20_000),
  });
  const texte = await reponse.text();
  let corps = null;
  try {
    corps = JSON.parse(texte);
  } catch {
    /* corps non JSON : le texte suffit au diagnostic */
  }
  return { status: reponse.status, corps, texte };
}

/** Vérifie que le CLI trouvé est la version verrouillée (audit 81). */
function exigerVersionVerrouillee(forge) {
  const verrouillee = lireVersionVerrouillee();
  const sortie = capturer(forge, ['--version']);
  const trouvee = extraireVersion(sortie);
  if (!trouvee) throw new Error(`forge --version illisible : ${sortie.slice(0, 200)}`);
  if (verrouillee && trouvee !== verrouillee) {
    throw new Error(
      `CLI Forge ${trouvee} trouvé, version verrouillée ${verrouillee} (tools/forge-cli.version). `
      + 'Installez la version verrouillée, ou assumez l’écart : FORGE_CLI_VERSION=' + trouvee,
    );
  }
  return trouvee;
}

/** Étape health du Cerveau : rend un message d'erreur, ou `null` si OK. */
async function etapeSante(params) {
  const url = process.env.MAC_BRIDGE_URL?.trim();
  if (!url) {
    return params.sante
      ? 'MAC_BRIDGE_URL absent : contrôle health du pont impossible (--skip-health pour passer outre).'
      : null;
  }
  const { status, corps, texte } = await controleSante(url);
  if (status === 200 && corps?.status === 'ok') {
    console.log(`Pont sain : stockage ${corps.stockage ?? '?'}, version ${corps.version ?? '?'} (${url})`);
    return null;
  }
  return `health en échec (HTTP ${status}) : ${String(texte).slice(0, 200)}`;
}

async function main() {
  let params;
  try {
    params = analyserArgs(process.argv.slice(2));
  } catch (erreur) {
    console.error(erreur.message);
    process.exit(2);
  }
  let forge;
  let versionCli;
  try {
    forge = resoudreForgeBin();
    versionCli = exigerVersionVerrouillee(forge);
  } catch (erreur) {
    console.error(`::error::${erreur.message}`);
    process.exit(2);
  }
  console.log(`Déploiement ${params.app} → ${params.environnement} (CLI Forge ${versionCli})`);
  if (params.verification && lancer('npm', ['run', 'verify'], RACINE) !== 0) {
    console.error('::error::vérification locale en échec — déploiement abandonné.');
    process.exit(1);
  }
  const empreinte = lireEmpreinte();
  console.log(`Contrat partagé déployé : ${empreinte ? `${empreinte.slice(0, 12)}…` : 'empreinte absente'}`);
  const dossierApp = join(RACINE, params.app);
  if (lancer(forge, ['lint', '-e', params.environnement], dossierApp) !== 0) {
    console.error('::error::forge lint en échec — déploiement abandonné.');
    process.exit(1);
  }
  if (lancer(forge, ['deploy', '-e', params.environnement, '--non-interactive'], dossierApp) !== 0) {
    console.error('::error::forge deploy en échec.');
    process.exit(1);
  }
  if (params.app === 'cerveau') {
    const erreur = await etapeSante(params);
    if (erreur) {
      console.error(`::error::déploiement effectué, mais ${erreur}`);
      process.exit(1);
    }
  }
  console.log(`${params.app} déployé sur ${params.environnement}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((erreur) => {
    console.error(`::error::${erreur.message}`);
    process.exit(1);
  });
}
