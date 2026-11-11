#!/usr/bin/env node
/**
 * Garde de schéma des manifestes Forge (audit 77).
 *
 * `tools/check-manifests.mjs` fait les vérifications croisées maison (handlers
 * exportés, ressources présentes, clés bornées) ; ce garde-ci complète sans
 * dupliquer : il valide les deux `manifest.yml` contre le **vrai schéma JSON**
 * de la plateforme, porté par le paquet déjà installé `@forge/manifest`
 * (`@forge/manifest/schema.json`). Aucune dépendance nouvelle : `ajv` (et son
 * hôte `@forge/manifest`) sont dans l'arbre via `package-lock.json`.
 *
 * Usage : node tools/check-manifest-schema.mjs
 * Codes : 0 = conforme, 1 = erreur(s) de schéma, 2 = erreur interne
 * (schéma ou ajv introuvable — lancer `npm ci`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const APPS = ['capteur', 'cerveau'];
const require = createRequire(import.meta.url);

/** Chemin du schéma de manifeste porté par `@forge/manifest`. */
export function cheminSchema() {
  try {
    return require.resolve('@forge/manifest/schema.json');
  } catch {
    const repli = join(RACINE, 'node_modules', '@forge', 'manifest', 'out', 'schema', 'manifest-schema.json');
    if (existsSync(repli)) return repli;
    throw new Error('@forge/manifest introuvable — lancez `npm ci` à la racine du dépôt');
  }
}

/** Compile le validateur du schéma ; lève une erreur interne si ajv manque. */
export function compileur(schema) {
  let Ajv;
  try {
    Ajv = require('ajv');
  } catch {
    throw new Error('ajv introuvable — il est fourni par @forge/manifest, lancez `npm ci`');
  }
  // `strict: false` : le schéma Forge utilise des mots-clés qu'ajv ne connaît
  // pas en mode strict ; ils ne changent pas la validation de nos manifestes.
  return new Ajv({ allErrors: true, strict: false }).compile(schema);
}

/** Valide un manifeste déjà parsé ; rend la liste des erreurs lisibles. */
export function validerManifeste(manifeste, valider) {
  if (valider(manifeste)) return [];
  return (valider.errors ?? []).map((e) => `${e.instancePath || '/'} : ${e.message} ${JSON.stringify(e.params)}`);
}

/** Contrôle tous les manifestes d'apps ; rend les erreurs préfixées par l'app. */
export function controler(base = RACINE, valider = null) {
  const schema = JSON.parse(readFileSync(cheminSchema(), 'utf8'));
  const validateur = valider ?? compileur(schema);
  const erreurs = [];
  for (const app of APPS) {
    const chemin = join(base, app, 'manifest.yml');
    if (!existsSync(chemin)) {
      erreurs.push(`${app} : manifest.yml absent`);
      continue;
    }
    let manifeste;
    try {
      manifeste = parse(readFileSync(chemin, 'utf8'));
    } catch (e) {
      erreurs.push(`${app} : manifest.yml illisible (${e.message})`);
      continue;
    }
    for (const erreur of validerManifeste(manifeste, validateur)) {
      erreurs.push(`${app} : ${erreur}`);
    }
  }
  return erreurs;
}

function main() {
  let erreurs;
  try {
    erreurs = controler();
  } catch (e) {
    console.log(`::error::contrôle de schéma impossible : ${e.message}`);
    process.exit(2);
  }
  for (const erreur of erreurs) console.log(`::error::${erreur}`);
  console.log(`${APPS.length} manifeste(s) validé(s) contre le schéma @forge/manifest, ${erreurs.length} erreur(s)`);
  process.exit(erreurs.length > 0 ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
