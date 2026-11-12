/**
 * Implémentation mémoire des ports de stockage.
 *
 * C'est ce que les tests utilisent, et c'est aussi un mode de repli acceptable
 * pour une démonstration sans base. Aucune logique métier n'est dupliquée ici :
 * les méthodes se contentent de ranger, relire et filtrer, exactement comme le
 * feraient les requêtes SQL de `sql-store.ts`.
 *
 * Une copie est rendue à chaque lecture (les objets sortent gelés de fait) :
 * un test qui mute un résultat ne peut pas corrompre le magasin.
 */
import type { FallbackPolicy, Freeze, Incident, RuleConfig } from '../shared/types';
import type { PairingOffer } from '../shared/bridge/pairing';
import type { WaiverAuditEntry } from '../shared/bridge/payload';
import { dureeMaximale, percentileDurees } from './ports';
import type {
  EvaluationRepository,
  EvaluationStats,
  FreezeRepository,
  IncidentRepository,
  IssueCacheEntry,
  IssueCacheRepository,
  NonceStore,
  ObservedBlock,
  PairingRecord,
  PairingRepository,
  PageEvaluation,
  RepoServiceMapping,
  RepoServiceRepository,
  RuleConfigRepository,
  Store,
  StoredEvaluation,
  StoredWaiver,
  WaiverAuditRepository,
  WaiverRepository,
} from './ports';

/** Copie profonde par sérialisation : suffisant pour des données JSON. */
function copie<T>(valeur: T): T {
  return JSON.parse(JSON.stringify(valeur)) as T;
}

/** Clé composite lisible, sans collision avec un séparateur improbable. */
function cle(...morceaux: (string | number)[]): string {
  return morceaux.join('\u0000');
}

/** Vrai si l'instant tombe dans [since, until]. */
function dansPeriode(instant: string, since: string, until?: string): boolean {
  const t = Date.parse(instant);
  if (t < Date.parse(since)) return false;
  return until === undefined || t <= Date.parse(until);
}

/** Les évaluations les plus récentes d'abord. */
function parDateDesc(a: StoredEvaluation, b: StoredEvaluation): number {
  return Date.parse(b.evaluatedAt) - Date.parse(a.evaluatedAt);
}

/** Comptages, durée moyenne, P95 et maximum d'une liste déjà filtrée. */
function compter(evaluations: StoredEvaluation[], since: string, until?: string): EvaluationStats {
  const durees = evaluations.map((e) => e.durationMs);
  const somme = durees.reduce((total, d) => total + d, 0);
  return {
    since,
    until,
    total: evaluations.length,
    allowed: evaluations.filter((e) => e.verdict === 'allowed').length,
    blocked: evaluations.filter((e) => e.verdict === 'blocked').length,
    inconclusive: evaluations.filter((e) => e.verdict === 'inconclusive').length,
    fallbacks: evaluations.filter((e) => e.fallback !== undefined).length,
    averageDurationMs: durees.length === 0 ? 0 : Math.round(somme / durees.length),
    p95DurationMs: percentileDurees(durees, 95),
    maxDurationMs: dureeMaximale(durees),
  };
}

/** Découpe une page d'évaluations : limite et décalage facultatifs (item 56). */
function paginer(evaluations: StoredEvaluation[], page?: PageEvaluation): StoredEvaluation[] {
  if (page === undefined) return evaluations;
  const debut = Math.max(0, Math.trunc(page.offset ?? 0));
  const fin = page.limit === undefined ? undefined : debut + Math.max(0, Math.trunc(page.limit));
  return evaluations.slice(debut, fin);
}

/** Magasin des réglages de règles. */
function creerRuleConfigStore(map: Map<string, RuleConfig>): RuleConfigRepository {
  return {
    async listByProject(projectId) {
      return [...map.entries()]
        .filter(([k]) => k.startsWith(`${projectId}\u0000`))
        .map(([, v]) => copie(v));
    },
    async find(projectId, rule) {
      const trouve = map.get(cle(projectId, rule));
      return trouve ? copie(trouve) : undefined;
    },
    async upsert(projectId, config) {
      map.set(cle(projectId, config.rule), copie(config));
    },
    async remove(projectId, rule) {
      map.delete(cle(projectId, rule));
    },
  };
}

