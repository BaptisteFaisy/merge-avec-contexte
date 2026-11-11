#!/usr/bin/env node
/**
 * Garde de manifeste Forge : ce que la CLI vérifierait, sans la CLI.
 *
 * La CLI Forge (`@forge/cli`) n'est pas installée sur les runners : ce garde
 * attrape donc les erreurs les plus coûteuses d'un manifeste — une fonction
 * référencée qui n'existe pas, un handler qui ne correspond à aucun export du
 * `src/index.ts`, une ressource absente, une clé de module mal formée.
 *
 * Les clés de fonction sont bornées à 23 caractères par la plateforme (relevé
 * sur `forge lint`) : le garde le vérifie aussi, parce qu'un dépassement ne se
 * voit qu'au déploiement.
 *
 * Usage : node tools/check-manifests.mjs
 * Codes : 0 = conforme, 1 = erreur(s), 2 = erreur interne.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const APPS = ['capteur', 'cerveau'];
const CLE_VALIDE = /^[a-zA-Z0-9_-]+$/;
const LONGUEUR_MAX_CLE_FONCTION = 23;
const BASE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Clés de fonctions référencées par les modules d'un manifeste. */
function fonctionsReferencees(modules) {
  const referencees = new Set();
  for (const [type, entrees] of Object.entries(modules ?? {})) {
    // `modules.function` déclare les fonctions, il ne se référence pas lui-même.
    if (type === 'function') continue;
    for (const entree of Array.isArray(entrees) ? entrees : []) {
      if (typeof entree?.function === 'string') referencees.add(entree.function);
      if (typeof entree?.resolver?.function === 'string') referencees.add(entree.resolver.function);
      if (typeof entree?.key === 'string' && !CLE_VALIDE.test(entree.key)) {
        throw new Error(`${type} : clé de module invalide « ${entree.key} » (regex ${CLE_VALIDE})`);
      }
    }
  }
  return referencees;
}

/** Vrai si le source exporte bien ce nom. */
function estExporte(source, nom) {
  const motifs = [
    new RegExp(`export\\s+(?:async\\s+)?function\\s+${nom}\\b`),
    new RegExp(`export\\s+(?:const|let|var)\\s+${nom}\\b`),
    new RegExp(`export\\s*\\{[^}]*\\b${nom}\\b[^}]*\\}`),
  ];
  return motifs.some((motif) => motif.test(source));
}

/** Contrôle un manifeste d'app ; rend la liste des erreurs. */
function controlerApp(app) {
  const erreurs = [];
  const cheminManifeste = join(BASE, app, 'manifest.yml');
  const cheminIndex = join(BASE, app, 'src', 'index.ts');
  if (!existsSync(cheminManifeste)) return [`${app}/manifest.yml : absent`];
  const manifeste = parse(readFileSync(cheminManifeste, 'utf8'));
  if (!manifeste?.modules) erreurs.push(`${app} : aucune section modules`);
  if (!manifeste?.app?.id) erreurs.push(`${app} : aucun app.id (forge register le renseigne)`);
  if (!manifeste?.permissions?.scopes?.length) erreurs.push(`${app} : aucun scope déclaré`);
  if (!existsSync(cheminIndex)) {
    erreurs.push(`${app}/src/index.ts : absent (handlers du manifeste introuvables)`);
    return erreurs;
  }
  const source = readFileSync(cheminIndex, 'utf8');
  // Les fonctions sont un module comme les autres (`modules.function`).
  const fonctions = (manifeste.modules?.function ?? []).map((entree) => entree.key);
  for (const referencee of fonctionsReferencees(manifeste.modules)) {
    if (!fonctions.includes(referencee)) {
      erreurs.push(`${app} : module référençant « ${referencee} », absent de la section function`);
    }
  }
  for (const entree of manifeste.modules?.function ?? []) {
    if (String(entree.key ?? '').length > LONGUEUR_MAX_CLE_FONCTION) {
      erreurs.push(
        `${app} : clé de fonction « ${entree.key} » dépasse ${LONGUEUR_MAX_CLE_FONCTION} caractères`,
      );
    }
    const handler = String(entree.handler ?? '');
    const [, nom] = handler.split('.');
    if (!handler.startsWith('index.') || !nom) {
      erreurs.push(`${app} : handler « ${handler} » (${entree.key}) hors de index.`);
      continue;
    }
    if (!estExporte(source, nom)) {
      erreurs.push(`${app} : handler index.${nom} (${entree.key}) non exporté par src/index.ts`);
    }
  }
  const ressources = new Set((manifeste.resources ?? []).map((entree) => entree.key));
  for (const [type, entrees] of Object.entries(manifeste.modules)) {
    for (const entree of Array.isArray(entrees) ? entrees : []) {
      const reference = entree.resource ?? entree.resources;
      if (typeof reference !== 'string') continue;
      if (!ressources.has(reference)) {
        erreurs.push(`${app} : ${type} référence la ressource « ${reference} », absente`);
        continue;
      }
      const chemin = (manifeste.resources ?? []).find((r) => r.key === reference)?.path;
      if (chemin && !existsSync(join(BASE, app, chemin))) {
        erreurs.push(`${app} : ressource « ${reference} » pointe un fichier absent (${chemin})`);
      }
    }
  }
  return erreurs;
}

const erreurs = APPS.flatMap(controlerApp);
for (const erreur of erreurs) console.log(`::error::${erreur}`);
console.log(`${APPS.length} manifeste(s) contrôlé(s), ${erreurs.length} erreur(s)`);
process.exit(erreurs.length > 0 ? 1 : 0);
