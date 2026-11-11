/**
 * Tests de la sécurité du pont signé.
 *
 * Couvrent les items de l'audit qui durcissent le pont : limite de débit (10),
 * anti-rejeu persistant et purge des nonces (26), liaison de l'espace annoncé
 * au secret qui a validé la signature (46), identités déclarées et habilitation
 * du décideur (47, 48), journal d'audit des dérogations (50) et séparation
 * `health` publique / `diagnostic` signée (51).
 *
 * Aucune heure réelle : l'horloge est injectée, les nonces aussi.
 */
import { describe, expect, it } from 'vitest';
import {
  signRequest,
  type Waiver,
  type WaiverAuditEntry,
  type WaiverDecisionPayload,
  type WaiverRequestPayload,
} from '../src/shared';
import type { BridgeDeps, Logger, PairingRecord } from '../src/bridge/deps';
import { gererRequetePont, type BridgeRequest } from '../src/bridge/handler';
import { creerLimiteurDebit, retryAfterSecondes } from '../src/bridge/limite-debit';
import { creerPurgeurNonces } from '../src/bridge/purge-nonces';
import { createMemoryStore } from '../src/storage/memory-store';

const MAINTENANT = '2026-11-11T10:00:00.000Z';
const T0 = Date.parse(MAINTENANT);
const WS1 = 'ws-un';
const WS2 = 'ws-deux';
const SECRET_1 = 'secret-espace-un';
const SECRET_2 = 'secret-espace-deux';

/** Journal qui retient les lignes : les tests relisent ce qui a été tracé. */
class Journal implements Logger {
  readonly infos: string[] = [];
  readonly contextes: Array<Record<string, unknown> | undefined> = [];
  readonly erreurs: string[] = [];

  info(message: string, contexte?: Record<string, unknown>): void {
    this.infos.push(message);
    this.contextes.push(contexte);
  }

  error(message: string): void {
    this.erreurs.push(message);
  }
}

/** Dépôt de jumelages en mémoire : plusieurs espaces peuvent coexister. */
class PairingMemoire {
  readonly records = new Map<string, PairingRecord>();
  casse = false;

  async saveOffer(): Promise<void> {
    throw new Error('inutilisé dans ces tests');
  }

  async findOffer(): Promise<undefined> {
    return undefined;
  }

  async markOfferUsed(): Promise<void> {
    throw new Error('inutilisé dans ces tests');
  }

  async savePairing(pairing: PairingRecord): Promise<void> {
    this.records.set(pairing.workspaceUuid, pairing);
  }

  async pairingForWorkspace(workspaceUuid: string): Promise<PairingRecord | undefined> {
    return this.records.get(workspaceUuid);
  }

  async pairings(): Promise<PairingRecord[]> {
    if (this.casse) throw new Error('base injoignable');
    return [...this.records.values()];
  }

  async fallbackPolicy(): Promise<'open' | 'closed'> {
    return 'open';
  }
}

/** Double du journal d'audit : retient les lignes, sait tomber en panne. */
class AuditTest {
  readonly lignes: WaiverAuditEntry[] = [];
  enPanne = false;

  async record(entree: WaiverAuditEntry): Promise<void> {
    if (this.enPanne) throw new Error('journal injoignable');
    this.lignes.push(entree);
  }
}

/** Double du service de dérogations : rend une dérogation cohérente. */
function waiversDouble() {
  const appels: string[] = [];
  const base = (rule: Waiver['rule']): Waiver => ({
    id: 'w-1', prId: 42, repositoryUuid: 'repo-1', rule,
    reason: 'correctif urgent avant l’ouverture', requestedAt: MAINTENANT, requestedBy: 'lea',
    status: 'requested', issueKeys: [],
  });
  return {
    appels,
    async demander(demande: WaiverRequestPayload): Promise<Waiver> {
      appels.push('demander');
      return { ...base(demande.rule), prId: demande.prId, requestedBy: demande.requestedBy };
    },
    async decider(decision: WaiverDecisionPayload): Promise<Waiver> {
      appels.push('decider');
      return { ...base('R-03'), id: decision.waiverId, status: decision.decision, grantedBy: decision.decidedBy };
    },
    async lister(): Promise<Waiver[]> {
      return [];
    },
  };
}

/** Dépendances de test et leurs doublures accessibles. */
interface Banc {
  deps: BridgeDeps;
  pairing: PairingMemoire;
  journal: Journal;
  audit: AuditTest;
  waivers: ReturnType<typeof waiversDouble>;
}

