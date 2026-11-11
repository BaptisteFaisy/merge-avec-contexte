/**
 * Tests du handler du pont signé (§13.3).
 *
 * Le handler ne lève jamais : chaque cas vérifie le statut HTTP et le code
 * d'erreur rendu, jamais une exception.
 */
import { describe, expect, it } from 'vitest';
import { createMemoryNonceStore, signRequest, type PairingOffer, type Waiver } from '../src/shared';
import { gererRequetePont, type BridgeRequest } from '../src/bridge/handler';
import type {
  BridgeDeps,
  EvaluationInput,
  Logger,
  PairingRecord,
} from '../src/bridge/deps';

const MAINTENANT = '2026-11-11T10:00:00.000Z';
const SECRET = 'secret-de-test';
const WORKSPACE = 'ws-1';

/** Journal muet : les tests n'écrivent rien sur la sortie. */
const logger: Logger = {
  info: () => undefined,
  error: () => undefined,
};

/** Dépôt de jumelages en mémoire, écrit ici plutôt que dans `storage/`. */
class PairingMemoire {
  readonly offers = new Map<string, PairingOffer>();
  readonly records = new Map<string, PairingRecord>();

  async saveOffer(offer: PairingOffer): Promise<void> {
    this.offers.set(offer.code, offer);
  }

  async findOffer(code: string): Promise<PairingOffer | undefined> {
    return this.offers.get(code);
  }

  async markOfferUsed(code: string): Promise<void> {
    const offre = this.offers.get(code);
    if (offre) this.offers.set(code, { ...offre, used: true });
  }

  async savePairing(pairing: PairingRecord): Promise<void> {
    this.records.set(pairing.workspaceUuid, pairing);
  }

  async pairingForWorkspace(workspaceUuid: string): Promise<PairingRecord | undefined> {
    return this.records.get(workspaceUuid);
  }

  async pairings(): Promise<PairingRecord[]> {
    return [...this.records.values()];
  }

  async fallbackPolicy(): Promise<'open' | 'closed'> {
    return 'open';
  }
}

/** Évaluation factice : bloquée, avec une raison de niveau `blocking`. */
const evaluationFactice = {
  verdict: 'blocked' as const,
  reasons: [
    {
      rule: 'R-02' as const,
      level: 'blocking' as const,
      text: 'Le ticket PROJ-1 est dans un statut interdit.',
    },
  ],
  issueKeys: ['PROJ-1'],
  trigger: 'on-code-pushed' as const,
  evaluatedAt: MAINTENANT,
  durationMs: 12,
};

/** Dépendances de test ; le service d'évaluation est doublé. */
function deps(evaluate: BridgeDeps['evaluate'] = async () => evaluationFactice): BridgeDeps {
  return {
    pairing: new PairingMemoire(),
    context: {
      rules: async () => [],
      serviceForRepository: async () => 'service-1',
      freezes: async () => [],
    },
    waivers: {
      demander: async () => { throw new Error('inutilisé'); },
      decider: async () => { throw new Error('inutilisé'); },
      lister: async () => [],
    },
    nonces: createMemoryNonceStore(() => Date.parse(MAINTENANT)),
    evaluate,
    clock: () => MAINTENANT,
    logger,
    config: {
      bridgeUrl: 'https://pont.exemple.test',
      version: '0.1.0',
      siteUrl: 'https://jira.exemple.test',
      adminAccountId: 'admin-1',
      locale: 'fr',
    },
  };
}

/** Dépendances avec un jumelage actif pour `WORKSPACE`. */
async function depsJumele(evaluate?: BridgeDeps['evaluate']): Promise<BridgeDeps> {
  const base = deps(evaluate);
  await base.pairing.savePairing({
    workspaceUuid: WORKSPACE,
    secret: SECRET,
    siteUrl: 'https://jira.exemple.test',
    pairedAt: MAINTENANT,
  });
  return base;
}

/** Corps d'une demande d'évaluation. */
const corpsEvaluation = JSON.stringify({
  route: 'evaluate',
  payload: {
    workspaceUuid: WORKSPACE,
    repositoryUuid: 'repo-1',
    pullRequestId: 42,
    trigger: 'on-code-pushed',
    issueKeys: ['PROJ-1'],
    sourceBranch: 'feature/proj-1',
    targetBranch: 'main',
  },
});

