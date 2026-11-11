/**
 * Self-tests de scripts/shared-sync.mjs (empreinte du contrat — audit 79 —,
 * vérification des copies et hook pre-commit — audit 76). node:test uniquement.
 */
import assert from 'node:assert/strict';
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  ecrireEmpreinte, empreinte, installerHook, lireEmpreinte, verifier,
} from '../../scripts/shared-sync.mjs';

function temp(nom) {
  return mkdtempSync(join(tmpdir(), nom));
}

test('empreinte : déterministe, sensible au contenu et aux chemins', () => {
  const source = temp('mac-src-');
  mkdirSync(join(source, 'sous'));
  writeFileSync(join(source, 'a.ts'), 'export const a = 1;\n');
  writeFileSync(join(source, 'sous', 'b.ts'), 'export const b = 2;\n');
  const avant = empreinte(source);
  assert.match(avant, /^[0-9a-f]{64}$/);
  assert.equal(empreinte(source), avant);
  writeFileSync(join(source, 'a.ts'), 'export const a = 2;\n');
  assert.notEqual(empreinte(source), avant);
  // Renommer un fichier à contenu constant change l'empreinte (les chemins comptent).
  writeFileSync(join(source, 'a.ts'), 'export const a = 1;\n');
  rmSync(join(source, 'sous', 'b.ts'));
  writeFileSync(join(source, 'b.ts'), 'export const b = 2;\n');
  assert.notEqual(empreinte(source), avant);
});

test('verifier : conforme, différent, en trop, absent', () => {
  const source = temp('mac-source-');
  const cible = temp('mac-cible-');
  writeFileSync(join(source, 'a.ts'), 'x');
  writeFileSync(join(cible, 'a.ts'), 'x');
  assert.deepEqual(verifier(cible, source), []);
  writeFileSync(join(cible, 'a.ts'), 'y');
  assert.ok(verifier(cible, source).some((l) => l.includes('différent')));
  writeFileSync(join(cible, 'b.ts'), 'z');
  assert.ok(verifier(cible, source).some((l) => l.includes('en trop')));
  rmSync(join(cible, 'a.ts'));
  assert.ok(verifier(cible, source).some((l) => l.includes('absent')));
});

test('empreinte versionnée : aller-retour écriture/lecture', () => {
  const chemin = join(temp('mac-emp-'), 'CONTRACT.sha256');
  const valeur = 'ab'.repeat(32);
  ecrireEmpreinte(valeur, chemin);
  assert.equal(lireEmpreinte(chemin), valeur);
  assert.equal(lireEmpreinte(join(temp('mac-vide-'), 'absent.sha256')), null);
});

test('hook pre-commit : installé, exécutable, idempotent, tiers préservé', () => {
  const dossier = temp('mac-hooks-');
  const chemin = installerHook(process.cwd(), dossier);
  assert.equal(chemin, join(dossier, 'pre-commit'));
  const contenu = readFileSync(chemin, 'utf8');
  assert.ok(contenu.startsWith('#!/bin/sh'));
  assert.ok(contenu.includes('shared-sync.mjs') && contenu.includes('check'));
  assert.ok((statSync(chemin).mode & 0o111) !== 0);
  assert.equal(installerHook(process.cwd(), dossier), chemin); // rejouable
  const tiers = temp('mac-hooks-tiers-');
  writeFileSync(join(tiers, 'pre-commit'), '#!/bin/sh\necho tiers\n');
  chmodSync(join(tiers, 'pre-commit'), 0o755);
  assert.equal(installerHook(process.cwd(), tiers), null);
  assert.equal(readFileSync(join(tiers, 'pre-commit'), 'utf8'), '#!/bin/sh\necho tiers\n');
  assert.ok(existsSync(join(tiers, 'pre-commit')));
});