/** Magasin des gels. */
function creerFreezeStore(map: Map<string, Freeze>): FreezeRepository {
  const tries = (liste: Freeze[]) => liste.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return {
    async save(freeze) {
      map.set(freeze.id, copie(freeze));
    },
    async find(id) {
      const trouve = map.get(id);
      return trouve ? copie(trouve) : undefined;
    },
    async list() {
      return tries([...map.values()].map(copie));
    },
    async listActive(now) {
      const instant = Date.parse(now);
      return tries(
        [...map.values()].filter((f) => Date.parse(f.startsAt) <= instant && Date.parse(f.endsAt) > instant).map(copie),
      );
    },
    async listUpcoming(now) {
      const instant = Date.parse(now);
      return tries([...map.values()].filter((f) => Date.parse(f.startsAt) > instant).map(copie));
    },
    async remove(id) {
      map.delete(id);
    },
  };
}

/** Les demandes les plus récentes d'abord : l'ordre de tous les listings. */
function recentes(liste: StoredWaiver[]): StoredWaiver[] {
  return liste.sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt));
}

/** Dérogations d'une PR, copiées et triées. */
function parPr(map: Map<string, StoredWaiver>, repositoryUuid: string, prId: number): StoredWaiver[] {
  return recentes(
    [...map.values()].filter((w) => w.repositoryUuid === repositoryUuid && w.prId === prId).map(copie),
  );
}

/** Magasin des dérogations. */
function creerWaiverStore(map: Map<string, StoredWaiver>): WaiverRepository {
  const basculer = (id: string, change: (w: StoredWaiver) => StoredWaiver) => {
    const trouve = map.get(id);
    if (!trouve) return undefined;
    const maj = change(copie(trouve));
    map.set(id, maj);
    return copie(maj);
  };
  return {
    async create(waiver) {
      map.set(waiver.id, copie(waiver));
    },
    async find(id) {
      const trouve = map.get(id);
      return trouve ? copie(trouve) : undefined;
    },
    async grant(id, grantedBy, expiresAt) {
      return basculer(id, (w) => ({ ...w, grantedBy, expiresAt: expiresAt ?? w.expiresAt, status: 'granted' }));
    },
    async refuse(id, decidedBy) {
      return basculer(id, (w) => ({ ...w, grantedBy: decidedBy, status: 'refused' }));
    },
    async listByPullRequest(repositoryUuid, prId) {
      return parPr(map, repositoryUuid, prId);
    },
    async listByIssue(issueKey) {
      return recentes([...map.values()].filter((w) => w.issueKeys.includes(issueKey)).map(copie));
    },
    async listSince(since, until) {
      return recentes(
        [...map.values()].filter((w) => dansPeriode(w.requestedAt, since, until)).map(copie),
      );
    },
    async expire(now) {
      const instant = Date.parse(now);
      let compteur = 0;
      for (const [id, w] of map) {
        if (w.status !== 'granted' || w.expiresAt === undefined) continue;
        if (Date.parse(w.expiresAt) > instant) continue;
        map.set(id, { ...w, status: 'expired' });
        compteur += 1;
      }
      return compteur;
    },
  };
}

/** Raisons bloquantes d'une évaluation restée en observation. */
function blocagesObservés(evaluation: StoredEvaluation): ObservedBlock[] {
  return evaluation.reasons
    .filter((raison) => raison.observed === true && raison.level === 'blocking')
    .map((raison) => ({
      rule: raison.rule,
      repositoryUuid: evaluation.repositoryUuid,
      pullRequestId: evaluation.pullRequestId,
      issueKeys: [...evaluation.issueKeys],
      evaluatedAt: evaluation.evaluatedAt,
      text: raison.text,
    }));
}