/** Options du banc : bornes de débit, approbateurs, horloge, ports absents. */
interface OptionsBanc {
  limite?: BridgeDeps['limite'];
  approbateurs?: string[];
  purge?: BridgeDeps['purgeNonces'];
  clock?: () => string;
  sansAudit?: boolean;
  nonces?: BridgeDeps['nonces'];
}

/** Assemble un banc : deux espaces jumelés par défaut. */
async function banc(options: OptionsBanc = {}): Promise<Banc> {
  const maintenant = () => Date.parse((options.clock ?? (() => MAINTENANT))());
  const pairing = new PairingMemoire();
  await pairing.savePairing({ workspaceUuid: WS1, secret: SECRET_1, siteUrl: 'https://jira.test', pairedAt: MAINTENANT });
  await pairing.savePairing({ workspaceUuid: WS2, secret: SECRET_2, siteUrl: 'https://jira.test', pairedAt: MAINTENANT });
  const journal = new Journal();
  const audit = new AuditTest();
  const waivers = waiversDouble();
  const deps: BridgeDeps = {
    pairing,
    context: { rules: async () => [], serviceForRepository: async () => 'service-1', freezes: async () => [] },
    waivers,
    nonces: options.nonces ?? createMemoryStore({ clock: maintenant }).nonces,
    evaluate: async () => ({
      verdict: 'allowed', reasons: [], issueKeys: [], trigger: 'on-code-pushed',
      evaluatedAt: MAINTENANT, durationMs: 5,
    }),
    clock: options.clock ?? (() => MAINTENANT),
    logger: journal,
    config: {
      bridgeUrl: 'https://pont.test', version: '0.1.0', siteUrl: 'https://jira.test',
      adminAccountId: 'admin-1', locale: 'fr',
    },
    limite: options.limite,
    purgeNonces: options.purge,
    audit: options.sansAudit ? undefined : audit,
    approbateurs: options.approbateurs === undefined ? undefined : async () => options.approbateurs ?? [],
  };
  return { deps, pairing, journal, audit, waivers };
}

let compteur = 0;

/** Requête signée, avec un nonce distinct à chaque appel. */
function signer(body: string, secret: string, now = T0): BridgeRequest {
  compteur += 1;
  const signe = signRequest({ secret, body, now: () => now, nonceGenerator: () => `nonce-${compteur}` });
  return { body: signe.body, headers: signe.headers };
}

/** Corps d'une demande d'évaluation pour un espace de travail. */
const corpsEvaluation = (workspaceUuid: string): string => JSON.stringify({
  route: 'evaluate',
  payload: {
    workspaceUuid, repositoryUuid: 'repo-1', pullRequestId: 42, trigger: 'on-code-pushed',
    issueKeys: ['PROJ-1'], sourceBranch: 'feature/proj-1', targetBranch: 'main',
  },
});

/** Corps d'une demande de dérogation ; `extra` ajoute `workspaceUuid`, etc. */
const corpsDemande = (extra: Record<string, unknown> = {}): string => JSON.stringify({
  route: 'waiver.request',
  payload: {
    prId: 42, repositoryUuid: 'repo-1', rule: 'R-03', reason: 'correctif urgent',
    hours: 2, requestedBy: 'lea', ...extra,
  },
});

/** Corps d'une décision de dérogation. */
const corpsDecision = (extra: Record<string, unknown> = {}): string => JSON.stringify({
  route: 'waiver.decide',
  payload: { waiverId: 'w-1', decision: 'granted', decidedBy: 'tech-lead', workspaceUuid: WS1, ...extra },
});

const CORPS_SANTE = JSON.stringify({ route: 'health', payload: {} });
const CORPS_DIAGNOSTIC = JSON.stringify({ route: 'diagnostic', payload: { workspaceUuid: WS1 } });

/** Corps JSON d'une réponse du pont. */
const corps = (reponse: { body: string }): Record<string, unknown> =>
  JSON.parse(reponse.body) as Record<string, unknown>;

