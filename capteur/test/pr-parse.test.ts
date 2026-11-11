/**
 * Transformation du brut Bitbucket en `PrContext` : relecteurs, chemins,
 * déclencheur. Logique pure, aucune horloge ni réseau.
 */
import { describe, expect, it } from 'vitest';
import {
  cheminsDepuisDiffstat,
  declencheurDepuisBitbucket,
  messagesDepuisCommits,
  relecteursDepuisParticipants,
  versPrContext,
} from '../src/bitbucket/pr';
import type { CommitBrut, DiffstatBrut, PullRequestBrut } from '../src/bitbucket/types';
import { extractIssueKeys } from '../src/shared';

const OPTIONS = {
  workspaceUuid: 'ws-1',
  repositoryUuid: 'repo-1',
  repositorySlug: 'acme/checkout',
  trigger: 'on-code-pushed' as const,
  envoiDesChemins: true,
};

function prBrute(surcharges: Partial<PullRequestBrut> = {}): PullRequestBrut {
  return {
    id: 42,
    title: 'PAY-123 limite les tentatives',
    source: { branch: { name: 'feature/PAY-123-limite-tentatives' } },
    destination: { branch: { name: 'main' } },
    participants: [],
    ...surcharges,
  };
}

const COMMITS: CommitBrut[] = [
  { hash: 'a1', message: 'PAY-123 ajoute le compteur' },
  { hash: 'a2', message: '   ' },
];

const DIFFSTAT: DiffstatBrut[] = [
  { status: 'modified', new: { path: 'src/paiement.ts' }, old: { path: 'src/paiement.ts' } },
  { status: 'added', new: { path: 'src/compteur.ts' } },
  { status: 'removed', old: { path: 'src/ancien.ts' } },
];

describe('relecteursDepuisParticipants', () => {
  it('traduit approved en avis approuvé', () => {
    const relecteurs = relecteursDepuisParticipants([
      { role: 'REVIEWER', state: 'approved', user: { account_id: 'acc-1', display_name: 'Léa' } },
    ]);
    expect(relecteurs).toEqual([{ accountId: 'acc-1', displayName: 'Léa', state: 'approved' }]);
  });

  it('traduit changes_requested en changements demandés', () => {
    const relecteurs = relecteursDepuisParticipants([
      { role: 'REVIEWER', state: 'changes_requested', user: { account_id: 'acc-2' } },
    ]);
    expect(relecteurs[0]).toMatchObject({ accountId: 'acc-2', state: 'changes_requested' });
  });

  it('ramène tout autre état à none', () => {
    const relecteurs = relecteursDepuisParticipants([
      { role: 'REVIEWER', state: null, user: { account_id: 'acc-3' } },
      { role: 'REVIEWER', state: 'inconnu-du-jour', user: { account_id: 'acc-4' } },
    ]);
    expect(relecteurs.map((r) => r.state)).toEqual(['none', 'none']);
  });

  it('accepte approved=true même si state est absent', () => {
    const relecteurs = relecteursDepuisParticipants([
      { role: 'REVIEWER', approved: true, user: { account_id: 'acc-5' } },
    ]);
    expect(relecteurs[0]?.state).toBe('approved');
  });

  it('écarte un simple participant sans avis et sans rôle de relecteur', () => {
    const relecteurs = relecteursDepuisParticipants([
      { role: 'PARTICIPANT', state: null, user: { account_id: 'acc-6' } },
    ]);
    expect(relecteurs).toEqual([]);
  });

  it('déduplique un compte présent deux fois et tolère une liste vide', () => {
    const relecteurs = relecteursDepuisParticipants([
      { role: 'REVIEWER', state: 'approved', user: { account_id: 'acc-7' } },
      { role: 'REVIEWER', state: 'approved', user: { account_id: 'acc-7' } },
    ]);
    expect(relecteurs).toHaveLength(1);
    expect(relecteursDepuisParticipants()).toEqual([]);
    expect(relecteursDepuisParticipants([{ role: 'REVIEWER' }])).toEqual([]);
  });
});

describe('chemins et commits', () => {
  it('relève les chemins ajoutés, modifiés et supprimés, sans doublon', () => {
    expect(cheminsDepuisDiffstat(DIFFSTAT)).toEqual([
      'src/paiement.ts',
      'src/compteur.ts',
      'src/ancien.ts',
    ]);
  });

  it('ignore une entrée de diffstat sans chemin', () => {
    expect(cheminsDepuisDiffstat([{ status: 'modified' }, {}])).toEqual([]);
  });

  it('retire les messages de commit vides', () => {
    expect(messagesDepuisCommits(COMMITS)).toEqual(['PAY-123 ajoute le compteur']);
    expect(messagesDepuisCommits()).toEqual([]);
  });
});

