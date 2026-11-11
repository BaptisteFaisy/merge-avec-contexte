/**
 * Self-tests du garde de style (tools/check-style.mjs) — node:test, sans
 * dépendance ajoutée. Lancés en CI : `node --test tools/selftests/*.test.mjs`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { controlerSource, estPur } from '../check-style.mjs';

/** Écarts d'une source, codes de règle concernés. */
function regles(chemin, source) {
  return controlerSource(chemin, source).map((e) => e.regle);
}

test('R1 — import relatif avec extension refusé, sans extension accepté', () => {
  assert.deepEqual(regles('cerveau/src/a.ts', `import { x } from './types.ts';`), ['R1']);
  assert.deepEqual(regles('cerveau/src/a.ts', `import { x } from './types';`), []);
  assert.deepEqual(regles('cerveau/src/a.ts', `import j from './data.json';`), []);
  assert.deepEqual(regles('cerveau/src/a.ts', `export { y } from '../b.js';`), ['R1']);
});

test('R2 — @forge/* interdit en logique pure, admis en adaptateur', () => {
  assert.deepEqual(regles('shared/src/a.ts', `import { read } from '@forge/storage';`), ['R2']);
  assert.deepEqual(regles('cerveau/src/shared/a.ts', `import { read } from '@forge/storage';`), ['R2']);
  assert.deepEqual(regles('cerveau/src/rules/r01.ts', `import api from '@forge/api';`), ['R2']);
  assert.deepEqual(regles('cerveau/src/storage/a.ts', `import { read } from '@forge/storage';`), []);
  assert.ok(estPur('capteur/src/check/run.ts'));
  assert.ok(!estPur('capteur/src/bitbucket/api.ts'));
});

test('R3 — console.* hors logger.ts refusé, commentaires ignorés', () => {
  assert.deepEqual(regles('cerveau/src/rules/r01.ts', `console.log('x');`), ['R3']);
  assert.deepEqual(regles('cerveau/src/app/logger.ts', `console.info(ligne);`), []);
  // Le mot « console. » dans un commentaire ne doit pas déclencher la règle.
  assert.deepEqual(regles('cerveau/src/app/a.ts', `/** Le menu de la console. */\nexport const x = 1;`), []);
});

test('R4 — Date.now() : pur interdit, repli et horloge admis', () => {
  assert.deepEqual(regles('shared/src/a.ts', `const t = Date.now();`), ['R4']);
  assert.deepEqual(regles('cerveau/src/rules/r01.ts', `if (a > Date.now()) {}`), ['R4']);
  assert.deepEqual(regles('shared/src/a.ts', `const t = input.now ?? Date.now();`), []);
  assert.deepEqual(regles('capteur/src/check/run.ts', `const t = deps.now ? deps.now() : Date.now();`), []);
  assert.deepEqual(regles('cerveau/src/app/horloge.ts', `export const h = () => Date.now();`), []);
  assert.deepEqual(regles('cerveau/src/app/secrets.ts', `const t = Date.now();`), []);
  assert.deepEqual(regles('cerveau/src/storage/a.ts', `expiration > Date.now();`), []);
});

test('fichier sain — aucun écart', () => {
  const source = [
    `import { Rule } from '../shared';`,
    `export function evaluer(now: string): string { return now; }`,
  ].join('\n');
  assert.deepEqual(controlerSource('cerveau/src/rules/r99.ts', source), []);
});
