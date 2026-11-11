/**
 * Le chargeur du jeu de démonstration (§20, niveau 1) : les juges cliquent un
 * bouton et la console de test, l'agent Rovo et les outils MCP ont de la
 * matière. Idempotent, et vérifié ici de bout en bout jusqu'au verdict.
 */
import { describe, expect, it } from 'vitest';
import { chargerJeuDeDemo } from '../src/seed/loader';
import { createMemoryStore } from '../src/storage/memory-store';
import { evaluateAll } from '../src/rules/engine';
import { reglesEffectives } from '../src/app/context-repo';
import { formatEvaluation } from '../src/shared';

const NOW = '2026-11-27T16:30:00Z';
const PROJET = 'DEMO';

describe('chargeur du jeu de démonstration', () => {
  it('écrit les six familles de données et rend leur compte', async () => {
    const store = createMemoryStore();
    const resume = await chargerJeuDeDemo(store, { projectId: PROJET, now: NOW });
    expect(resume).toEqual({ tickets: 8, gels: 3, incidents: 1, correspondances: 2, derogations: 2, regles: 9 });

    expect(await store.issueCache.read('PAY-123')).toBeDefined();
    expect(await store.issueCache.read('PAY-132')).toBeDefined();
    expect((await store.freezes.list()).map((g) => g.name)).toContain('Black Friday');
    expect((await store.freezes.list()).map((g) => g.name)).toContain('Fenêtre release');
    expect(await store.incidents.listOpen('checkout-api')).toHaveLength(1);
    expect(await store.ruleConfig.listByProject(PROJET)).toHaveLength(9);
  });

  it('est idempotent : deux chargements ne dupliquent rien', async () => {
    const store = createMemoryStore();
    await chargerJeuDeDemo(store, { projectId: PROJET, now: NOW });
    await chargerJeuDeDemo(store, { projectId: PROJET, now: NOW });
    expect(await store.freezes.list()).toHaveLength(3);
    expect(await store.ruleConfig.listByProject(PROJET)).toHaveLength(9);
  });

  it('rend la correspondance dépôt → service lisible', async () => {
    const store = createMemoryStore();
    await chargerJeuDeDemo(store, { projectId: PROJET, now: NOW, workspaceUuid: 'ws-juges' });
    const ligne = await store.repoService.find('ws-juges', 'checkout-api');
    expect(ligne?.service).toBe('checkout-api');
  });

  it('bloque PAY-123 dès le jeu chargé, avec le message du §9', async () => {
    const store = createMemoryStore();
    await chargerJeuDeDemo(store, { projectId: PROJET, now: NOW });
    const ticket = (await store.issueCache.read('PAY-123'))?.issue;
    const configs = await reglesEffectives(store, PROJET);
    expect(ticket).toBeDefined();

    const evaluation = evaluateAll({
      pr: {
        workspaceUuid: 'ws-juges',
        repositoryUuid: 'checkout-api',
        repositorySlug: 'checkout-api',
        pullRequestId: 42,
        title: 'PAY-123 : limiter les tentatives',
        sourceBranch: 'feature/PAY-123-limite',
        targetBranch: 'main',
        commitMessages: ['PAY-123 : ajoute le compteur'],
        changedPaths: ['src/limites.ts'],
        reviewers: [],
        trigger: 'on-code-pushed',
      },
      issues: [ticket!],
      freezes: await store.freezes.list(),
      incidents: await store.incidents.listOpen('checkout-api'),
      waivers: [],
      service: 'checkout-api',
      configs,
      now: NOW,
      locale: 'fr',
    });

    expect(evaluation.verdict).toBe('blocked');
    const message = formatEvaluation(evaluation);
    expect(message).toContain('Bloqué');
    expect(message).toContain('PAY-123');
    expect(message).toContain('critère');
  });
});