/** Magasin du journal des évaluations. */
function creerEvaluationStore(map: Map<string, StoredEvaluation>): EvaluationRepository {
  const periode = (since: string, until?: string) =>
    [...map.values()].filter((e) => dansPeriode(e.evaluatedAt, since, until)).map(copie).sort(parDateDesc);
  return {
    async record(evaluation) {
      map.set(evaluation.id, copie(evaluation));
    },
    async find(id) {
      const trouve = map.get(id);
      return trouve ? copie(trouve) : undefined;
    },
    async latestByPullRequest(repositoryUuid, prId) {
      const candidates = [...map.values()].filter((e) => e.repositoryUuid === repositoryUuid && e.pullRequestId === prId);
      return candidates.length === 0 ? undefined : copie(candidates.sort(parDateDesc)[0] as StoredEvaluation);
    },
    async latestByIssue(issueKey) {
      const candidates = [...map.values()].filter((e) => e.issueKeys.includes(issueKey));
      return candidates.length === 0 ? undefined : copie(candidates.sort(parDateDesc)[0] as StoredEvaluation);
    },
    async listSince(since, until, page) {
      return paginer(periode(since, until), page);
    },
    async stats(since, until) {
      return compter(periode(since, until), since, until);
    },
    async observedBlocks(since, until) {
      return periode(since, until).flatMap(blocagesObservés);
    },
  };
}

/** Magasin du jumelage et de la politique de repli. */
function creerPairingStore(etat: {
  offre?: PairingOffer;
  jumelage?: PairingRecord;
  repli: FallbackPolicy;
}): PairingRepository {
  return {
    async saveOffer(offer) {
      etat.offre = copie(offer);
    },
    async currentOffer() {
      return etat.offre ? copie(etat.offre) : undefined;
    },
    async markOfferUsed(code) {
      if (!etat.offre || etat.offre.code !== code || etat.offre.used) return false;
      etat.offre = { ...etat.offre, used: true };
      return true;
    },
    async recordPairing(record) {
      etat.jumelage = copie(record);
    },
    async current() {
      return etat.jumelage ? copie(etat.jumelage) : undefined;
    },
    async fallbackPolicy() {
      return etat.repli;
    },
    async setFallbackPolicy(policy) {
      etat.repli = policy;
    },
    async unpair() {
      etat.jumelage = undefined;
    },
  };
}

/** Magasin de la correspondance dépôt → service. */
function creerRepoServiceStore(map: Map<string, RepoServiceMapping>): RepoServiceRepository {
  return {
    async upsert(mapping) {
      map.set(cle(mapping.workspaceUuid, mapping.repoUuid), copie(mapping));
    },
    async find(workspaceUuid, repoUuid) {
      const trouve = map.get(cle(workspaceUuid, repoUuid));
      return trouve ? copie(trouve) : undefined;
    },
    async listByWorkspace(workspaceUuid) {
      return [...map.values()].filter((m) => m.workspaceUuid === workspaceUuid).map(copie);
    },
    async listByService(service) {
      return [...map.values()].filter((m) => m.service === service).map(copie);
    },
    async remove(workspaceUuid, repoUuid) {
      map.delete(cle(workspaceUuid, repoUuid));
    },
  };
}

/** Magasin du cache par ticket. */
function creerIssueCacheStore(map: Map<string, IssueCacheEntry>): IssueCacheRepository {
  return {
    async read(issueKey) {
      const trouve = map.get(issueKey);
      return trouve ? copie(trouve) : undefined;
    },
    async readMany(issueKeys) {
      return issueKeys.map((k) => map.get(k)).filter((e): e is IssueCacheEntry => e !== undefined).map(copie);
    },
    async write(entry) {
      map.set(entry.issueKey, copie(entry));
    },
    async writeMany(entries) {
      for (const entree of entries) map.set(entree.issueKey, copie(entree));
    },
    async remove(issueKey) {
      map.delete(issueKey);
    },
  };
}

