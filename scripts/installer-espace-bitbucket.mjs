#!/usr/bin/env node
/**
 * Prépare un espace Bitbucket pour la preuve réelle : installation de l'app,
 * appariement des deux moitiés (le Capteur côté Forge, le Cerveau côté pont).
 *
 * Un espace neuf, créé pour la démonstration, n'a pas d'allowlist IP : c'est
 * le chemin le plus simple pour obtenir une pull request **réelle** (dépôt,
 * branche, PR, custom merge check) sans dépendre du réseau du poste.
 *
 * Le cheminement est entièrement automatique côté Forge :
 *   1. installation de l'app dans l'espace (`forge install`) ;
 *   2. appariement du Capteur par variables d'environnement
 *      (`MAC_BRIDGE_URL`, `MAC_SHARED_SECRET`, `MAC_SITE_URL`, `MAC_WORKSPACE`) —
 *      le mécanisme de repli prévu pour « un espace créé pour l'occasion » ;
 *   3. appariement du Cerveau (`MAC_PAIRED_WORKSPACE`) et redéploiement.
 *
 * Restent manuels (aucune API Atlassian ne les expose) : l'activation des
 * *custom merge checks* dans l'espace, puis le coche du contrôle sur le dépôt.
 *
 * Usage : node scripts/installer-espace-bitbucket.mjs <slug-espace>
 *         [--environment production] [--skip-deploy]
 * Codes : 0 = prêt, 1 = échec d'une étape, 2 = usage.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CAPTEUR = join(RACINE, 'capteur');
const CERVEAU = join(RACINE, 'cerveau');
const API_BITBUCKET = 'https://api.bitbucket.org/2.0';

/** CLI Forge : variable d'environnement, sinon installation locale connue. */
export const CLI_FORGE =
  process.env.FORGE_BIN || join(homedir(), '.local/bin/forge-atlassian');

/** Options acceptées par le script. */
export const OPTIONS = ['--environment', '--skip-deploy'];

/** Lit un secret local (jamais écrit dans le dépôt). */
function lireSecret(chemin) {
  if (!existsSync(chemin)) return undefined;
  const valeur = readFileSync(chemin, 'utf8').trim();
  return valeur === '' ? undefined : valeur;
}

/** Lance une commande, rend le code de sortie et la sortie cumulée. */
export function lancer(binaire, args, options = {}) {
  const resultat = spawnSync(binaire, args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (resultat.error) throw resultat.error;
  return {
    code: resultat.status ?? 1,
    sortie: `${resultat.stdout ?? ''}${resultat.stderr ?? ''}`,
  };
}

/** Analyse les arguments : slug, environnement, option de redéploiement. */
export function analyserArgs(argv) {
  const slug = argv.find((a) => !a.startsWith('--'));
  const env = argv.includes('--environment') ? argv[argv.indexOf('--environment') + 1] : 'production';
  const invalides = argv.filter((a) => a.startsWith('--') && !OPTIONS.includes(a));
  if (!slug || invalides.length > 0) return undefined;
  return { slug, environnement: env, redployer: !argv.includes('--skip-deploy') };
}

/** UUID de l'espace, lu sur l'API publique (aucune authentification). */
export async function lireUuidEspace(slug) {
  const reponse = await fetch(`${API_BITBUCKET}/workspaces/${slug}`);
  if (!reponse.ok) throw new Error(`espace ${slug} : HTTP ${reponse.status}`);
  const corps = await reponse.json();
  if (!corps?.uuid) throw new Error(`espace ${slug} : uuid absent de la réponse`);
  return corps.uuid;
}

/** Installe l'app dans l'espace, scopes confirmés sans question interactive. */
export function installerApp(slug, environnement) {
  const resultat = lancer(CLI_FORGE, [
    'install',
    '-p', 'bitbucket',
    '-s', `https://bitbucket.org/${slug}`,
    '-e', environnement,
    '--non-interactive',
    '--confirm-scopes',
  ], { cwd: CAPTEUR });
  if (resultat.code !== 0) throw new Error(`installation refusée :\n${resultat.sortie}`);
  return resultat.sortie;
}

/** Pose une variable Forge dans un dossier d'app. */
export function poserVariable(dossier, cle, valeur, environnement, chiffrer = false) {
  const args = ['variables', 'set', cle, valeur, '-e', environnement];
  if (chiffrer) args.push('--encrypt');
  const resultat = lancer(CLI_FORGE, args, { cwd: dossier });
  if (resultat.code !== 0) throw new Error(`variable ${cle} refusée :\n${resultat.sortie}`);
}

/** Appareille le Capteur : il apprend son pont et son secret. */
export function appareillerCapteur(uuid, environnement, pont, site, secret) {
  poserVariable(CAPTEUR, 'MAC_BRIDGE_URL', pont, environnement);
  poserVariable(CAPTEUR, 'MAC_SITE_URL', site, environnement);
  poserVariable(CAPTEUR, 'MAC_WORKSPACE', uuid, environnement);
  poserVariable(CAPTEUR, 'MAC_SHARED_SECRET', secret, environnement, true);
}

/** Rejoue l'appariement du Cerveau et le redéploie. */
export function appareillerCerveau(uuid, environnement, redployer) {
  poserVariable(CERVEAU, 'MAC_PAIRED_WORKSPACE', uuid, environnement);
  if (!redployer) return;
  const resultat = lancer(CLI_FORGE, ['deploy', '-e', environnement, '--non-interactive'], { cwd: CERVEAU });
  if (resultat.code !== 0) throw new Error(`redéploiement du Cerveau refusé :\n${resultat.sortie}`);
}

/** Étapes manuelles qui restent : aucune API ne les expose. */
export function etapesManuelles(slug) {
  return [
    `espace ${slug} : Workspace settings → Merge checks → activer les *custom merge checks*`,
    `dépôt ${slug}/checkout-api : Repository settings → Merge checks → cocher « Merge avec contexte »`,
  ];
}

/** Point d'entrée : enchaîne installation, appariements et rappels. */
export async function main(argv) {
  const options = analyserArgs(argv);
  if (!options) {
    console.error('Usage : node scripts/installer-espace-bitbucket.mjs <slug-espace> [--environment production] [--skip-deploy]');
    return 2;
  }
  const pont = process.env.MAC_BRIDGE_URL?.trim() || lireSecret(join(homedir(), '.atlassian/bridge-url-prod.txt'));
  const secret = process.env.MAC_SHARED_SECRET?.trim() || lireSecret(join(homedir(), '.atlassian/demo-shared-secret'));
  const site = process.env.MAC_SITE_URL?.trim() || 'https://one-atlas-cndz.atlassian.net';
  if (!pont || !secret) {
    console.error('MAC_BRIDGE_URL et MAC_SHARED_SECRET sont requis (ou ~/.atlassian/bridge-url-prod.txt et ~/.atlassian/demo-shared-secret).');
    return 1;
  }
  try {
    const uuid = await lireUuidEspace(options.slug);
    console.log(`espace ${options.slug} → ${uuid}`);
    installerApp(options.slug, options.environnement);
    console.log('app installée');
    appareillerCapteur(uuid, options.environnement, pont, site, secret);
    console.log('Capteur apparié (variables d’environnement)');
    appareillerCerveau(uuid, options.environnement, options.redployer);
    console.log('Cerveau apparié et redéployé');
    console.log('\nÉtapes manuelles restantes :');
    for (const etape of etapesManuelles(options.slug)) console.log(`  · ${etape}`);
    return 0;
  } catch (erreur) {
    console.error(String(erreur?.message ?? erreur));
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
