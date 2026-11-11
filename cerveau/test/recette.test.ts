/**
 * Recette §18 : les neuf scénarios du cahier des charges, exécutés sur le jeu
 * de démonstration (`createDemoDataset`) avec une horloge toujours injectée.
 *
 * Les assertions portent sur le message rendu au format imposé du §9, pas
 * seulement sur le verdict. Aucune dépendance Forge, jamais `Date.now()`.
 */
import { describe, expect, it } from 'vitest';
import { DEMO_NOW } from '../src/seed/dataset';
import {
  corpsEvaluate,
  configsEnObservation,
  depsPontDeRecette,
  depsRovoDeRecette,
  evaluerRecette,
  jeuDeRecette,
  NOW_DEROGATION,
  NOW_GEL,
  reponseRecette,
  SECRET_RECETTE,
  signerPont,
  waiverDeuxHeures,
  WORKSPACE_RECETTE,
} from './recette-fixtures';
import { describeWaiver, fallbackEvaluation, toMergeCheckResponse } from '../src/shared';
import { gererRequetePont } from '../src/bridge/handler';
import { createMemoryStore } from '../src/storage/memory-store';
import { runEvaluateMerge } from '../src/rovo/evaluate-merge';
import { vmConsole } from '../src/ui/view-model-console';

const CARTE = 'Détail et dérogation : carte « Merge avec contexte » à droite.';