/** Magasin des incidents JSM. */
function creerIncidentStore(map: Map<string, Incident>): IncidentRepository {
  const ouverts = () => [...map.values()].filter((i) => i.resolvedAt === undefined).map(copie);
  return {
    async open(incident) {
      map.set(cle(incident.service, incident.incidentKey), { ...copie(incident), resolvedAt: undefined });
    },
    async resolve(service, incidentKey, resolvedAt) {
      const k = cle(service, incidentKey);
      const trouve = map.get(k);
      if (trouve) map.set(k, { ...trouve, resolvedAt });
    },
    async listOpen(service) {
      return ouverts().filter((i) => i.service === service);
    },
    async listOpenMany(services) {
      return ouverts().filter((i) => services.includes(i.service));
    },
    async listOpenAll() {
      return ouverts();
    },
  };
}

/** Mémoire des nonces : même contrat que `createMemoryNonceStore` du contrat partagé. */
function creerNonceStore(map: Map<string, number>, clock: () => number = Date.now): NonceStore {
  return {
    async seen(nonce) {
      const expiration = map.get(nonce);
      if (expiration === undefined) return false;
      return expiration > clock();
    },
    async remember(nonce, expiresAt) {
      map.set(nonce, Date.parse(expiresAt));
    },
    async purge(now) {
      const limite = Date.parse(now);
      let effaces = 0;
      for (const [nonce, expiration] of map) {
        if (expiration > limite) continue;
        map.delete(nonce);
        effaces += 1;
      }
      return effaces;
    },
  };
}

/**
 * Magasin du journal d'audit des dérogations.
 *
 * Aucune purge ici : le §16 exige une traçabilité sans limite de durée. La
 * trace d'une dérogation se lit dans l'ordre chronologique (demande d'abord),
 * les listings transverses du plus récent au plus ancien.
 */
function creerWaiverAuditStore(map: Map<string, WaiverAuditEntry>): WaiverAuditRepository {
  const chronologique = (liste: WaiverAuditEntry[]) =>
    liste.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).map(copie);
  const recentesDAbord = (liste: WaiverAuditEntry[]) =>
    liste.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).map(copie);
  return {
    async record(entry) {
      map.set(entry.id, copie(entry));
    },
    async find(id) {
      const trouve = map.get(id);
      return trouve ? copie(trouve) : undefined;
    },
    async listByWaiver(waiverId) {
      return chronologique([...map.values()].filter((e) => e.waiverId === waiverId));
    },
    async listByPullRequest(repositoryUuid, prId) {
      return recentesDAbord(
        [...map.values()].filter((e) => e.repositoryUuid === repositoryUuid && e.prId === prId),
      );
    },
    async listSince(since, until) {
      return recentesDAbord([...map.values()].filter((e) => dansPeriode(e.createdAt, since, until)));
    },
  };
}

/** Options du store mémoire : l'horloge sert aux nonces (anti-rejeu). */
export interface MemoryStoreOptions {
  /** Horloge injectée en millisecondes ; défaut : l'heure réelle. */
  clock?: () => number;
}

/** Tout le stockage en mémoire, assemblé. */
export function createMemoryStore(options: MemoryStoreOptions = {}): Store {
  const clock = options.clock ?? Date.now;
  return {
    pairing: creerPairingStore({ repli: 'open' }),
    ruleConfig: creerRuleConfigStore(new Map<string, RuleConfig>()),
    freezes: creerFreezeStore(new Map<string, Freeze>()),
    waivers: creerWaiverStore(new Map<string, StoredWaiver>()),
    waiverAudit: creerWaiverAuditStore(new Map<string, WaiverAuditEntry>()),
    evaluations: creerEvaluationStore(new Map<string, StoredEvaluation>()),
    repoService: creerRepoServiceStore(new Map<string, RepoServiceMapping>()),
    issueCache: creerIssueCacheStore(new Map<string, IssueCacheEntry>()),
    incidents: creerIncidentStore(new Map<string, Incident>()),
    nonces: creerNonceStore(new Map<string, number>(), clock),
  };
}