/** Signe un corps avec le secret partagé. */
function signer(body: string, secret = SECRET, nonce = 'nonce-1'): BridgeRequest {
  const signe = signRequest({
    secret,
    body,
    now: () => Date.parse(MAINTENANT),
    nonceGenerator: () => nonce,
  });
  return { body: signe.body, headers: signe.headers };
}

describe('handler du pont', () => {
  it('répond à health sans signature', async () => {
    const reponse = await gererRequetePont(
      { body: JSON.stringify({ route: 'health', payload: {} }), headers: {} },
      deps(),
    );
    expect(reponse.statusCode).toBe(200);
    expect(JSON.parse(reponse.body).status).toBe('ok');
    expect(reponse.headers['content-type']).toBe('application/json');
  });

  it('renvoie la version et la date sur health', async () => {
    const reponse = await gererRequetePont(
      { body: JSON.stringify({ route: 'health', payload: {} }), headers: {} },
      deps(),
    );
    const corps = JSON.parse(reponse.body);
    expect(corps.version).toBe('0.1.0');
    expect(corps.date).toBe(MAINTENANT);
  });

  it('accepte une demande d\'évaluation signée et rend le verdict', async () => {
    const reponse = await gererRequetePont(signer(corpsEvaluation), await depsJumele());
    expect(reponse.statusCode).toBe(200);
    const corps = JSON.parse(reponse.body);
    expect(corps.verdict).toBe('blocked');
    expect(corps.reasons).toHaveLength(1);
    expect(corps.durationMs).toBe(12);
  });

  it('rend le message au format imposé', async () => {
    const reponse = await gererRequetePont(signer(corpsEvaluation), await depsJumele());
    const corps = JSON.parse(reponse.body);
    expect(corps.message).toContain('Bloqué, 1 raison.');
    expect(corps.message).toContain('1) Le ticket PROJ-1 est dans un statut interdit.');
  });

  it('refuse une signature fausse en 401 unauthorized', async () => {
    const reponse = await gererRequetePont(
      signer(corpsEvaluation, 'mauvais-secret'),
      await depsJumele(),
    );
    expect(reponse.statusCode).toBe(401);
    expect(JSON.parse(reponse.body).error).toBe('unauthorized');
  });

  it('refuse une requête horodatée trop ancienne en 401', async () => {
    const ancien = Date.parse(MAINTENANT) - 10 * 60 * 1000;
    const signe = signRequest({
      secret: SECRET,
      body: corpsEvaluation,
      now: () => ancien,
      nonceGenerator: () => 'nonce-ancien',
    });
    const reponse = await gererRequetePont(
      { body: signe.body, headers: signe.headers },
      await depsJumele(),
    );
    expect(reponse.statusCode).toBe(401);
    expect(JSON.parse(reponse.body).error).toBe('unauthorized');
  });

  it('refuse le rejeu d\'une requête signée en 401', async () => {
    const base = await depsJumele();
    const requete = signer(corpsEvaluation, SECRET, 'nonce-rejoue');
    const premier = await gererRequetePont(requete, base);
    const second = await gererRequetePont(requete, base);
    expect(premier.statusCode).toBe(200);
    expect(second.statusCode).toBe(401);
    expect(JSON.parse(second.body).error).toBe('unauthorized');
  });

  it('refuse un corps illisible en 400 bad-payload', async () => {
    const reponse = await gererRequetePont(
      { body: 'ceci n\'est pas du json', headers: {} },
      deps(),
    );
    expect(reponse.statusCode).toBe(400);
    expect(JSON.parse(reponse.body).error).toBe('bad-payload');
  });

  it('refuse une route inconnue en 404 unknown-route', async () => {
    const reponse = await gererRequetePont(
      { body: JSON.stringify({ route: 'inconnue', payload: {} }), headers: {} },
      deps(),
    );
    expect(reponse.statusCode).toBe(404);
    expect(JSON.parse(reponse.body).error).toBe('unknown-route');
  });

  it('transforme une exception du service en 500 internal sans fuite', async () => {
    const base = await depsJumele(async () => {
      throw new Error('secret interne du moteur');
    });
    const reponse = await gererRequetePont(signer(corpsEvaluation), base);
    expect(reponse.statusCode).toBe(500);
    expect(JSON.parse(reponse.body).error).toBe('internal');
    expect(reponse.body).not.toContain('secret interne du moteur');
  });

  it('refuse un espace de travail non jumelé en unpaired', async () => {
    const base = deps();
    await base.pairing.savePairing({
      workspaceUuid: 'ws-autre',
      secret: SECRET,
      siteUrl: 'https://jira.exemple.test',
      pairedAt: MAINTENANT,
    });
    const reponse = await gererRequetePont(signer(corpsEvaluation), base);
    expect(reponse.statusCode).toBe(401);
    expect(JSON.parse(reponse.body).error).toBe('unpaired');
  });

  it('passe au service une entrée contenant les clés et le site', async () => {
    let recu: EvaluationInput | undefined;
    const base = await depsJumele(async (input) => {
      recu = input;
      return evaluationFactice;
    });
    await gererRequetePont(signer(corpsEvaluation), base);
    expect(recu?.issueKeys).toEqual(['PROJ-1']);
    expect(recu?.siteUrl).toBe('https://jira.exemple.test');
    expect(recu?.pr.pullRequestId).toBe(42);
  });
});

