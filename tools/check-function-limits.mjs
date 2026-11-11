#!/usr/bin/env node
/**
 * Garde de taille des fonctions : moins de 50 lignes.
 *
 * Règle utilisateur (24 octobre 2026) : toute fonction fait moins de 50 lignes.
 * Le contrôle s'appuie sur l'AST TypeScript (pas de regex), sur les mêmes
 * racines que la garde de taille des fichiers.
 *
 * Sont mesurées les fonctions nommées du code produit : déclarations,
 * méthodes, expressions de fonction et fonctions fléchées affectées ou en
 * propriété d'objet. Les callbacks passés directement à un appel
 * (`describe(() => …)`, `list.map(x => …)`) ne sont pas mesurés : ce sont des
 * blocs de données, pas des fonctions d'un module.
 *
 * Usage : node tools/check-function-limits.mjs [--limite N] [--racine R]...
 * Codes : 0 = conforme, 1 = dépassement(s), 2 = erreur interne.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const LIMITE_DEFAUT = 50;
const RACINES_DEFAUT = ['shared', 'capteur', 'cerveau'];
const EXTENSIONS = new Set(['.ts', '.tsx']);
const IGNORES = new Set(['node_modules', 'dist', 'coverage', '.git']);
const GENRES = new Set([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.ArrowFunction,
]);

/** Fichiers TypeScript des racines, triés. */
function listerFichiers(racine) {
  const trouve = [];
  const pile = [racine];
  while (pile.length > 0) {
    const courant = pile.pop();
    let entrees;
    try {
      entrees = readdirSync(courant);
    } catch {
      continue;
    }
    for (const entree of entrees) {
      const chemin = join(courant, entree);
      if (IGNORES.has(entree)) continue;
      if (statSync(chemin).isDirectory()) pile.push(chemin);
      else if (EXTENSIONS.has(entree.slice(entree.lastIndexOf('.')))) trouve.push(chemin);
    }
  }
  return trouve.sort();
}

/** Une fonction fléchée/expression passée en argument d'appel n'est pas mesurée. */
function estCallback(noeud) {
  return (
    (noeud.kind === ts.SyntaxKind.ArrowFunction || noeud.kind === ts.SyntaxKind.FunctionExpression) &&
    noeud.parent?.kind === ts.SyntaxKind.CallExpression
  );
}

/** Nom lisible d'une fonction, pour le rapport. */
function nommer(noeud) {
  if (noeud.name?.text) return noeud.name.text;
  if (noeud.parent?.kind === ts.SyntaxKind.VariableDeclaration && noeud.parent.name?.text) {
    return noeud.parent.name.text;
  }
  if (noeud.parent?.kind === ts.SyntaxKind.PropertyAssignment) {
    return String(noeud.parent.name?.getText?.() ?? 'propriété');
  }
  return '<anonyme>';
}

/** Mesure les fonctions d'un fichier ; rend les dépassements. */
function controler(chemin, limite, base) {
  const source = readFileSync(chemin, 'utf8');
  const arbre = ts.createSourceFile(chemin, source, ts.ScriptTarget.ES2022, true,
    chemin.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const depassements = [];
  const visite = (noeud) => {
    if (GENRES.has(noeud.kind) && !estCallback(noeud)) {
      const premiere = arbre.getLineAndCharacterOfPosition(noeud.getStart(arbre)).line;
      const derniere = arbre.getLineAndCharacterOfPosition(noeud.getEnd()).line;
      const lignes = derniere - premiere + 1;
      if (lignes > limite) {
        depassements.push({
          fichier: relative(base, chemin),
          nom: nommer(noeud),
          ligne: premiere + 1,
          lignes,
        });
      }
    }
    ts.forEachChild(noeud, visite);
  };
  visite(arbre);
  return depassements;
}

function main() {
  const args = process.argv.slice(2);
  const limite = args.includes('--limite') ? Number(args[args.indexOf('--limite') + 1]) : LIMITE_DEFAUT;
  const indexRacine = args.indexOf('--racine');
  const base = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const racines = indexRacine >= 0
    ? args.slice(indexRacine).filter((_, i) => i % 2 === 1)
    : RACINES_DEFAUT;
  let total = 0;
  const depassements = [];
  for (const racine of racines) {
    for (const chemin of listerFichiers(resolve(base, racine))) {
      total += 1;
      depassements.push(...controler(chemin, limite, base));
    }
  }
  for (const d of depassements) {
    console.log(`::error::${d.fichier}:${d.ligne} ${d.nom}() fait ${d.lignes} lignes (> ${limite}) — découper`);
  }
  console.log(`${total} fichier(s) contrôlé(s), ${depassements.length} fonction(s) hors limite (${limite} lignes)`);
  process.exit(depassements.length > 0 ? 1 : 0);
}

main();
