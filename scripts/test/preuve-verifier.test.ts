/**
 * Tests de l'étape « PR Bitbucket réelle » du vérificateur de preuve
 * (`scripts/preuve-verifier.ts`), sans réseau.
 *
 * Le fichier de preuve est écrit dans un dossier temporaire : absent → l'étape
 * est **sautée** ; présent et cohérent → l'étape est vérifiée ; empreinte
 * fausse → l'étape est en échec. Aucun appel HTTP n'est fait : le contrôle
 * porte sur le contenu du fichier et sur son empreinte.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ETAPE_PREUVE_PR,
  resumer,
  TYPE_PREUVE_PR,
  verifierEtapePr,
  type Ligne,
} from '../preuve-verifier';
import { empreinte, type Capture } from '../preuve-outils';

/** Dossier temporaire du test (vide après chaque cas). */
let dossier = '';

/** Crée le dossier temporaire une fois pour toutes. */
function dossierTemporaire(): string {
  if (!dossier) dossier = mkdtempSync(join(tmpdir(), 'preuve-pr-'));
  return dossier;
}

/** Écrit un fichier de preuve et rend son chemin. */
function ecrirePreuve(capture: unknown): string {
  const chemin = join(dossierTemporaire(), '08-pr-bitbucket.json');
  writeFileSync(chemin, `${JSON.stringify(capture, null, 2)}\n`, 'utf8');
  return chemin;
}

/** Preuve de PR cohérente : PR brute, dépôt, espace, contrôle de fusion. */
function preuveCoherente(): Omit<Capture, 'empreinte'> {
  return {
    etape: ETAPE_PREUVE_PR,
    titre: 'Pull request Bitbucket #7 et contrôle de fusion du Capteur',
    horodatage: '2026-11-13T09:00:00.000Z',
    requete: {
      methode: 'GET',
      url: 'https://api.bitbucket.org/2.0/repositories/ws/repo/pullrequests/7',
      urlControles: 'https://api.bitbucket.org/2.0/repositories/ws/repo/pullrequests/7/mergeability/checks',
    },
    reponse: {
      pullRequest: {
        id: 7,
        title: 'MAC-2 — Limite de tentatives',
        state: 'OPEN',
        source: { branch: { name: 'feature/MAC-2-limite-tentatives' }, repository: { full_name: 'ws/repo' } },
        destination: { branch: { name: 'main' } },
        links: { html: { href: 'https://bitbucket.org/ws/repo/pull-requests/7' } },
      },
      controles: {
        values: [
          { type: 'build', status: 'SUCCESSFUL', blocking: false },
          {
            type: 'custom',
            status: 'FAILED',
            blocking: true,
            message: 'Bloqué, 2 raisons.',
            check: { name: 'Capteur — Merge avec contexte' },
          },
        ],
      },
    },
    preuve: {
      type: TYPE_PREUVE_PR,
      workspace: 'ws',
      repo: 'repo',
      prId: 7,
      url: 'https://bitbucket.org/ws/repo/pull-requests/7',
      etat: 'OPEN',
      source: 'feature/MAC-2-limite-tentatives',
      cible: 'main',
    },
  };
}

/** Preuve de PR complète, empreinte comprise. */
function captureSignee(): Capture {
  const capture = preuveCoherente();
  return { ...capture, empreinte: empreinte(capture) };
}

afterEach(() => {
  if (dossier) rmSync(dossier, { recursive: true, force: true });
  dossier = '';
});

describe('étape « PR Bitbucket réelle »', () => {
  it('est sautée quand le fichier de preuve manque', async () => {
    const ligne = await verifierEtapePr(join(dossierTemporaire(), '08-pr-bitbucket.json'));
    expect(ligne.etat).toBe('SAUTEE');
    expect(ligne.etape).toBe(ETAPE_PREUVE_PR);
    expect(ligne.detail).toContain('pas encore de PR');
  });

  it('est vérifiée quand le fichier est cohérent', async () => {
    const ligne = await verifierEtapePr(ecrirePreuve(captureSignee()));
    expect(ligne.etat).toBe('OK');
    expect(ligne.preuve).toContain('#7');
    expect(ligne.preuve).toContain('Capteur');
    expect(ligne.detail).toContain('bloquant');
  });

  it('échoue quand l’empreinte est fausse', async () => {
    const capture = { ...preuveCoherente(), empreinte: `sha256:${'0'.repeat(64)}` };
    const ligne = await verifierEtapePr(ecrirePreuve(capture));
    expect(ligne.etat).toBe('KO');
    expect(ligne.detail).toContain('empreinte');
  });

  it('échoue quand la preuve a été modifiée après son écriture', async () => {
    const capture = captureSignee();
    const altere = { ...capture, reponse: { ...(capture.reponse as Record<string, unknown>), pullRequest: { id: 9 } } };
    const ligne = await verifierEtapePr(ecrirePreuve(altere));
    expect(ligne.etat).toBe('KO');
    expect(ligne.detail).toContain('empreinte');
  });

  it('échoue quand le contrôle de fusion personnalisé est absent', async () => {
    const capture = preuveCoherente();
    const sansControle = { ...capture, reponse: { ...(capture.reponse as Record<string, unknown>), controles: { values: [] } } };
    const ligne = await verifierEtapePr(ecrirePreuve({ ...sansControle, empreinte: empreinte(sansControle) }));
    expect(ligne.etat).toBe('KO');
    expect(ligne.detail).toContain('contrôle de fusion personnalisé');
  });

  it('échoue quand le dépôt enregistré ne correspond pas à la PR brute', async () => {
    const capture = preuveCoherente();
    const mauvais = { ...capture, preuve: { ...capture.preuve, repo: 'autre-depot' } };
    const ligne = await verifierEtapePr(ecrirePreuve({ ...mauvais, empreinte: empreinte(mauvais) }));
    expect(ligne.etat).toBe('KO');
    expect(ligne.detail).toContain('dépôt');
  });
});

describe('compte rendu', () => {
  it('compte les étapes sautées à part des étapes vérifiées', () => {
    const lignes: Ligne[] = [
      { etape: 'a', preuve: '', etat: 'OK', detail: '' },
      { etape: 'b', preuve: '', etat: 'OK', detail: '' },
      { etape: 'c', preuve: '', etat: 'SAUTEE', detail: '' },
    ];
    expect(resumer(lignes)).toBe('2 étape(s) vérifiée(s), 0 en échec, 1 sautée(s)');
  });

  it('compte les échecs et ne les confond pas avec les sauts', () => {
    const lignes: Ligne[] = [
      { etape: 'a', preuve: '', etat: 'OK', detail: '' },
      { etape: 'b', preuve: '', etat: 'KO', detail: '' },
      { etape: 'c', preuve: '', etat: 'SAUTEE', detail: '' },
    ];
    expect(resumer(lignes)).toBe('1 étape(s) vérifiée(s), 1 en échec, 1 sautée(s)');
  });
});
