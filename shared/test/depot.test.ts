/**
 * Composition des règles du dépôt avec celles de l'espace de travail
 * (MC-17, §23 — audit 20) : le dépôt durcit, jamais il n'affaiblit.
 */
import { describe, expect, it, vi } from 'vitest';
import { composerReglesDepot, plusSevere, severityDuNiveau } from '../src/rules/depot';
import type { DepotRule } from '../src/rules/depot';
import type { Level, RuleConfig } from '../src/types';

/** Réglage d'espace de travail minimal. */
function config(rule: RuleConfig['rule'], level: Level, extra: Partial<RuleConfig> = {}): RuleConfig {
  return { rule, level, mode: 'active', scope: {}, params: {}, ...extra };
}

/** Journal qui accumule les messages. */
function journal() {
  const messages: string[] = [];
  return { messages, info: (message: string) => messages.push(message) };
}

describe('sévérité des niveaux', () => {
  it('classe information < warning < blocking', () => {
    expect(severityDuNiveau('information')).toBeLessThan(severityDuNiveau('warning'));
    expect(severityDuNiveau('warning')).toBeLessThan(severityDuNiveau('blocking'));
  });

  it('reconnaît un niveau plus sévère', () => {
    expect(plusSevere('blocking', 'warning')).toBe(true);
    expect(plusSevere('warning', 'blocking')).toBe(false);
    expect(plusSevere('warning', 'warning')).toBe(false);
  });
});

describe('composerReglesDepot', () => {
  it('ne change rien sans règle de dépôt', () => {
    const configs = [config('R-05', 'warning')];
    expect(composerReglesDepot(undefined, configs)).toEqual(configs);
    expect(composerReglesDepot([], configs)).toEqual(configs);
  });

  it('durcit le niveau et resserre la portée sur le dépôt', () => {
    const depot: DepotRule[] = [{ code: 'R-05', level: 'blocking' }];
    const resultat = composerReglesDepot(depot, [config('R-05', 'warning')], {
      repositorySlug: 'checkout-api',
    });
    expect(resultat).toHaveLength(2);
    expect(resultat[0]).toEqual(config('R-05', 'warning'));
    expect(resultat[1]).toMatchObject({
      rule: 'R-05',
      level: 'blocking',
      mode: 'active',
      scope: { repositories: ['checkout-api'] },
    });
  });

  it('ignore un niveau plus permissif et le journalise', () => {
    const log = journal();
    const depot: DepotRule[] = [{ code: 'R-05', level: 'information' }];
    const resultat = composerReglesDepot(depot, [config('R-05', 'blocking')], {
      logger: log,
      repositorySlug: 'checkout-api',
    });
    expect(resultat[1]).toMatchObject({ rule: 'R-05', level: 'blocking' });
    expect(log.messages.join(' ')).toContain('plus permissif');
  });

  it('ignore un mode observation imposé par le dépôt et le journalise', () => {
    const log = journal();
    const depot: DepotRule[] = [{ code: 'R-05', level: 'blocking', mode: 'observe' }];
    const resultat = composerReglesDepot(depot, [config('R-05', 'warning')], {
      logger: log,
      repositorySlug: 'checkout-api',
    });
    expect(resultat[1]).toMatchObject({ mode: 'active' });
    expect(log.messages.join(' ')).toContain('observation');
  });

  it('ignore une règle dont le code est inconnu du catalogue', () => {
    const log = journal();
    const depot = [{ code: 'R-99', level: 'blocking' }] as unknown as DepotRule[];
    const resultat = composerReglesDepot(depot, [config('R-05', 'warning')], { logger: log });
    expect(resultat).toHaveLength(1);
    expect(log.messages.join(' ')).toContain('code inconnu');
  });

  it('ignore une règle absente des réglages de l’espace', () => {
    const log = journal();
    const depot: DepotRule[] = [{ code: 'R-04', level: 'blocking' }];
    const resultat = composerReglesDepot(depot, [config('R-05', 'warning')], { logger: log });
    expect(resultat).toHaveLength(1);
    expect(log.messages.join(' ')).toContain('absente des réglages');
  });

  it('resserre la portée déclarée sur celle de l’espace', () => {
    const espace = [config('R-05', 'warning', { scope: { repositories: ['api-*'] } })];
    const depot: DepotRule[] = [
      { code: 'R-05', level: 'blocking', scope: { repositories: ['api-core'] } },
    ];
    const resultat = composerReglesDepot(depot, espace);
    expect(resultat[1].scope).toEqual({ repositories: ['api-core'] });
  });

  it('ignore une portée disjointe de celle de l’espace', () => {
    const log = journal();
    const espace = [config('R-05', 'warning', { scope: { repositories: ['autre'] } })];
    const depot: DepotRule[] = [
      { code: 'R-05', level: 'blocking', scope: { repositories: ['api-core'] } },
    ];
    const resultat = composerReglesDepot(depot, espace, { logger: log });
    expect(resultat).toHaveLength(1);
    expect(log.messages.join(' ')).toContain('disjointe');
  });

  it('fusionne les paramètres du dépôt par-dessus ceux de l’espace', () => {
    const espace = [config('R-05', 'warning', { params: { jsmProjects: ['OLD'], garde: true } })];
    const depot: DepotRule[] = [
      { code: 'R-05', level: 'blocking', params: { jsmProjects: ['JSM'] } },
    ];
    const resultat = composerReglesDepot(depot, espace, { repositorySlug: 'api' });
    expect(resultat[1].params).toEqual({ jsmProjects: ['JSM'], garde: true });
  });

  it('durcit une règle observée par l’espace en l’activant', () => {
    const espace = [config('R-05', 'warning', { mode: 'observe' })];
    const depot: DepotRule[] = [{ code: 'R-05', level: 'blocking', mode: 'active' }];
    const resultat = composerReglesDepot(depot, espace, { repositorySlug: 'api' });
    expect(resultat[1]).toMatchObject({ mode: 'active', level: 'blocking' });
  });

  it('ne modifie pas les réglages reçus (fonction pure)', () => {
    const espace = [config('R-05', 'warning')];
    const avant = JSON.parse(JSON.stringify(espace));
    const espion = vi.spyOn(espace, 'push');
    composerReglesDepot([{ code: 'R-05', level: 'blocking' }], espace, { repositorySlug: 'api' });
    expect(espace).toEqual(avant);
    expect(espion).not.toHaveBeenCalled();
  });
});
