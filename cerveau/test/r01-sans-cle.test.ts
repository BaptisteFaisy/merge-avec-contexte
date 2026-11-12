/**
 * R-01 sans aucun ticket, du pont signé à la raison affichée.
 *
 * Défaut trouvé sur le site réel (`docs/PREUVE-REELLE.md` § 4.3) : une PR sans
 * aucun ticket ne renvoyait **aucune** raison. La clé vide annoncée par le
 * Capteur partait vers Jira, la lecture échouait, et l'évaluation tombait en
 * repli — muette, comme si la PR était conforme.
 *
 * Ces tests rejouent le chemin complet : charge utile du Capteur → pont signé →
 * moteur de règles → message. Le lecteur Jira factice refuse toute clé vide,
 * comme le vrai site (HTTP 400).
 */
import { describe, expect, it } from 'vitest';
import { createEvaluateService } from '../src/app/evaluate';
import { horlogeFixe } from '../src/app/horloge';
import { loggerSilencieux } from '../src/app/logger';
import { gererRequetePont } from '../src/bridge/handler';
import type { IssueReader } from '../src/jira/reader';
import { DEMO_NOW } from '../src/seed/dataset';
import { createMemoryStore } from '../src/storage/memory-store';
import { corpsEvaluate, depsPontDeRecette, signerPont } from './recette-fixtures';

/** Clés effectivement demandées à Jira pendant le test. */
const clesInterrogees: string[] = [];

/** Lecteur Jira : une clé vide est refusée, comme sur le site réel. */
const jira: IssueReader = {
  async lire(cle) {
    clesInterrogees.push(cle);
    if (cle.trim().length === 0) throw new Error('lecture du ticket refusée (HTTP 400)');
    return {
      key: cle, id: cle, exists: false, status: '', criteria: [], links: [],
      fixVersions: [], labels: [], components: [], incidentKeys: [],
    };
  },
  async incidentsOuverts() {
    return [];
  },
};

/** Corps de la réponse du pont, tel que le Capteur le reçoit. */
interface CorpsReponse {
  verdict: string;
  message: string;
  reasons: { rule: string; level: string; text: string; action?: string }[];
}

/** Évalue une PR sans aucun ticket par le pont signé, et rend le corps JSON. */
async function evaluerSansTicket(issueKeys: string[], branche: string): Promise<CorpsReponse> {
  clesInterrogees.length = 0;
  const { deps } = await depsPontDeRecette({});
  deps.evaluate = createEvaluateService({
    store: createMemoryStore(),
    jira,
    clock: horlogeFixe(DEMO_NOW),
    logger: loggerSilencieux(),
  });
  const corps = corpsEvaluate({ issueKeys, sourceBranch: branche });
  const reponse = await gererRequetePont(signerPont(corps, { nonce: 'nonce-sans-cle' }), deps);
  expect(reponse.statusCode).toBe(200);
  return JSON.parse(reponse.body) as CorpsReponse;
}

describe('R-01 — une PR sans aucun ticket, de bout en bout', () => {
  it('signale l’absence de ticket quand le Capteur annonce une clé vide', async () => {
    const corps = await evaluerSansTicket([''], 'feature/migration-sans-ticket');
    expect(corps.reasons).toHaveLength(1);
    expect(corps.reasons[0]?.rule).toBe('R-01');
    expect(corps.reasons[0]?.text).toContain('Aucun ticket Jira reconnu');
    expect(corps.reasons[0]?.action).toBe('Nommez la branche ou le titre avec la clé du ticket (ex. PAY-123).');
    expect(corps.reasons[0]?.level).toBe('warning');
  });

  it('n’interroge jamais Jira avec une clé vide', async () => {
    await evaluerSansTicket([''], 'feature/migration-sans-ticket');
    expect(clesInterrogees).toEqual([]);
  });

  it('conclut au lieu de tomber en repli', async () => {
    const corps = await evaluerSansTicket([''], 'feature/migration-sans-ticket');
    expect(corps.verdict).toBe('allowed');
    expect(corps.message).toContain('Aucun ticket Jira reconnu');
  });

  it('signale l’absence de ticket quand aucune clé n’est annoncée', async () => {
    const corps = await evaluerSansTicket([], 'feature/migration-sans-ticket');
    expect(corps.reasons).toHaveLength(1);
    expect(corps.reasons[0]?.rule).toBe('R-01');
    expect(corps.reasons[0]?.text).toContain('Aucun ticket Jira reconnu');
  });
});
