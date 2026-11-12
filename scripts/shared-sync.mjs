#!/usr/bin/env node
/**
 * Synchronise le contrat partagé vers les deux apps Forge.
 *
 * Une app Forge est déployée comme un dossier autonome : elle ne peut pas
 * importer hors de sa racine. Le contrat vit pourtant dans `shared/src/`, en
 * un seul exemplaire. Ce script recopie cet exemplaire dans
 * `<app>/src/shared/` (fichiers générés, versionnés) et sait vérifier que les
 * copies n'ont pas dérivé.
 *
 * Il porte aussi deux garde-fous :
 *  - l'**empreinte du contrat** (audit 79) : `shared/CONTRACT.sha256`, somme
 *    SHA-256 de l'arborescence `shared/src/` (chemins + contenus, triés), le
 *    module généré `rules/contrat.ts` excepté. `sync` la régénère et écrit ce
 *    module (qui embarque l'empreinte pour le runtime des deux apps), `check`
 *    la compare au contenu courant **et** au module embarqué — la CI et le
 *    script de déploiement s'appuient dessus pour garantir que les deux apps
 *    partent de la même version du contrat ;
 *  - le **hook pre-commit** (audit 76) : `hooks` installe un hook qui refuse un
 *    commit dont les copies ou l'empreinte dérivent. La CI ne voit que l'arbre
 *    poussé (puis l'arbre fusionné via `merge_group` et `main`) ; le hook, lui,
 *    bloque la désynchronisation à la source, à coût nul pour la CI.
 *    `npm install` l'installe automatiquement (script `prepare`).
 *
 * Usage : node scripts/shared-sync.mjs sync|check|hooks [--quiet]
 * Codes : 0 = OK, 1 = dérive (check) ou erreur d'écriture.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(RACINE, 'shared', 'src');
const CIBLES = [
  join(RACINE, 'capteur', 'src', 'shared'),
  join(RACINE, 'cerveau', 'src', 'shared'),
];
export const CHEMIN_EMPREINTE = join(RACINE, 'shared', 'CONTRACT.sha256');
/** Module généré embarquant l'empreinte pour le runtime des deux apps (audit 79). */
export const CHEMIN_CONTRAT_TS = join(SOURCE, 'rules', 'contrat.ts');
/** Chemin relatif (posix) du module généré, exclu de l'empreinte (sinon circulaire). */
export const CONTRAT_TS_REL = 'rules/contrat.ts';
const MARQUEUR_HOOK = '# merge-avec-contexte : garde du contrat partagé (scripts/shared-sync.mjs)';
const CONTENU_HOOK = [
  '#!/bin/sh',
  MARQUEUR_HOOK,
  '# Refuse un commit dont les copies */src/shared/ ou l’empreinte dérivent.',
  'exec node "$(git rev-parse --show-toplevel)/scripts/shared-sync.mjs" check --quiet',
  '',
].join('\n');

/** Chemin relatif posix. */
function posix(chemin) {
  return chemin.split('\\').join('/');
}

/** Liste les fichiers d'un dossier, chemins relatifs triés. */
export function lister(racine) {
  if (!existsSync(racine)) return [];
  const trouve = [];
  const pile = [racine];
  while (pile.length > 0) {
    const courant = pile.pop();
    for (const entree of readdirSync(courant)) {
      const chemin = join(courant, entree);
      if (statSync(chemin).isDirectory()) pile.push(chemin);
      else trouve.push(relative(racine, chemin));
    }
  }
  return trouve.sort();
}

/** Recopie le contrat dans une cible (propre : la cible est recréée). */
function synchroniser(cible) {
  if (existsSync(cible)) rmSync(cible, { recursive: true, force: true });
  mkdirSync(dirname(cible), { recursive: true });
  cpSync(SOURCE, cible, { recursive: true });
  return lister(cible).length;
}

/** Compare une cible à la source au fichier près ; rend la liste des dérives. */
export function verifier(cible, source = SOURCE) {
  const derives = [];
  const fichiersSource = lister(source);
  const copie = lister(cible);
  for (const fichier of fichiersSource) {
    const cheminCopie = join(cible, fichier);
    if (!copie.includes(fichier)) {
      derives.push(`${posix(relative(RACINE, cheminCopie))} : absent`);
      continue;
    }
    const a = readFileSync(join(source, fichier));
    const b = readFileSync(cheminCopie);
    if (!a.equals(b)) derives.push(`${posix(relative(RACINE, cheminCopie))} : différent de shared/src/${fichier}`);
  }
  for (const fichier of copie) {
    if (!fichiersSource.includes(fichier)) {
      derives.push(`${posix(relative(RACINE, join(cible, fichier)))} : en trop (ne pas écrire ici)`);
    }
  }
  return derives;
}

/** Somme SHA-256 de l'arborescence source (chemins + contenus, triés). */
export function empreinte(source = SOURCE) {
  const hachoir = createHash('sha256');
  for (const fichier of lister(source)) {
    // Le module généré qui porte l'empreinte est exclu : l'inclure rendrait
    // l'empreinte circulaire (elle changerait dès qu'on l'y écrit).
    if (posix(fichier) === CONTRAT_TS_REL) continue;
    hachoir.update(`${posix(fichier)}\n`);
    hachoir.update(readFileSync(join(source, fichier)));
    hachoir.update('\n');
  }
  return hachoir.digest('hex');
}

/** Écrit l'empreinte du contrat dans le fichier versionné. */
export function ecrireEmpreinte(valeur, chemin = CHEMIN_EMPREINTE) {
  writeFileSync(chemin, [
    '# Empreinte SHA-256 du contrat partagé (shared/src) — audit 79.',
    '# Générée par `npm run shared:sync` : ne pas modifier à la main.',
    valeur,
    '',
  ].join('\n'));
}

