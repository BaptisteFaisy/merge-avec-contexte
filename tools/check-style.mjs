#!/usr/bin/env node
/**
 * Garde de style TypeScript — les règles du dépôt, sans dépendance de lint.
 *
 * Le dépôt n'installe ni eslint ni prettier (audit 75) : ce garde vérifie les
 * conventions de `docs/CONVENTIONS.md` directement sur l'AST TypeScript (même
 * approche que `tools/check-function-limits.mjs`) :
 *
 *  - R1 : imports relatifs **sans extension** (`.ts/.tsx/.js/.jsx/.mjs/.cjs`
 *    interdits ; `.json` reste autorisé, `resolveJsonModule` l'exige) ;
 *  - R2 : aucun import `@forge/*` dans la logique pure — `shared/`, les copies
 *    générées `<app>/src/shared/`, `cerveau/src/rules/`, `cerveau/src/rovo/`,
 *    `capteur/src/check/` (les adaptateurs fins, eux, peuvent) ;
 *  - R3 : `console.*` uniquement dans `<app>/src/app/logger.ts` ;
 *  - R4 : `Date.now()` uniquement dans `<app>/src/app/horloge.ts` et
 *    `<app>/src/app/secrets.ts`, dans une zone d'adaptateur, ou en **repli
 *    explicite** d'une horloge injectée (`x ?? Date.now()`, `c ? … : Date.now()`).
 *
 * Le formatage déclaratif (indentation, fin de ligne) vit dans `.editorconfig`.
 *
 * Usage : node tools/check-style.mjs [--racine R]...
 * Codes : 0 = conforme, 1 = écart(s), 2 = erreur interne.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const RACINES_DEFAUT = ['shared', 'capteur', 'cerveau'];
const EXTENSIONS = new Set(['.ts', '.tsx']);
const IGNORES = new Set(['node_modules', 'dist', 'coverage', '.git']);
const EXTENSION_INTERDITE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/** Zones de logique pure : aucun import `@forge/*` (CONVENTIONS §1). */
export const ZONES_PURES = [
  /^shared\//,
  /^(capteur|cerveau)\/src\/shared\//,
  /^cerveau\/src\/(rules|rovo)\//,
  /^capteur\/src\/check\//,
];
/** Seuls logements de l'heure réelle et du secret (CONVENTIONS §1). */
export const FICHIERS_TEMPS = /(^|\/)src\/app\/(horloge|secrets)\.ts$/;
/** Seul logement de la sortie standard (CONVENTIONS §1). */
export const FICHIER_JOURNAL = /(^|\/)src\/app\/logger\.ts$/;

/** Vrai si le chemin relatif (posix) est dans une zone de logique pure. */
export function estPur(cheminRel) {
  return ZONES_PURES.some((motif) => motif.test(cheminRel));
}

/** Fichiers TypeScript d'une racine, chemins absolus triés. */
export function listerFichiers(racine) {
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

/** Spécificateur d'import/export littéral, ou `null`. */
function specificateur(noeud) {
  const spec = noeud.moduleSpecifier;
  return spec && ts.isStringLiteral(spec) ? spec.text : null;
}

/** R1 + R2 sur un nœud d'import ou de ré-export. */
function controlerImport(noeud, cheminRel, erreurs, ligne) {
  const spec = specificateur(noeud);
  if (spec === null) return;
  if (EXTENSION_INTERDITE.test(spec)) {
    erreurs.push({ regle: 'R1', ligne, message: `import « ${spec} » avec extension — sans extension (CONVENTIONS §4)` });
  }
  if (spec.startsWith('@forge/') && estPur(cheminRel)) {
    erreurs.push({ regle: 'R2', ligne, message: `import « ${spec} » dans la logique pure — adaptateur seulement (CONVENTIONS §1)` });
  }
}

/** R3 sur un accès `console.<méthode>`. */
function controlerConsole(noeud, cheminRel, erreurs, ligne) {
  if (FICHIER_JOURNAL.test(cheminRel)) return;
  if (ts.isPropertyAccessExpression(noeud) && ts.isIdentifier(noeud.expression) && noeud.expression.text === 'console') {
    erreurs.push({ regle: 'R3', ligne, message: `console.${noeud.name.text} hors de src/app/logger.ts (CONVENTIONS §1)` });
  }
}

/** Vrai si l'appel est le repli explicite d'une horloge injectée. */
function estRepliHorloge(noeud) {
  const parent = noeud.parent;
  if (!parent) return false;
  if (ts.isBinaryExpression(parent)) {
    return parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken && parent.right === noeud;
  }
  return ts.isConditionalExpression(parent) && parent.whenFalse === noeud;
}

/** R4 sur un appel `Date.now()`. */
function controlerDateNow(noeud, cheminRel, erreurs, ligne) {
  if (FICHIERS_TEMPS.test(cheminRel)) return;
  if (!estPur(cheminRel)) return; // zone d'adaptateur : l'heure réelle y est admise
  if (estRepliHorloge(noeud)) return; // repli documenté d'une horloge injectée
  erreurs.push({ regle: 'R4', ligne, message: 'Date.now() dans la logique pure — horloge injectée (CONVENTIONS §1)' });
}

/** Vrai si le nœud est un appel `Date.now()`. */
function estDateNow(noeud) {
  return (
    ts.isCallExpression(noeud) &&
    ts.isPropertyAccessExpression(noeud.expression) &&
    ts.isIdentifier(noeud.expression.expression) &&
    noeud.expression.expression.text === 'Date' &&
    noeud.expression.name.text === 'now'
  );
}

/** Contrôle une source ; `cheminRel` est relatif à la racine du dépôt (posix). */
export function controlerSource(cheminRel, source) {
  const genre = cheminRel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const arbre = ts.createSourceFile(cheminRel, source, ts.ScriptTarget.ES2022, true, genre);
  const erreurs = [];
  const visite = (noeud) => {
    const ligne = arbre.getLineAndCharacterOfPosition(noeud.getStart(arbre)).line + 1;
    if (ts.isImportDeclaration(noeud) || ts.isExportDeclaration(noeud)) {
      controlerImport(noeud, cheminRel, erreurs, ligne);
    }
    controlerConsole(noeud, cheminRel, erreurs, ligne);
    if (estDateNow(noeud)) controlerDateNow(noeud, cheminRel, erreurs, ligne);
    ts.forEachChild(noeud, visite);
  };
  visite(arbre);
  return erreurs;
}

function racinesDepuisArgs(args) {
  const index = args.indexOf('--racine');
  return index >= 0 ? args.slice(index).filter((_, i) => i % 2 === 1) : RACINES_DEFAUT;
}

function main() {
  const racines = racinesDepuisArgs(process.argv.slice(2));
  let total = 0;
  const ecarts = [];
  for (const racine of racines) {
    for (const chemin of listerFichiers(resolve(RACINE, racine))) {
      total += 1;
      const cheminRel = relative(RACINE, chemin).split('\\').join('/');
      for (const e of controlerSource(cheminRel, readFileSync(chemin, 'utf8'))) {
        ecarts.push(`${cheminRel}:${e.ligne} [${e.regle}] ${e.message}`);
      }
    }
  }
  for (const ecart of ecarts) console.log(`::error::${ecart}`);
  console.log(`${total} fichier(s) contrôlé(s), ${ecarts.length} écart(s) de style`);
  process.exit(ecarts.length > 0 ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
