/**
 * Self-tests du garde de schéma des manifestes (tools/check-manifest-schema.mjs)
 * — node:test, aucune dépendance ajoutée (ajv vient de @forge/manifest).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { cheminSchema, compileur, controler, validerManifeste } from '../check-manifest-schema.mjs';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const valider = compileur(JSON.parse(readFileSync(cheminSchema(), 'utf8')));

const MANIFESTE_VALIDE = {
  app: {
    id: 'ari:cloud:ecosystem::app/12345678-1234-1234-1234-123456789abc',
    runtime: { name: 'nodejs22.x' },
  },
  modules: { function: [{ key: 'main', handler: 'index.run' }] },
  permissions: { scopes: ['storage:app'] },
};

test('le schéma réel est porté par @forge/manifest et se compile', () => {
  assert.match(cheminSchema(), /manifest-schema\.json$/);
  assert.equal(typeof valider, 'function');
});

test('manifeste minimal conforme : aucune erreur', () => {
  assert.deepEqual(validerManifeste(MANIFESTE_VALIDE, valider), []);
});

test('app.id hors format ari : erreur de schéma', () => {
  const faux = structuredClone(MANIFESTE_VALIDE);
  faux.app.id = 'pas-une-ari';
  assert.ok(validerManifeste(faux, valider).some((e) => e.includes('/app/id')));
});

test('runtime.name hors enum : erreur de schéma', () => {
  const faux = structuredClone(MANIFESTE_VALIDE);
  faux.app.runtime.name = 'nodejs14.x';
  assert.ok(validerManifeste(faux, valider).length > 0);
});

test('clé inconnue : refusée (additionalProperties)', () => {
  const faux = structuredClone(MANIFESTE_VALIDE);
  faux.cleInconnue = true;
  assert.ok(validerManifeste(faux, valider).some((e) => e.includes('additional properties')));
});

test('les deux manifestes du dépôt valident le schéma réel', () => {
  assert.deepEqual(controler(RACINE), []);
});
