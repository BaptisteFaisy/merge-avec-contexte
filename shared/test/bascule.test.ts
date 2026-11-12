/**
 * Bascule en masse du mode observation (audit 25, §7.3) : « elle active la
 * règle en avertissement partout, en bloquant sur ce dépôt ».
 */
import { describe, expect, it } from 'vitest';
import { basculeMasse } from '../src/rules/bascule';
import type { RuleConfig } from '../src/types';

const CONFIGS: RuleConfig[] = [
  { rule: 'R-03', level: 'blocking', mode: 'observe', scope: {}, params: { source: 'champs' } },
  { rule: 'R-05', level: 'warning', mode: 'active', scope: {}, params: { jsmProjects: ['JSM'] } },
];

describe('basculeMasse', () => {
  it('pose la règle en avertissement partout', () => {
    const resultat = basculeMasse(CONFIGS, 'R-03', 'warning');
    const partout = resultat.find((c) => c.rule === 'R-03' && c.scope.repositories === undefined);
    expect(partout).toMatchObject({ rule: 'R-03', level: 'warning', mode: 'active', scope: {} });
  });

  it('bloque sur la portée donnée (ce dépôt)', () => {
    const resultat = basculeMasse(CONFIGS, 'R-03', 'warning', { repositories: ['checkout-api'] });
    const bloque = resultat.find(
      (c) => c.rule === 'R-03' && c.scope.repositories?.[0] === 'checkout-api',
    );
    expect(bloque).toMatchObject({ rule: 'R-03', level: 'blocking', mode: 'active' });
  });

  it('conserve les réglages des autres règles', () => {
    const resultat = basculeMasse(CONFIGS, 'R-03', 'warning');
    expect(resultat).toContainEqual(CONFIGS[1]);
  });

  it('remplace les réglages existants de la règle basculée', () => {
    const resultat = basculeMasse(CONFIGS, 'R-03', 'warning');
    const r03 = resultat.filter((c) => c.rule === 'R-03');
    expect(r03).toHaveLength(1);
    expect(r03[0].mode).toBe('active');
  });

  it('conserve les paramètres de la règle basculée', () => {
    const resultat = basculeMasse(CONFIGS, 'R-03', 'warning');
    expect(resultat.find((c) => c.rule === 'R-03')?.params).toEqual({ source: 'champs' });
  });

  it('n’ajoute pas de réglage bloquant sans portée', () => {
    const resultat = basculeMasse(CONFIGS, 'R-03', 'warning');
    expect(resultat.filter((c) => c.rule === 'R-03')).toHaveLength(1);
  });

  it('ignore une portée vide', () => {
    const resultat = basculeMasse(CONFIGS, 'R-03', 'warning', { repositories: [], branches: [] });
    expect(resultat.filter((c) => c.rule === 'R-03')).toHaveLength(1);
  });

  it('accepte une portée de branches', () => {
    const resultat = basculeMasse(CONFIGS, 'R-03', 'warning', { branches: ['main'] });
    const bloque = resultat.find((c) => c.rule === 'R-03' && c.scope.branches?.[0] === 'main');
    expect(bloque?.level).toBe('blocking');
  });

  it('ne modifie pas les réglages reçus (fonction pure)', () => {
    const avant = JSON.parse(JSON.stringify(CONFIGS));
    basculeMasse(CONFIGS, 'R-03', 'warning', { repositories: ['checkout-api'] });
    expect(CONFIGS).toEqual(avant);
  });

  it('crée la règle si elle n’existait pas', () => {
    const resultat = basculeMasse([], 'R-12', 'warning');
    expect(resultat).toHaveLength(1);
    expect(resultat[0]).toMatchObject({ rule: 'R-12', level: 'warning', mode: 'active', params: {} });
  });
});
