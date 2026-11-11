import { describe, expect, it } from 'vitest';
import { extractIssueKeys, findKeysIn } from '../src/issues/extract-keys';

const source = (patch: Partial<{ sourceBranch: string; title: string; commitMessages: string[] }> = {}) => ({
  sourceBranch: patch.sourceBranch ?? '',
  title: patch.title ?? '',
  commitMessages: patch.commitMessages ?? [],
});

describe('extractIssueKeys — ordre branche, titre, commits (§8)', () => {
  it('lit la clé dans le nom de branche', () => {
    expect(extractIssueKeys(source({ sourceBranch: 'feature/PAY-123-limite-tentatives' }))).toEqual(['PAY-123']);
  });

  it('préfère la branche au titre quand les deux parlent', () => {
    const cles = extractIssueKeys(source({ sourceBranch: 'feature/PAY-123-x', title: 'PAY-999 au passage' }));
    expect(cles).toEqual(['PAY-123', 'PAY-999']);
  });

  it('descend jusqu’aux messages de commit', () => {
    const cles = extractIssueKeys(source({ commitMessages: ['PAY-123 corrige', 'PAY-123 suite'] }));
    expect(cles).toEqual(['PAY-123']);
  });

  it('rend toutes les clés trouvées, sans doublon', () => {
    const cles = extractIssueKeys(source({
      sourceBranch: 'feature/PAY-123-x',
      title: 'PAY-124 et PAY-123',
      commitMessages: ['PAY-125'],
    }));
    expect(cles).toEqual(['PAY-123', 'PAY-124', 'PAY-125']);
  });

  it('ne confond pas une référence technique avec une clé', () => {
    expect(findKeysIn('bump utf-8 and utf-16 support')).toEqual([]);
  });

  it('reconnaît les minuscules d’un projet connu, normalisées en majuscules', () => {
    expect(findKeysIn('fix pay-42', { projectKeys: ['PAY'] })).toEqual(['PAY-42']);
  });

  it('écarte les clés ignorées', () => {
    expect(findKeysIn('PAY-1 et PAY-2', { ignore: ['PAY-2'] })).toEqual(['PAY-1']);
  });
});
