/**
 * Self-tests de scripts/deploiement.mjs (audit 78, 81) — fonctions pures :
 * arguments, résolution du binaire Forge, version verrouillée, contrôle health.
 * Aucun déploiement réel n'est déclenché ici.
 */
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  analyserArgs, controleSante, extraireVersion, lireVersionVerrouillee, resoudreForgeBin,
} from '../../scripts/deploiement.mjs';

function binaireForge(dossier) {
  mkdirSync(dossier, { recursive: true });
  const chemin = join(dossier, 'forge');
  writeFileSync(chemin, '#!/bin/sh\nexit 0\n');
  chmodSync(chemin, 0o755);
  return chemin;
}

test('analyserArgs : apps, environnements, options', () => {
  assert.deepEqual(analyserArgs(['capteur', 'development']), {
    app: 'capteur', environnement: 'development', verification: true, sante: true,
  });
  const passes = analyserArgs(['cerveau', 'production', '--skip-verify', '--skip-health']);
  assert.equal(passes.verification, false);
  assert.equal(passes.sante, false);
  assert.throws(() => analyserArgs(['autre', 'development']));
  assert.throws(() => analyserArgs(['capteur', 'dev']));
  assert.throws(() => analyserArgs(['capteur', 'development', '--inconnue']));
  assert.throws(() => analyserArgs([]));
});

test('extraireVersion : semver extrait, bruit ignoré', () => {
  assert.equal(extraireVersion('14.2.0\n'), '14.2.0');
  assert.equal(extraireVersion('Warning: Forge CLI supports Node.js 22.x or 24.x.\n14.2.0'), '14.2.0');
  assert.equal(extraireVersion('aucune version ici'), null);
});

test('resoudreForgeBin : FORGE_BIN, installation Atlassian, PATH, absent', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mac-forge-'));
  const explicite = binaireForge(join(tmp, 'ailleurs'));
  assert.equal(resoudreForgeBin({ FORGE_BIN: explicite, HOME: tmp, PATH: '' }), explicite);
  assert.throws(() => resoudreForgeBin({ FORGE_BIN: join(tmp, 'fantome'), HOME: tmp, PATH: '' }));
  const atlassian = binaireForge(join(tmp, '.atlassian', 'cli', 'node_modules', '.bin'));
  assert.equal(resoudreForgeBin({ HOME: tmp, PATH: '' }), atlassian);
  const dansPath = mkdtempSync(join(tmpdir(), 'mac-path-'));
  binaireForge(dansPath);
  const homeVide = mkdtempSync(join(tmpdir(), 'mac-home-'));
  // `which` doit rester trouvable : un PATH réel accompagne le dossier testé.
  const pathReel = `${dansPath}:/usr/bin:/bin`;
  assert.equal(resoudreForgeBin({ HOME: homeVide, PATH: pathReel }), join(dansPath, 'forge'));
  assert.throws(() => resoudreForgeBin({ HOME: homeVide, PATH: `${join(tmp, 'vide')}:/usr/bin:/bin` }));
});

test('lireVersionVerrouillee : variable prioritaire, fichier sinon', () => {
  assert.equal(lireVersionVerrouillee({ FORGE_CLI_VERSION: ' 99.1.2 ' }), '99.1.2');
  assert.match(lireVersionVerrouillee({}), /^\d+\.\d+\.\d+$/);
});

test('controleSante : 200 ok, échec HTTP, corps non JSON', async () => {
  const ok = async () => ({ status: 200, text: async () => JSON.stringify({ status: 'ok', stockage: 'ok' }) });
  const sain = await controleSante('https://exemple.invalid/pont', ok);
  assert.equal(sain.status, 200);
  assert.equal(sain.corps.status, 'ok');
  const ko = async () => ({ status: 500, text: async () => 'boom' });
  assert.equal((await controleSante('https://exemple.invalid', ko)).status, 500);
  // La requête envoyée est bien la route publique `health`, sans signature.
  let vue = null;
  const espion = async (url, init) => {
    vue = { url, init };
    return { status: 200, text: async () => '{"status":"ok"}' };
  };
  await controleSante('https://exemple.invalid/pont', espion);
  assert.equal(vue.init.method, 'POST');
  assert.deepEqual(JSON.parse(vue.init.body), { route: 'health', payload: {} });
});
