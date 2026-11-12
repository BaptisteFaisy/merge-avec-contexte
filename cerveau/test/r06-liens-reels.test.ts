/**
 * R-06 sur un lien réel — la preuve du site `one-atlas-cndz.atlassian.net`.
 *
 * Sur un vrai ticket, l'API Jira renvoie :
 * `issuelinks: [{ type: { name: 'Blocks', inward: 'is blocked by', outward:
 * 'blocks' }, inwardIssue: null, outwardIssue: { key: 'MAC-3', fields: {
 * status: { name: 'In Progress' } } } }]`.
 *
 * R-06 restait muette : le réglage mémorisé par le jeu de démonstration
 * (« bloque par ») ne reconnaissait pas le type « Blocks » du site, et la
 * livraison se comparait par nom de statut localisé. Ces tests verrouillent
 * les deux corrections.
 */
import { describe, expect, it } from 'vitest';
import type { IssueContext, PrContext, RuleCode, RuleConfig, RuleInput } from '../src/shared';
import { parseIssue } from '../src/jira/parse';
import { defaultRuleConfigs } from '../src/rules/defaults';
import { ruleFor } from '../src/rules/registry';

const NOW = '2026-11-12T09:00:00Z';

/** Ticket réel de la preuve : MAC-2, bloqué par MAC-3. */
const TICKET_REEL = {
  id: '10100',
  key: 'MAC-2',
  fields: {
    summary: 'Limiter les tentatives de paiement (preuve réelle)',
    status: { name: 'In Progress', id: '3', statusCategory: { key: 'indeterminate' } },
    issuelinks: [
      {
        type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
        inwardIssue: null,
        outwardIssue: { key: 'MAC-3', fields: { status: { name: 'In Progress' } } },
      },
    ],
  },
};

/** PR de référence : la branche porte la clé du ticket. */
function pr(over: Partial<PrContext> = {}): PrContext {
  return {
    workspaceUuid: 'ws-1',
    repositoryUuid: 'repo-uuid',
    repositorySlug: 'checkout-api',
    pullRequestId: 9001,
    title: 'Limiter les tentatives de paiement',
    sourceBranch: 'feature/MAC-2-limite-tentatives',
    targetBranch: 'main',
    commitMessages: [],
    changedPaths: [],
    reviewers: [],
    trigger: 'on-code-pushed',
    ...over,
  };
}

/** Ticket de référence : MAC-2, en cours, sans lien. */
function issue(over: Partial<IssueContext> = {}): IssueContext {
  return {
    key: 'MAC-2',
    id: '10100',
    exists: true,
    status: 'In Progress',
    criteria: [],
    links: [],
    fixVersions: [],
    labels: [],
    components: [],
    incidentKeys: [],
    ...over,
  };
}

/** Réglage mémorisé par le jeu de démonstration (le cas réel de la preuve). */
function configDemo(): RuleConfig {
  return {
    rule: 'R-06',
    level: 'blocking',
    mode: 'active',
    scope: {},
    params: { linkTypes: ['bloque par'] },
  };
}

/** Réglage par défaut du catalogue, paramètres surchargeables. */
function configDefaut(code: RuleCode, params: Record<string, unknown> = {}): RuleConfig {
  const base = defaultRuleConfigs().find((config) => config.rule === code);
  if (!base) throw new Error(`règle absente des défauts : ${code}`);
  return { ...base, params: { ...base.params, ...params } };
}

/** Résultat de la règle demandée sur l'entrée donnée. */
function outcomeOf(
  code: RuleCode,
  over: Partial<RuleInput> = {},
  config: RuleConfig = configDefaut(code),
) {
  const rule = ruleFor(code);
  if (!rule) throw new Error(`règle non enregistrée : ${code}`);
  const input: RuleInput = {
    pr: pr(),
    issues: [issue()],
    freezes: [],
    incidents: [],
    waivers: [],
    config,
    now: NOW,
    locale: 'fr',
    ...over,
  };
  return rule.evaluate(input);
}

describe('lecture du lien réel', () => {
  it('lit la cible du lien et son statut, dans les deux sens', () => {
    const parsed = parseIssue(TICKET_REEL);
    expect(parsed.links).toEqual([
      {
        type: 'Blocks',
        direction: 'outward',
        targetKey: 'MAC-3',
        targetStatus: 'In Progress',
        targetStatusId: undefined,
        targetStatusCategory: undefined,
      },
    ]);
  });

  it('lit la catégorie et l’identifiant du statut du ticket', () => {
    const parsed = parseIssue(TICKET_REEL);
    expect(parsed.statusId).toBe('3');
    expect(parsed.statusCategory).toBe('inProgress');
  });

  it('lit la catégorie du statut de la cible quand Jira la donne', () => {
    const avecCategorie = {
      ...TICKET_REEL,
      fields: {
        ...TICKET_REEL.fields,
        issuelinks: [
          {
            type: { name: 'Blocks' },
            inwardIssue: null,
            outwardIssue: {
              key: 'MAC-3',
              fields: { status: { name: 'Terminé', id: '10001', statusCategory: { key: 'done' } } },
            },
          },
        ],
      },
    };
    expect(parseIssue(avecCategorie).links[0]).toMatchObject({
      targetStatus: 'Terminé',
      targetStatusId: '10001',
      targetStatusCategory: 'done',
    });
  });
});