/** Dérogation rattachée à un ticket, comme enregistrée depuis Jira ou Rovo. */
const derogationParTicket: Waiver = {
  id: 'w-ticket',
  prId: 0,
  repositoryUuid: '',
  rule: 'R-04',
  requestedBy: 'lea',
  grantedBy: 'tech-lead',
  reason: 'correctif urgent pendant le gel',
  requestedAt: '2026-11-11T09:00:00Z',
  expiresAt: '2026-11-11T12:00:00Z',
  status: 'granted',
  issueKeys: ['PROJ-1'],
};

/** Double du port qui rend `parTicket` sur un listage sans filtre. */
function listeurAvec(parPr: Waiver[] = []): BridgeDeps['waivers']['lister'] {
  return async (filtre) => {
    if (filtre.prId === undefined || filtre.repositoryUuid === undefined) return [derogationParTicket];
    return filtre.prId === 42 && filtre.repositoryUuid === 'repo-1' ? parPr : [];
  };
}

describe('chargement des dérogations par PR et par ticket', () => {
  it('rattache à la PR une dérogation demandée depuis son ticket', async () => {
    let recu: EvaluationInput | undefined;
    const base = await depsJumele(async (input) => {
      recu = input;
      return evaluationFactice;
    });
    base.waivers.lister = listeurAvec();
    const reponse = await gererRequetePont(signer(corpsEvaluation), base);
    expect(reponse.statusCode).toBe(200);
    expect(recu?.waivers).toHaveLength(1);
    expect(recu?.waivers[0]?.id).toBe('w-ticket');
    expect(recu?.waivers[0]?.prId).toBe(42);
    expect(recu?.waivers[0]?.repositoryUuid).toBe('repo-1');
    expect(recu?.waivers[0]?.issueKeys).toEqual(['PROJ-1']);
  });

  it('continue de charger les dérogations enregistrées pour la PR', async () => {
    let recu: EvaluationInput | undefined;
    const base = await depsJumele(async (input) => {
      recu = input;
      return evaluationFactice;
    });
    const parPr: Waiver = { ...derogationParTicket, id: 'w-pr', prId: 42, repositoryUuid: 'repo-1', issueKeys: [] };
    base.waivers.lister = listeurAvec([parPr]);
    await gererRequetePont(signer(corpsEvaluation), base);
    expect(recu?.waivers.map((waiver) => waiver.id)).toEqual(['w-ticket', 'w-pr']);
    expect(recu?.waivers[1]).toEqual(parPr);
  });

  it('ignore une dérogation rattachée à un autre ticket', async () => {
    let recu: EvaluationInput | undefined;
    const base = await depsJumele(async (input) => {
      recu = input;
      return evaluationFactice;
    });
    base.waivers.lister = async (filtre) =>
      (filtre.prId === undefined ? [{ ...derogationParTicket, issueKeys: ['AUTRE-9'] }] : []);
    await gererRequetePont(signer(corpsEvaluation), base);
    expect(recu?.waivers).toEqual([]);
  });
});