describe('item 10 — limite de débit du pont', () => {
  it('refuse en 429 rate-limited au-delà de la borne de l’espace', async () => {
    const limite = creerLimiteurDebit({ parEspace: 2, global: 100, fenetreMs: 60_000, maxCles: 16 }, () => T0);
    const { deps } = await banc({ limite });
    const premier = await gererRequetePont(signer(corpsEvaluation(WS1), SECRET_1), deps);
    const second = await gererRequetePont(signer(corpsEvaluation(WS1), SECRET_1), deps);
    const troisieme = await gererRequetePont(signer(corpsEvaluation(WS1), SECRET_1), deps);
    expect([premier.statusCode, second.statusCode]).toEqual([200, 200]);
    expect(troisieme.statusCode).toBe(429);
    expect(corps(troisieme).error).toBe('rate-limited');
    expect(troisieme.headers['retry-after']).toBe('60');
  });

  it('compte chaque espace de travail séparément', async () => {
    const limite = creerLimiteurDebit({ parEspace: 1, global: 100, fenetreMs: 60_000, maxCles: 16 }, () => T0);
    const { deps } = await banc({ limite });
    await gererRequetePont(signer(corpsEvaluation(WS1), SECRET_1), deps);
    const autre = await gererRequetePont(signer(corpsEvaluation(WS2), SECRET_2), deps);
    expect(autre.statusCode).toBe(200);
  });

  it('applique la borne globale aux requêtes sans espace annoncé', async () => {
    const limite = creerLimiteurDebit({ parEspace: 10, global: 2, fenetreMs: 60_000, maxCles: 16 }, () => T0);
    const { deps } = await banc({ limite });
    await gererRequetePont({ body: CORPS_SANTE, headers: {} }, deps);
    await gererRequetePont({ body: CORPS_SANTE, headers: {} }, deps);
    const refus = await gererRequetePont({ body: CORPS_SANTE, headers: {} }, deps);
    expect(refus.statusCode).toBe(429);
    expect(corps(refus).error).toBe('rate-limited');
  });

  it('libère des places quand la fenêtre glisse', async () => {
    let maintenant = T0;
    const limite = creerLimiteurDebit({ parEspace: 1, global: 100, fenetreMs: 60_000, maxCles: 16 }, () => maintenant);
    await limite.verifier(WS1);
    expect((await limite.verifier(WS1)).allowed).toBe(false);
    maintenant += 60_001;
    expect((await limite.verifier(WS1)).allowed).toBe(true);
  });

  it('borne la mémoire : une clé oubliée rouvre sa fenêtre', async () => {
    const limite = creerLimiteurDebit({ parEspace: 1, global: 1_000, fenetreMs: 60_000, maxCles: 2 }, () => T0);
    await limite.verifier('a');
    await limite.verifier('b');
    await limite.verifier('c');
    expect((await limite.verifier('a')).allowed).toBe(true);
  });

  it('rend une attente d’au moins une seconde', () => {
    expect(retryAfterSecondes({ allowed: false, retryAfterMs: 1 })).toBe('1');
    expect(retryAfterSecondes({ allowed: false, retryAfterMs: 1_500 })).toBe('2');
  });
});

describe('item 26 — anti-rejeu persistant et purge', () => {
  it('refuse un rejeu vu par un autre assemblage sur le même stockage', async () => {
    const store = createMemoryStore({ clock: () => T0 });
    const premier = await banc({ nonces: store.nonces });
    const second = await banc({ nonces: store.nonces });
    const requete = signer(corpsEvaluation(WS1), SECRET_1);
    expect((await gererRequetePont(requete, premier.deps)).statusCode).toBe(200);
    const rejeu = await gererRequetePont(requete, second.deps);
    expect(rejeu.statusCode).toBe(401);
    expect(corps(rejeu).error).toBe('unauthorized');
  });

  it('purge les nonces expirés et rend le compte', async () => {
    const store = createMemoryStore({ clock: () => T0 });
    await store.nonces.remember('perime', '2026-11-11T09:00:00.000Z');
    await store.nonces.remember('valide', '2026-11-11T10:05:00.000Z');
    expect(await store.nonces.purge?.(MAINTENANT)).toBe(1);
    expect(await store.nonces.seen('valide')).toBe(true);
  });

  it('ne purge qu’une fois par intervalle, et jamais sans la méthode', async () => {
    let appels = 0;
    const comptes = {
      seen: async () => false,
      remember: async () => undefined,
      purge: async () => { appels += 1; return 5; },
    };
    const purgeur = creerPurgeurNonces(comptes, 60_000);
    expect(await purgeur.purgerSiBesoin(MAINTENANT)).toBe(5);
    expect(await purgeur.purgerSiBesoin(MAINTENANT)).toBe(0);
    expect(await purgeur.purgerSiBesoin('2026-11-11T10:02:00.000Z')).toBe(5);
    const sansPurge = creerPurgeurNonces({ seen: async () => false, remember: async () => undefined });
    expect(await sansPurge.purgerSiBesoin(MAINTENANT)).toBe(0);
    expect(appels).toBe(2);
  });

  it('avale un échec de purge sans faire échouer la requête', async () => {
    const cassé = {
      seen: async () => false,
      remember: async () => undefined,
      purge: async () => { throw new Error('base injoignable'); },
    };
    const purgeur = creerPurgeurNonces(cassé, 1);
    expect(await purgeur.purgerSiBesoin(MAINTENANT)).toBe(0);
  });

  it('purge depuis le handler à l’occasion', async () => {
    const store = createMemoryStore({ clock: () => T0 });
    await store.nonces.remember('perime', '2026-11-11T09:00:00.000Z');
    const { deps } = await banc({ nonces: store.nonces, purge: creerPurgeurNonces(store.nonces, 60_000) });
    await gererRequetePont(signer(corpsEvaluation(WS1), SECRET_1), deps);
    await gererRequetePont(signer(corpsEvaluation(WS1), SECRET_1), deps);
    expect(await store.nonces.seen('perime')).toBe(false);
  });
});

