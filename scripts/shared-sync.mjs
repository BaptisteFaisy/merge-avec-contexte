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
 * Usage : node scripts/shared-sync.mjs sync|check [--quiet]
 * Codes : 0 = OK, 1 = dérive (check) ou erreur d'écriture.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(RACINE, 'shared', 'src');
const CIBLES = [
  join(RACINE, 'capteur', 'src', 'shared'),
  join(RACINE, 'cerveau', 'src', 'shared'),
];

/** Liste les fichiers d'un dossier, chemins relatifs triés. */
function lister(racine) {
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

/** Compare une cible au fichier près ; rend la liste des dérives. */
function verifier(cible) {
  const derives = [];
  const source = lister(SOURCE);
  const copie = lister(cible);
  for (const fichier of source) {
    const cheminCopie = join(cible, fichier);
    if (!copie.includes(fichier)) {
      derives.push(`${relative(RACINE, cheminCopie)} : absent`);
      continue;
    }
    const a = readFileSync(join(SOURCE, fichier));
    const b = readFileSync(cheminCopie);
    if (!a.equals(b)) derives.push(`${relative(RACINE, cheminCopie)} : différent de shared/src/${fichier}`);
  }
  for (const fichier of copie) {
    if (!source.includes(fichier)) {
      derives.push(`${relative(RACINE, join(cible, fichier))} : en trop (ne pas écrire ici)`);
    }
  }
  return derives;
}

const mode = process.argv[2];
if (mode === 'sync') {
  for (const cible of CIBLES) {
    const nombre = synchroniser(cible);
    console.log(`${relative(RACINE, cible)} : ${nombre} fichier(s) recopié(s)`);
  }
} else if (mode === 'check') {
  const derives = CIBLES.flatMap(verifier);
  if (derives.length > 0) {
    console.error('Contrat partagé désynchronisé :');
    for (const ligne of derives) console.error(`  - ${ligne}`);
    console.error('Corrigez shared/src/ puis lancez : npm run shared:sync');
    process.exit(1);
  }
  if (!process.argv.includes('--quiet')) console.log('Contrat partagé synchronisé.');
} else {
  console.error('Usage : node scripts/shared-sync.mjs sync|check');
  process.exit(1);
}
