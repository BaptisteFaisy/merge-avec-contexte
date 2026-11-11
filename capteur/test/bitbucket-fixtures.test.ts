/**
 * Échantillons Bitbucket Cloud 2.0 (`bitbucket-fixtures.ts`) passés dans la
 * transformation pure `src/bitbucket/pr.ts` : relecteurs aux trois états,
 * chemins des quatre statuts de diffstat, PR de fork sans dépôt hôte, titre
 * sans clé de ticket, pagination partielle.
 */
import { describe, expect, it } from 'vitest';
import {
  cheminsDepuisDiffstat,
  messagesDepuisCommits,
  relecteursDepuisParticipants,
  versPrContext,
  type OptionsPrContext,
} from '../src/bitbucket/pr';
import { extractIssueKeys } from '../src/shared/issues/extract-keys';
import {
  COMMITS_PAGE,
  COMMITS_PAGE_PARTIELLE,
  DIFFSTAT_PAGE,
  DIFFSTAT_PAGE_PARTIELLE,
  PR_ECHANTILLON,
  PR_FORK,
  REPO_UUID,
  WS_UUID,
} from './bitbucket-fixtures';

const OPTIONS: OptionsPrContext = {
  workspaceUuid: WS_UUID,
  repositoryUuid: REPO_UUID,
  trigger: 'on-code-pushed',
  envoiDesChemins: true,
};

describe('participants[] réels → relecteurs', () => {
  it('rend les trois états : approuvé, changements demandés, sans avis', () => {
    const relecteurs = relecteursDepuisParticipants(PR_ECHANTILLON.participants);
    expect(relecteurs).toEqual([
      { accountId: '5d7a9f0c82e05b22cc7d4ef1', displayName: 'Léa Martin', state: 'approved' },
      { accountId: '5d7a9f0c82e05b22cc7d4ef2', displayName: 'Marc Dupuis', state: 'changes_requested' },
      { accountId: '5d7a9f0c82e05b22cc7d4ef3', displayName: 'Awa Ndiaye', state: 'none' },
    ]);
  });

  it('écarte le simple participant (rôle PARTICIPANT, aucun avis rendu)', () => {
    const relecteurs = relecteursDepuisParticipants(PR_ECHANTILLON.participants);
    expect(relecteurs.map((relu) => relu.displayName)).not.toContain('Hugo Petit');
  });
});

describe('diffstat réel → chemins modifiés', () => {
  it('relève les quatre statuts : modifié, ajouté, supprimé, renommé', () => {
    expect(cheminsDepuisDiffstat(DIFFSTAT_PAGE.values)).toEqual([
      'src/paiement.ts',
      'src/compteur.ts',
      'src/legacy/tentatives.ts',
      'src/config/limites.ts',
    ]);
  });

  it('prend le nouveau chemin d’un fichier renommé, pas l’ancien', () => {
    const chemins = cheminsDepuisDiffstat(DIFFSTAT_PAGE.values);
    expect(chemins).toContain('src/config/limites.ts');
    expect(chemins).not.toContain('src/config.ts');
  });
});

describe('commits réels → messages', () => {
  it('retire le saut de ligne final des messages de Bitbucket', () => {
    expect(messagesDepuisCommits(COMMITS_PAGE.values)).toEqual([
      'PAY-123 relit le compteur depuis la config',
      'PAY-123 extrait la configuration du délai',
      'PAY-123 ajoute le compteur de tentatives',
    ]);
  });
});

describe('PR réelle → PrContext', () => {
  it('assemble titre, branches, relecteurs, chemins et commits', () => {
    const contexte = versPrContext(
      PR_ECHANTILLON,
      COMMITS_PAGE.values,
      DIFFSTAT_PAGE.values,
      OPTIONS,
    );
    expect(contexte).toMatchObject({
      pullRequestId: 17,
      title: 'PAY-123 limite les tentatives de connexion',
      sourceBranch: 'feature/PAY-123-limite-tentatives',
      targetBranch: 'main',
      trigger: 'on-code-pushed',
    });
    expect(contexte.reviewers).toHaveLength(3);
    expect(contexte.changedPaths).toHaveLength(4);
    expect(contexte.commitMessages).toHaveLength(3);
  });

  it('tolère l’absence de dépôt hôte au sommet (forme réelle de l’API)', () => {
    const contexte = versPrContext(PR_ECHANTILLON, [], [], OPTIONS);
    expect(PR_ECHANTILLON.repository).toBeUndefined();
    expect(contexte.repositorySlug).toBeUndefined();
  });

  it('accepte une PR de fork : source d’un autre dépôt, titre sans clé', () => {
    const contexte = versPrContext(
      PR_FORK,
      COMMITS_PAGE.values,
      DIFFSTAT_PAGE.values,
      { ...OPTIONS, repositorySlug: PR_FORK.repository?.slug },
    );
    expect(contexte.pullRequestId).toBe(23);
    expect(contexte.sourceBranch).toBe('hotfix/limite-tentatives');
    expect(contexte.targetBranch).toBe('main');
    expect(contexte.repositorySlug).toBeUndefined();
    expect(extractIssueKeys({
      sourceBranch: contexte.sourceBranch,
      title: contexte.title,
      commitMessages: contexte.commitMessages,
    })).toEqual(['PAY-123']);
  });

  it('ne trouve aucune clé dans un titre qui n’en porte pas', () => {
    expect(extractIssueKeys({
      sourceBranch: PR_FORK.source.branch.name,
      title: PR_FORK.title,
      commitMessages: [],
    })).toEqual([]);
  });
});

describe('pagination partielle', () => {
  it('traite une page de commits tronquée avec lien next comme les autres', () => {
    expect(COMMITS_PAGE_PARTIELLE.next).toBeDefined();
    expect(messagesDepuisCommits(COMMITS_PAGE_PARTIELLE.values)).toHaveLength(2);
  });

  it('traite un diffstat tronqué : seuls les chemins reçus comptent', () => {
    expect(DIFFSTAT_PAGE_PARTIELLE.next).toBeDefined();
    expect(cheminsDepuisDiffstat(DIFFSTAT_PAGE_PARTIELLE.values)).toEqual([
      'src/paiement.ts',
      'src/compteur.ts',
    ]);
  });
});