describe('R-06 — le ticket n’est pas bloqué par un ticket ouvert', () => {
  it('bloque sur le lien « Blocks » réel, même avec le réglage mémorisé du jeu', () => {
    const parsed = parseIssue(TICKET_REEL);
    const outcome = outcomeOf('R-06', { issues: [parsed] }, configDemo());
    expect(outcome.status).toBe('fail');
    expect(outcome.reasons[0]?.text).toBe('MAC-2 est bloqué par MAC-3 (In Progress).');
  });

  it('bloque sur le lien « Blocks » réel avec le réglage par défaut', () => {
    const parsed = parseIssue(TICKET_REEL);
    expect(outcomeOf('R-06', { issues: [parsed] }).status).toBe('fail');
  });

  it('ne signale pas un ticket qui en bloque un autre', () => {
    // Lien miroir : MAC-3 bloque MAC-2. Lu depuis MAC-3, la cible est du côté
    // « inward » — ce n'est donc pas MAC-3 qui est bloqué, et la règle passe.
    const parsed = parseIssue(TICKET_REEL);
    const miroir = {
      ...parsed,
      key: 'MAC-3',
      links: [{ ...parsed.links[0], direction: 'inward' as const }],
    };
    expect(outcomeOf('R-06', { issues: [miroir] }).status).toBe('pass');
  });

  it('passe quand la cible du lien est livrée', () => {
    const parsed = parseIssue(TICKET_REEL);
    const livre = {
      ...parsed,
      links: [{ ...parsed.links[0], targetStatus: 'Done' }],
    };
    expect(outcomeOf('R-06', { issues: [livre] }).status).toBe('pass');
  });

  it('ignore un lien d’un autre type', () => {
    const parsed = parseIssue(TICKET_REEL);
    const autre = {
      ...parsed,
      links: [{ ...parsed.links[0], type: 'Relates to' }],
    };
    expect(outcomeOf('R-06', { issues: [autre] }).status).toBe('pass');
  });

  it('traite pareillement un statut de cible nommé dans une autre langue', () => {
    const parsed = parseIssue(TICKET_REEL);
    const francais = {
      ...parsed,
      links: [{ ...parsed.links[0], targetStatus: 'En cours' }],
    };
    const anglais = outcomeOf('R-06', { issues: [parsed] });
    const traduit = outcomeOf('R-06', { issues: [francais] });
    expect(traduit.status).toBe(anglais.status);
    expect(traduit.status).toBe('fail');
  });

  it('reconnaît une cible livrée par sa catégorie, quelle que soit la langue', () => {
    const parsed = parseIssue(TICKET_REEL);
    const livre = {
      ...parsed,
      links: [
        {
          ...parsed.links[0],
          targetStatus: 'Terminé',
          targetStatusId: '10001',
          targetStatusCategory: 'done' as const,
        },
      ],
    };
    const configAnglaise = configDefaut('R-06', { deliveredStatuses: ['Done', 'Closed'] });
    expect(outcomeOf('R-06', { issues: [livre] }, configAnglaise).status).toBe('pass');
  });
});

describe('R-13 — les dépendances amont sont livrées', () => {
  it('ne confond pas un lien bloquant avec une dépendance', () => {
    const parsed = parseIssue(TICKET_REEL);
    expect(outcomeOf('R-13', { issues: [parsed] }).status).toBe('pass');
  });

  it('attend une dépendance non livrée', () => {
    const parsed = parseIssue(TICKET_REEL);
    const dependance = {
      ...parsed,
      links: [{ ...parsed.links[0], type: 'Depends on' }],
    };
    expect(outcomeOf('R-13', { issues: [dependance] }).status).toBe('fail');
  });
});

describe('R-02 — le statut du ticket se compare par catégorie', () => {
  it('accepte un statut désigné par sa catégorie Jira', () => {
    const config = configDefaut('R-02', { allowedStatuses: ['indeterminate'] });
    expect(outcomeOf('R-02', { issues: [issue({ status: 'En cours', statusCategory: 'inProgress' })] }, config).status)
      .toBe('pass');
  });

  it('accepte toujours un statut nommé dans la liste réglée', () => {
    expect(outcomeOf('R-02', { issues: [issue({ status: 'In Progress' })] }).status).toBe('pass');
  });
});