describe('item 46 — l’espace annoncé lie le secret qui valide', () => {
  it('refuse une requête signée par le secret d’un autre espace', async () => {
    const { deps, waivers } = await banc();
    const reponse = await gererRequetePont(signer(corpsEvaluation(WS1), SECRET_2), deps);
    expect(reponse.statusCode).toBe(401);
    expect(corps(reponse).error).toBe('unauthorized');
    expect(corps(reponse).message).not.toContain(SECRET_2);
    expect(waivers.appels).toEqual([]);
  });

  it('accepte la requête dont l’espace annoncé porte le secret signataire', async () => {
    const { deps } = await banc();
    const reponse = await gererRequetePont(signer(corpsEvaluation(WS2), SECRET_2), deps);
    expect(reponse.statusCode).toBe(200);
  });

  it('refuse une requête non attribuable quand plusieurs espaces sont jumelés', async () => {
    const { deps } = await banc();
    const reponse = await gererRequetePont(signer(corpsDemande(), SECRET_2), deps);
    expect(reponse.statusCode).toBe(401);
    expect(corps(reponse).error).toBe('unauthorized');
  });

  it('accepte une requête sans espace annoncé s’il n’y a qu’un jumelage', async () => {
    const { deps, pairing } = await banc();
    pairing.records.delete(WS2);
    const reponse = await gererRequetePont(signer(corpsDemande({ workspaceUuid: undefined }), SECRET_1), deps);
    expect(reponse.statusCode).toBe(200);
  });

  it('dit non jumelé un espace annoncé que rien ne porte', async () => {
    const { deps, pairing } = await banc();
    await pairing.savePairing({ workspaceUuid: WS1, secret: SECRET_1, siteUrl: 'https://jira.test', pairedAt: MAINTENANT });
    pairing.records.delete(WS2);
    const reponse = await gererRequetePont(signer(corpsEvaluation('ws-inconnu'), SECRET_1), deps);
    expect(reponse.statusCode).toBe(401);
    expect(corps(reponse).error).toBe('unpaired');
  });
});

describe('items 47 et 48 — identité du décideur', () => {
  it('refuse une décision prise hors des approbateurs habilités', async () => {
    const { deps, waivers, audit } = await banc({ approbateurs: ['tech-lead'] });
    const reponse = await gererRequetePont(signer(corpsDecision({ decidedBy: 'intrus' }), SECRET_1), deps);
    expect(reponse.statusCode).toBe(401);
    expect(corps(reponse).error).toBe('unauthorized');
    expect(String(corps(reponse).message)).toContain('intrus');
    expect(waivers.appels).not.toContain('decider');
    expect(audit.lignes).toEqual([]);
  });

  it('accepte et journalise comme vérifiée la décision d’un approbateur', async () => {
    const { deps, audit, journal } = await banc({ approbateurs: ['tech-lead', 'autre'] });
    const reponse = await gererRequetePont(signer(corpsDecision({ workspaceUuid: WS1 }), SECRET_1), deps);
    expect(reponse.statusCode).toBe(200);
    expect(audit.lignes).toHaveLength(1);
    expect(audit.lignes[0]?.identity).toBe('verified');
    expect(audit.lignes[0]?.decidedBy).toBe('tech-lead');
    expect(journal.infos).toContain('Pont : décision de dérogation');
    expect(journal.contextes.map((c) => c?.identity)).toContain('verified');
  });

  it('journalise comme déclarée une décision sans approbateur configuré', async () => {
    const { deps, audit } = await banc({ approbateurs: [] });
    const reponse = await gererRequetePont(signer(corpsDecision({ decidedBy: 'qui-veut' }), SECRET_1), deps);
    expect(reponse.statusCode).toBe(200);
    expect(audit.lignes[0]?.identity).toBe('declared');
  });

  it('journalise la demande avec l’identité déclarée du demandeur', async () => {
    const { deps, audit } = await banc();
    const reponse = await gererRequetePont(signer(corpsDemande({ workspaceUuid: WS1 }), SECRET_1), deps);
    expect(reponse.statusCode).toBe(200);
    expect(audit.lignes).toHaveLength(1);
    expect(audit.lignes[0]).toMatchObject({
      waiverId: 'w-1', decision: 'requested', requestedBy: 'lea', identity: 'declared',
      prId: 42, repositoryUuid: 'repo-1', rule: 'R-03', workspaceUuid: WS1, createdAt: MAINTENANT,
    });
    expect(audit.lignes[0]?.decidedBy).toBeUndefined();
  });
});