describe('declencheurDepuisBitbucket', () => {
  it('reconnaît les trois déclencheurs du manifeste', () => {
    expect(declencheurDepuisBitbucket('on-code-pushed')).toBe('on-code-pushed');
    expect(declencheurDepuisBitbucket('on-reviewer-status-changed')).toBe('on-reviewer-status-changed');
    expect(declencheurDepuisBitbucket('on-merge')).toBe('on-merge');
  });

  it('tolère un déclencheur inconnu en retombant sur le push', () => {
    expect(declencheurDepuisBitbucket('on-quelque-chose-de-nouveau')).toBe('on-code-pushed');
    expect(declencheurDepuisBitbucket('')).toBe('on-code-pushed');
    expect(declencheurDepuisBitbucket(undefined)).toBe('on-code-pushed');
  });
});

describe('versPrContext', () => {
  it('assemble titre, branches, commits, chemins, relecteurs et déclencheur', () => {
    const contexte = versPrContext(
      prBrute({
        participants: [
          { role: 'REVIEWER', state: 'approved', user: { account_id: 'acc-1', display_name: 'Léa' } },
          { role: 'REVIEWER', state: 'changes_requested', user: { account_id: 'acc-2' } },
        ],
      }),
      COMMITS,
      DIFFSTAT,
      OPTIONS,
    );
    expect(contexte).toEqual({
      workspaceUuid: 'ws-1',
      repositoryUuid: 'repo-1',
      repositorySlug: 'acme/checkout',
      pullRequestId: 42,
      title: 'PAY-123 limite les tentatives',
      sourceBranch: 'feature/PAY-123-limite-tentatives',
      targetBranch: 'main',
      commitMessages: ['PAY-123 ajoute le compteur'],
      changedPaths: ['src/paiement.ts', 'src/compteur.ts', 'src/ancien.ts'],
      reviewers: [
        { accountId: 'acc-1', displayName: 'Léa', state: 'approved' },
        { accountId: 'acc-2', displayName: undefined, state: 'changes_requested' },
      ],
      trigger: 'on-code-pushed',
    });
  });

  it('omet les chemins quand l’administrateur a désactivé leur envoi', () => {
    const contexte = versPrContext(prBrute(), COMMITS, DIFFSTAT, {
      ...OPTIONS,
      envoiDesChemins: false,
    });
    expect(contexte.changedPaths).toEqual([]);
  });

  it('garde les messages de commit même sans chemins : seule la liste des fichiers est retirée', () => {
    const contexte = versPrContext(prBrute(), COMMITS, DIFFSTAT, {
      ...OPTIONS,
      envoiDesChemins: false,
    });
    expect(contexte.commitMessages).toEqual(['PAY-123 ajoute le compteur']);
  });

  it('reste tolérant sur une PR incomplète (champs absents)', () => {
    const contexte = versPrContext(
      { id: 7 } as unknown as PullRequestBrut,
      [],
      [],
      { ...OPTIONS, trigger: 'on-merge' },
    );
    expect(contexte.title).toBe('');
    expect(contexte.sourceBranch).toBe('');
    expect(contexte.targetBranch).toBe('');
    expect(contexte.reviewers).toEqual([]);
    expect(contexte.trigger).toBe('on-merge');
  });
});

describe('§17 cas 8 — PR issue d’un fork (item 30)', () => {
  it('trouve la clé dans le titre quand la branche du fork n’en porte aucune', () => {
    const contexte = versPrContext(
      prBrute({
        title: 'PAY-123 correctif urgent depuis un fork',
        source: { branch: { name: 'contributeur-externe:hotfix-urgent' } },
      }),
      [{ hash: 'f1', message: 'correctif urgent, aucune clé ici' }],
      DIFFSTAT,
      OPTIONS,
    );
    expect(contexte.sourceBranch).toBe('contributeur-externe:hotfix-urgent');
    expect(extractIssueKeys(contexte)).toEqual(['PAY-123']);
  });

  it('verrouille l’ordre branche → titre → commits, sans doublon', () => {
    const contexte = versPrContext(
      prBrute({
        title: 'PAY-2 : titre porteur d’une autre clé',
        source: { branch: { name: 'feature/PAY-1-depuis-branche' } },
      }),
      [{ hash: 'c1', message: 'PAY-3 puis PAY-1 déjà vue' }],
      [],
      OPTIONS,
    );
    expect(extractIssueKeys(contexte)).toEqual(['PAY-1', 'PAY-2', 'PAY-3']);
  });

  it('ne trouve rien quand ni la branche, ni le titre, ni les commits ne portent de clé', () => {
    const contexte = versPrContext(
      prBrute({ title: 'Ménage de printemps', source: { branch: { name: 'chore/nettoyage' } } }),
      [{ hash: 'z1', message: 'suppression de code mort' }],
      [],
      OPTIONS,
    );
    expect(extractIssueKeys(contexte)).toEqual([]);
  });
});
