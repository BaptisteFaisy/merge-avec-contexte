import { describe, expect, it } from 'vitest';
import { RULE_CODES, defaultLevelFor, descriptorFor, isRuleCode, mvpRuleCodes, ruleCodesForLot } from '../src/rules/catalog';
import { messageKeys, t } from '../src/message/strings';
import { globMatch, globMatchAny } from '../src/match/glob';

describe('catalogue des règles (§8)', () => {
  it('décrit les treize règles, sans trou', () => {
    expect(RULE_CODES).toHaveLength(13);
    expect(new Set(RULE_CODES).size).toBe(13);
    expect(isRuleCode('R-13')).toBe(true);
    expect(isRuleCode('R-14')).toBe(false);
  });

  it('livre sept règles dans le MVP', () => {
    expect(mvpRuleCodes()).toEqual(['R-01', 'R-02', 'R-03', 'R-04', 'R-05', 'R-06', 'R-07']);
    expect(ruleCodesForLot('S')).toEqual(['R-08', 'R-09', 'R-10', 'R-11']);
    expect(ruleCodesForLot('C')).toEqual(['R-12', 'R-13']);
  });

  it('respecte les niveaux par défaut du cahier des charges', () => {
    expect(defaultLevelFor('R-02')).toBe('blocking');
    expect(defaultLevelFor('R-01')).toBe('warning');
    expect(defaultLevelFor('R-11')).toBe('information');
    expect(defaultLevelFor('R-07')).toBe('warning');
  });

  it('donne un libellé bilingue à chaque règle', () => {
    for (const code of RULE_CODES) {
      const { titleKey } = descriptorFor(code);
      expect(t('fr', titleKey).length).toBeGreaterThan(5);
      expect(t('en', titleKey).length).toBeGreaterThan(5);
    }
  });

  it('expose tous les textes dans les deux langues', () => {
    expect(messageKeys().length).toBeGreaterThan(40);
    expect(t('en', 'verdict.inconclusive')).toBe('Context unavailable, check inconclusive.');
  });
});

describe('motifs glob', () => {
  it('compare exactement sans joker, et par motif sinon', () => {
    expect(globMatch('main', 'main')).toBe(true);
    expect(globMatch('main', 'main2')).toBe(false);
    expect(globMatch('release/*', 'release/1.4')).toBe(true);
    expect(globMatch('release/*', 'release/1.4/hotfix')).toBe(false);
    expect(globMatch('**/migrations/*', 'db/migrations/001.sql')).toBe(true);
  });

  it('traite une liste vide comme « tout »', () => {
    expect(globMatchAny(undefined, 'main')).toBe(true);
    expect(globMatchAny([], 'main')).toBe(true);
    expect(globMatchAny(['develop'], 'main')).toBe(false);
  });
});