describe('item 50 — journal d’audit des dérogations', () => {
  it('conserve la trace complète d’une dérogation, sans purge possible', async () => {
    const store = createMemoryStore({ clock: () => T0 });
    await store.waiverAudit.record({
      id: 'a1', waiverId: 'w-1', prId: 42, repositoryUuid: 'repo-1', rule: 'R-03', requestedBy: 'lea',
      decision: 'requested', reason: 'correctif urgent', identity: 'declared', createdAt: '2026-11-11T09:00:00.000Z',
    });
    await store.waiverAudit.record({
      id: 'a2', waiverId: 'w-1', prId: 42, repositoryUuid: 'repo-1', rule: 'R-03', requestedBy: 'lea',
      decidedBy: 'tech-lead', decision: 'granted', reason: 'correctif urgent', identity: 'verified',
      createdAt: '2026-11-11T10:00:00.000Z',
    });
    const trace = await store.waiverAudit.listByWaiver('w-1');
    expect(trace.map((ligne) => ligne.decision)).toEqual(['requested', 'granted']);
    expect(await store.waiverAudit.listByPullRequest('repo-1', 42)).toHaveLength(2);
    expect(await store.waiverAudit.listSince('2026-11-11T09:30:00.000Z')).toHaveLength(1);
    expect(Object.keys(store.waiverAudit).some((cle) => /purge|remove|delete/i.test(cle))).toBe(false);
  });

  it('n’annule pas la décision quand le journal est injoignable, et le dit', async () => {
    const { deps, audit, journal } = await banc({ approbateurs: ['tech-lead'] });
    audit.enPanne = true;
    const reponse = await gererRequetePont(signer(corpsDecision(), SECRET_1), deps);
    expect(reponse.statusCode).toBe(200);
    expect(journal.erreurs).toContain('Pont : journal d’audit injoignable');
  });

  it('trace la décision dans le journal applicatif quand aucun port n’est branché', async () => {
    const { deps, journal } = await banc({ sansAudit: true });
    await gererRequetePont(signer(corpsDemande({ workspaceUuid: WS1 }), SECRET_1), deps);
    expect(journal.infos).toContain('Pont : dérogation sans journal d’audit branché');
  });
});

describe('item 51 — health publique, diagnostic signé', () => {
  it('ne révèle pas l’état du stockage sur health', async () => {
    const { deps } = await banc();
    const reponse = await gererRequetePont({ body: CORPS_SANTE, headers: {} }, deps);
    expect(reponse.statusCode).toBe(200);
    expect(corps(reponse)).toEqual({ status: 'ok', version: '0.1.0', date: MAINTENANT });
    expect('stockage' in corps(reponse)).toBe(false);
  });

  it('exige une signature pour le diagnostic', async () => {
    const { deps } = await banc();
    const reponse = await gererRequetePont({ body: CORPS_DIAGNOSTIC, headers: {} }, deps);
    expect(reponse.statusCode).toBe(401);
    expect(corps(reponse).error).toBe('unauthorized');
  });

  it('réserve l’état du stockage à un appelant signé', async () => {
    const { deps } = await banc();
    const reponse = await gererRequetePont(signer(CORPS_DIAGNOSTIC, SECRET_1), deps);
    expect(reponse.statusCode).toBe(200);
    expect(corps(reponse)).toMatchObject({ status: 'ok', version: '0.1.0', stockage: 'ok' });
  });

  it('dit le stockage indisponible sans révéler l’erreur', async () => {
    const { deps, pairing } = await banc();
    const signe = signer(CORPS_DIAGNOSTIC, SECRET_1);
    pairing.casse = true;
    const reponse = await gererRequetePont(signe, deps);
    expect(reponse.statusCode).toBe(500);
    expect(reponse.body).not.toContain('base injoignable');
  });
});