/** Empreinte enregistrée dans le fichier versionné, ou `null`. */
export function lireEmpreinte(chemin = CHEMIN_EMPREINTE) {
  if (!existsSync(chemin)) return null;
  const trouve = readFileSync(chemin, 'utf8').match(/^[0-9a-f]{64}$/m);
  return trouve ? trouve[0] : null;
}

/** Écrit le module généré qui embarque l'empreinte pour le runtime des apps. */
export function ecrireContratTs(valeur, chemin = CHEMIN_CONTRAT_TS) {
  mkdirSync(dirname(chemin), { recursive: true });
  writeFileSync(chemin, [
    '/**',
    ' * Empreinte du contrat partagé (audit 79), régénérée par `npm run shared:sync`.',
    ' *',
    ' * Somme SHA-256 de l’arborescence `shared/src/` (chemins + contenus, triés),',
    ' * ce module lui-même excepté (sinon l’empreinte serait circulaire). Les deux',
    ' * apps l’embarquent via leur copie générée : la route `health` du Cerveau et',
    ' * le modèle des réglages du Capteur la renvoient, pour qu’un écart de version',
    ' * de contrat entre les deux déploiements soit visible d’un coup d’œil.',
    ' *',
    ' * **Ne pas modifier à la main** : `scripts/shared-sync.mjs` l’écrit, et',
    ' * `npm run shared:check` vérifie qu’elle correspond au contenu courant.',
    ' */',
    `export const EMPREINTE_CONTRAT = '${valeur}';`,
    '',
  ].join('\n'));
}

/** Empreinte embarquée dans le module généré, ou `null`. */
export function lireEmpreinteTs(chemin = CHEMIN_CONTRAT_TS) {
  if (!existsSync(chemin)) return null;
  const trouve = readFileSync(chemin, 'utf8').match(/['"]([0-9a-f]{64})['"]/);
  return trouve ? trouve[1] : null;
}

/** Dossier des hooks git du dépôt (core.hooksPath sinon .git/hooks), ou `null`. */
export function dossierHooks(base = RACINE) {
  const git = (...args) => execFileSync('git', args, { cwd: base, encoding: 'utf8' }).trim();
  try {
    const configure = git('config', 'core.hooksPath');
    if (configure) return resolve(base, configure);
    const chemin = git('rev-parse', '--git-path', 'hooks');
    if (chemin) return resolve(base, chemin);
  } catch {
    /* pas de dépôt git ou pas de git : rien à installer */
  }
  return null;
}

/** Installe (ou met à jour) le hook pre-commit ; rend son chemin ou `null`. */
export function installerHook(base = RACINE, dossier = null) {
  const cible = dossier ?? dossierHooks(base);
  if (!cible) {
    console.log('Hook pre-commit non installé : dépôt git introuvable.');
    return null;
  }
  mkdirSync(cible, { recursive: true });
  const chemin = join(cible, 'pre-commit');
  if (existsSync(chemin) && !readFileSync(chemin, 'utf8').includes(MARQUEUR_HOOK)) {
    console.log(`Hook pre-commit existant conservé (${posix(chemin)}) : ajoutez-y`
      + ' `node scripts/shared-sync.mjs check --quiet` pour garder le contrôle.');
    return null;
  }
  writeFileSync(chemin, CONTENU_HOOK, { mode: 0o755 });
  return chemin;
}

/** Mode `check` : copies + empreinte + module embarqué ; rend les dérives. */
function controler() {
  const derives = CIBLES.flatMap((cible) => verifier(cible));
  const attendue = empreinte();
  const enregistree = lireEmpreinte();
  if (enregistree !== attendue) {
    derives.push(`shared/CONTRACT.sha256 : ${enregistree === null ? 'absente' : 'périmée'}`
      + ` (empreinte courante ${attendue.slice(0, 12)}…) — lancez npm run shared:sync`);
  }
  const embarquee = lireEmpreinteTs();
  if (embarquee !== attendue) {
    derives.push(`shared/src/rules/contrat.ts : ${embarquee === null ? 'absente' : 'périmée'}`
      + ` (empreinte courante ${attendue.slice(0, 12)}…) — lancez npm run shared:sync`);
  }
  return derives;
}

function main() {
  const mode = process.argv[2];
  const silencieux = process.argv.includes('--quiet');
  if (mode === 'sync') {
    // Empreinte calculée avant d'écrire le module généré (qui en est exclu).
    const valeur = empreinte();
    ecrireContratTs(valeur);
    for (const cible of CIBLES) {
      const nombre = synchroniser(cible);
      console.log(`${posix(relative(RACINE, cible))} : ${nombre} fichier(s) recopié(s)`);
    }
    ecrireEmpreinte(valeur);
    console.log(`shared/CONTRACT.sha256 : ${valeur.slice(0, 12)}…`);
  } else if (mode === 'check') {
    const derives = controler();
    if (derives.length > 0) {
      console.error('Contrat partagé désynchronisé :');
      for (const ligne of derives) console.error(`  - ${ligne}`);
      console.error('Corrigez shared/src/ puis lancez : npm run shared:sync');
      process.exit(1);
    }
    if (!silencieux) console.log('Contrat partagé synchronisé (copies + empreinte).');
  } else if (mode === 'hooks') {
    const chemin = installerHook();
    if (chemin && !silencieux) console.log(`Hook pre-commit installé : ${posix(chemin)}`);
  } else {
    console.error('Usage : node scripts/shared-sync.mjs sync|check|hooks');
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
