/**
 * Recette §18 par le chemin complet (§AUDIT 69) : pont signé → moteur → message.
 *
 * `recette.test.ts` vérifie les neuf scénarios au niveau du moteur ; celui-ci
 * rejoue les scénarios d'évaluation représentatifs (bloqué, gel actif, mode
 * observation) à travers le **pont signé** (`gererRequetePont`, route `evaluate`)
 * et asserte que le message rendu est identique à celui du moteur. C'est
 * l'invariant anti-dérive : le pont ne doit jamais altérer le message du §9.
 *
 * Aucune plateforme, aucun réseau, horloge toujours injectée (jeu de démo).
 */
import { describe, expect, it } from 'vitest';
import { gererRequetePont } from '../src/bridge/handler';
import { formatEvaluation } from '../src/shared';
import type { BridgeDeps } from '../src/bridge/deps';
import {
  configsEnObservation,
  corpsEvaluate,
  depsPontDeRecette,
  evaluerRecette,
  jeuDeRecette,
  NOW_GEL,
  signerPont,
} from './recette-fixtures';

/** Évalue la PR #42 via le pont signé et rend le corps JSON de la réponse. */
async function evaluerViaPont(deps: BridgeDeps, nonce: string, nowIso?: string): Promise<Record<string, unknown>> {
  const reponse = await gererRequetePont(signerPont(corpsEvaluate(), { nonce, nowIso }), deps);
  expect(reponse.statusCode).toBe(200);
  return JSON.parse(reponse.body) as Record<string, unknown>;
}

describe('recette §18 par le chemin complet (pont signé → moteur → message)', () => {
  it('scénario 1 : PR bloquée — le message du pont est identique à celui du moteur', async () => {
    const { deps } = await depsPontDeRecette({});
    const corps = await evaluerViaPont(deps, 'nonce-chemin-1');
    const moteur = evaluerRecette({ prId: 42 });

    expect(corps.verdict).toBe('blocked');
    expect(corps.issueKeys).toEqual(['PAY-123']);
    expect(corps.message).toBe(formatEvaluation(moteur, { locale: 'fr' }));
    expect(String(corps.message)).toContain('PAY-123');
  });

  it('scénario 2 : gel actif — le pont bloque et rend le même message que le moteur', async () => {
    const dataset = jeuDeRecette(NOW_GEL);
    const gel = dataset.freezes.find((entree) => entree.name === 'Black Friday');
    expect(gel).toBeDefined();
    const pendant = new Date(Date.parse(gel!.startsAt) + 60 * 60 * 1000).toISOString();

    const { deps } = await depsPontDeRecette({ dataset, now: pendant });
    const corps = await evaluerViaPont(deps, 'nonce-chemin-2', pendant);
    const moteur = evaluerRecette({ dataset, prId: 42, now: pendant });

    expect(corps.verdict).toBe('blocked');
    expect(corps.message).toBe(formatEvaluation(moteur, { locale: 'fr' }));
    expect(moteur.reasons.some((raison) => raison.text.includes('Black Friday'))).toBe(true);
  });

  it('scénario 9 : mode observation — le pont autorise et rend le même message que le moteur', async () => {
    const dataset = jeuDeRecette();
    const configs = configsEnObservation(dataset.configs, ['R-03', 'R-05']);
    const { deps } = await depsPontDeRecette({ dataset: { ...dataset, configs } });
    const corps = await evaluerViaPont(deps, 'nonce-chemin-9');
    const moteur = evaluerRecette({ prId: 42, configs });

    expect(corps.verdict).toBe('allowed');
    expect(corps.message).toBe(formatEvaluation(moteur, { locale: 'fr' }));
    expect(String(corps.message)).not.toContain('PAY-123');
  });
});