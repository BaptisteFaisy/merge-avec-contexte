/**
 * Contrat entre les deux apps (§AUDIT 65) : la forme renvoyée par la route
 * `card` du Cerveau (`CardDetail`) doit être exactement celle que consomme le
 * Capteur (`CorpsCarte`). Ce contrat a déjà dérivé une fois et cassé la carte.
 *
 * Le test construit un `CardDetail` réel via `routeCard` (pont signé → moteur),
 * le sérialise en JSON (comme sur le réseau), le fait traduire par les fonctions
 * du Capteur (`evaluationDepuisCarte`, `issuesDepuisCarte`, `configsDepuisCarte`)
 * puis vérifier le modèle de vue `vmCarte` résultant. Aucune plateforme, horloge
 * injectée (jeu de démonstration), aucun réseau.
 */
import { describe, expect, it } from 'vitest';
import { routeCard } from '../src/bridge/routes';
import { corpsEvaluate, depsPontDeRecette } from './recette-fixtures';
import {
  configsDepuisCarte,
  evaluationDepuisCarte,
  issuesDepuisCarte,
  type CorpsCarte,
} from '../../capteur/src/app/resolvers';
import { vmCarte } from '../../capteur/src/ui/view-models';

describe('contrat CardDetail (Cerveau) ↔ CorpsCarte (Capteur) — §AUDIT 65', () => {
  it('la route `card` produit exactement la forme que le Capteur traduit', async () => {
    const { deps } = await depsPontDeRecette({});
    const payload = (JSON.parse(corpsEvaluate()) as { payload: unknown }).payload;

    const reponse = await routeCard(payload, deps);
    expect(reponse.statusCode).toBe(200);

    // Aller-retour JSON : ce qui traverse réellement le pont signé.
    const detail = JSON.parse(JSON.stringify(JSON.parse(reponse.body))) as CorpsCarte;

    expect(detail).toMatchObject({
      verdict: 'blocked',
      message: expect.any(String),
      reasons: expect.any(Array),
      issueKeys: ['PAY-123'],
      evaluatedAt: expect.any(String),
      durationMs: expect.any(Number),
      siteUrl: expect.any(String),
      rules: expect.any(Array),
      waivers: expect.any(Array),
    });

    const evaluation = evaluationDepuisCarte(detail, 'on-code-pushed');
    expect(evaluation.verdict).toBe('blocked');
    expect(evaluation.issueKeys).toEqual(['PAY-123']);
    expect(evaluation.reasons.length).toBeGreaterThan(0);

    const issues = issuesDepuisCarte(detail);
    expect(issues[0]?.key).toBe('PAY-123');
    expect(issues[0]?.url).toContain('/browse/PAY-123');

    const configs = configsDepuisCarte(detail);
    expect(configs.length).toBeGreaterThan(0);
    expect(configs[0]).toMatchObject({
      rule: expect.any(String),
      level: expect.any(String),
      mode: expect.any(String),
    });
  });

  it('le modèle de vue du Capteur reconstruit le verdict et le ticket depuis le détail', async () => {
    const { deps } = await depsPontDeRecette({});
    const payload = (JSON.parse(corpsEvaluate()) as { payload: unknown }).payload;
    const reponse = await routeCard(payload, deps);
    const detail = JSON.parse(reponse.body) as CorpsCarte;

    const vm = vmCarte({
      evaluation: evaluationDepuisCarte(detail, 'on-code-pushed'),
      issues: issuesDepuisCarte(detail),
      jumelage: { jumele: true, site: detail.siteUrl },
    });

    expect(vm.verdict).toBe('bloque');
    expect(vm.verdictTexte).toBe('Bloqué');
    expect(vm.ticket.reconnu).toBe(true);
    expect(vm.ticket.cles).toEqual(['PAY-123']);
    expect(vm.raisons.length).toBeGreaterThan(0);
    expect(vm.message).toContain('Bloqué');
  });
});