describe('recette §18', () => {
  it('recette 1 : deux critères non cochés et R-03 bloquant ⇒ bloqué, message citant le ticket et le nombre', () => {
    const { evaluation, reponse } = reponseRecette({ prId: 42 });
    expect(evaluation.verdict).toBe('blocked');
    expect(reponse.success).toBe(false);
    expect(reponse.message).toBe(
      [
        'Bloqué, 2 raisons.',
        '1) PAY-123 : 2 critère(s) d’acceptation non coché(s).',
        '2) Incident INC-52 ouvert sur checkout-api.',
        CARTE,
      ].join('\n'),
    );
    expect(evaluation.reasons.some((raison) => raison.rule === 'R-03' && raison.level === 'blocking')).toBe(true);
  });

  it('recette 2 : gel actif sur main ⇒ toute PR vers main échoue, message nommant le gel et sa fin', () => {
    const dataset = jeuDeRecette(NOW_GEL);
    for (const prId of [42, 43, 44]) {
      const { evaluation, reponse } = reponseRecette({ dataset, prId, now: NOW_GEL });
      expect(evaluation.verdict, `PR ${prId}`).toBe('blocked');
      expect(reponse.success, `PR ${prId}`).toBe(false);
      expect(reponse.message, `PR ${prId}`).toContain('Gel « Black Friday » sur main jusqu’au 30/11 à 11 h.');
      expect(reponse.message, `PR ${prId}`).toMatch(/^Bloqué, \d raison/);
    }
  });

  it('recette 3 : incident ouvert ⇒ la PR échoue, sauf ticket lié à l’incident (correctif autorisé)', () => {
    const bloque = reponseRecette({ prId: 43 });
    expect(bloque.evaluation.verdict).toBe('blocked');
    expect(bloque.reponse.success).toBe(false);
    expect(bloque.reponse.message).toContain('1) Incident INC-52 ouvert sur checkout-api.');

    const correctif = reponseRecette({ prId: 44 });
    expect(correctif.evaluation.verdict).toBe('allowed');
    expect(correctif.reponse.success).toBe(true);
    expect(correctif.reponse.message).toContain('Autorisé, 1 avertissement : Correctif d’incident INC-52 : la fusion reste autorisée.');
  });

  it('recette 4 : dérogation de 2 h accordée ⇒ contrôle passe, trace (qui, pourquoi, jusqu’à quand) lisible', async () => {
    const dataset = jeuDeRecette(NOW_DEROGATION);
    const sansWaiver = reponseRecette({ dataset, prId: 44, now: NOW_DEROGATION });
    expect(sansWaiver.evaluation.verdict).toBe('blocked');
    expect(sansWaiver.reponse.message).toContain('Gel « Fenêtre nocturne » sur main');

    const waiver = waiverDeuxHeures({ prId: 44, requestedAt: '2026-11-27T21:00:00Z' });
    const avecWaiver = reponseRecette({
      dataset,
      prId: 44,
      now: NOW_DEROGATION,
      waivers: [...dataset.waivers, waiver],
    });
    expect(avecWaiver.evaluation.verdict).toBe('allowed');
    expect(avecWaiver.reponse.success).toBe(true);
    expect(avecWaiver.reponse.message).not.toContain('Fenêtre nocturne');

    const trace = describeWaiver(waiver, 'fr');
    expect(trace).toContain('tech-lead');
    expect(trace).toContain('correctif de prix avant l’ouverture');
    expect(trace).toContain('27/11 à 23 h');

    const store = createMemoryStore();
    await store.waivers.create({ ...waiver, issueKeys: ['PAY-140'] });
    const [stockee] = await store.waivers.listByPullRequest('demo-repo-uuid', 44);
    expect(stockee?.grantedBy).toBe('tech-lead');
    expect(stockee?.reason).toBe('correctif de prix avant l’ouverture');
    expect(Date.parse(stockee?.expiresAt ?? '') - Date.parse(stockee?.requestedAt ?? '')).toBe(2 * 3600 * 1000);
  });

  it('recette 5 : Cerveau injoignable ⇒ repli « ouvert » passe avec contexte indisponible, « fermé » bloque', () => {
    const contexte = { cause: 'unreachable' as const, trigger: 'on-code-pushed' as const, now: DEMO_NOW };

    const ouvert = toMergeCheckResponse(fallbackEvaluation({ ...contexte, policy: 'open' }), { locale: 'fr' });
    expect(ouvert.success).toBe(true);
    expect(ouvert.message).toBe(
      ['Contexte indisponible, contrôle non concluant.', 'Politique de repli : ouvert, la fusion reste possible.', CARTE].join('\n'),
    );

    const ferme = toMergeCheckResponse(fallbackEvaluation({ ...contexte, policy: 'closed' }), { locale: 'fr' });
    expect(ferme.success).toBe(false);
    expect(ferme.message).toContain('Contexte indisponible, contrôle non concluant.');
    expect(ferme.message).toContain('Politique de repli : fermé, la fusion est bloquée.');
  });

  it('recette 6 : signature fausse puis horodatage ancien ⇒ rejet 401 explicite, sans fuite', async () => {
    const { deps } = await depsPontDeRecette();
    const body = corpsEvaluate();

    const valide = await gererRequetePont(signerPont(body, { nonce: 'nonce-valide' }), deps);
    expect(valide.statusCode).toBe(200);
    expect(JSON.parse(valide.body).message).toContain('PAY-123');

    const fausse = await gererRequetePont(signerPont(body, { secret: 'mauvais-secret', nonce: 'nonce-fausse' }), deps);
    expect(fausse.statusCode).toBe(401);
    expect(JSON.parse(fausse.body).error).toBe('unauthorized');
    expect(fausse.body).not.toContain('mauvais-secret');
    expect(fausse.body).not.toContain(SECRET_RECETTE);

    const ancien = new Date(Date.parse(DEMO_NOW) - 10 * 60 * 1000).toISOString();
    const perimee = await gererRequetePont(signerPont(body, { nowIso: ancien, nonce: 'nonce-ancien' }), deps);
    expect(perimee.statusCode).toBe(401);
    expect(JSON.parse(perimee.body).error).toBe('unauthorized');
    expect(perimee.body).not.toContain(SECRET_RECETTE);
  });

  it('recette 7 : la console de test rend le même message que le contrôle réel', () => {
    // Le module console existe sur main (`ui/view-model-console.ts`) : pas de chemin équivalent.
    const dataset = jeuDeRecette();
    const evaluation = evaluerRecette({ dataset, prId: 42 });
    const reel = toMergeCheckResponse(evaluation, { locale: 'fr' });
    const vue = vmConsole({
      locale: 'fr',
      ticket: 'PAY-123',
      brancheCible: 'main',
      depot: 'checkout-api',
      depotsDisponibles: ['checkout-api', 'pricing-api'],
      evaluation,
    });
    expect(vue.apercu?.message).toBe(reel.message);
    expect(vue.apercu?.success).toBe(reel.success);
    expect(vue.apercu?.message).toContain('PAY-123 : 2 critère(s) d’acceptation non coché(s).');
    expect(vue.formulaire.complet).toBe(true);
  });

  it('recette 8 : evaluate-merge (MCP/Rovo) rend les mêmes raisons que le contrôle réel', async () => {
    const dataset = jeuDeRecette();
    const reel = reponseRecette({ dataset, prId: 42 });
    const sortie = await runEvaluateMerge(depsRovoDeRecette(dataset), { issueKey: 'pay-123', targetBranch: 'main' });
    expect(sortie.verdict).toBe('blocked');
    expect(sortie.allowed).toBe(false);
    expect(sortie.evaluatedAt).toBe(DEMO_NOW);
    expect(sortie.message).toBe(reel.reponse.message);
    // La PR simulée de l'outil ajoute l'avertissement R-01 (aucune branche ni
    // titre à analyser) : les raisons bloquantes, elles, sont identiques.
    const bloquants = (raisons: { level: string; text: string }[]) =>
      raisons.filter((raison) => raison.level === 'blocking').map((raison) => raison.text);
    expect(bloquants(sortie.reasons)).toEqual(bloquants(reel.evaluation.reasons));
    expect(bloquants(sortie.reasons)).toContain('PAY-123 : 2 critère(s) d’acceptation non coché(s).');
  });

  it('recette 9 : mode observation ⇒ rien dans le message de la PR, évaluation journalisée', async () => {
    const dataset = jeuDeRecette();
    const configs = configsEnObservation(dataset.configs, ['R-03', 'R-05']);
    const evaluation = evaluerRecette({ dataset, prId: 42, configs });
    expect(evaluation.verdict).toBe('allowed');
    expect(evaluation.observedOnly).toBe(true);

    const reponse = toMergeCheckResponse(evaluation, { locale: 'fr' });
    expect(reponse.success).toBe(true);
    expect(reponse.message).toBe(['Autorisé.', CARTE].join('\n'));
    expect(reponse.message).not.toContain('PAY-123');
    expect(reponse.message).not.toContain('INC-52');

    const store = createMemoryStore();
    await store.evaluations.record({
      id: 'eval-recette-9',
      workspaceUuid: WORKSPACE_RECETTE,
      repositoryUuid: 'demo-repo-uuid',
      pullRequestId: 42,
      service: 'checkout-api',
      ...evaluation,
    });
    const derniere = await store.evaluations.latestByPullRequest('demo-repo-uuid', 42);
    expect(derniere?.verdict).toBe('allowed');
    expect(derniere?.evaluatedAt).toBe(DEMO_NOW);
    const blocages = await store.evaluations.observedBlocks('2026-11-01T00:00:00Z');
    expect(blocages.map((bloc) => bloc.rule)).toEqual(['R-03', 'R-05']);
    expect(blocages[0]?.text).toContain('PAY-123');
    expect(blocages[1]?.text).toContain('INC-52');
  });
});
