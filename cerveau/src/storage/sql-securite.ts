/**
 * Adaptateurs SQL de la sécurité du pont : anti-rejeu et journal d'audit.
 *
 * Deux tables hors du §14, créées par `schema.ts` :
 * - `bridge_nonce` loge la mémoire des nonces. En mémoire du conteneur, un
 *   redémarrage (ou un second conteneur) annulait la protection contre le
 *   rejeu — constaté sur le site de démonstration ; en base, elle survit.
 *   Les nonces dont la fenêtre est passée sont supprimés par `purge` ;
 * - `waiver_audit` journalise les décisions de dérogation (§16). Ce journal
 *   n'est **jamais purgé** : aucune méthode d'effacement n'existe ici.
 *
 * L'horloge est injectée (`clock`, ISO 8601) : aucun de ces adaptateurs ne lit
 * l'heure système dans une fonction que les tests exercent.
 */
import type { WaiverAuditEntry, WaiverIdentityStatus } from '../shared/bridge/payload';
import type { RuleCode } from '../shared/types';
import type { NonceStore, WaiverAuditRepository } from './ports';
import { ecrire, lire, lireUne, periodeSur, upsert, type SqlValue } from './sql-exec';

/** Horloge ISO par défaut des adaptateurs : l'heure réelle du conteneur. */
export const heureReelleIso = (): string => new Date().toISOString();

/** Colonnes de `waiver_audit`, dans l'ordre de la table. */
const COLONNES_AUDIT = [
  'id', 'waiver_id', 'pr_id', 'repo_uuid', 'rule_code', 'workspace_uuid', 'requested_by',
  'decided_by', 'decision', 'reason', 'identity_status', 'created_at',
];

const ecrireAudit = upsert('waiver_audit', COLONNES_AUDIT, ['id']);

interface AuditRow {
  id: string;
  waiver_id: string;
  pr_id: number;
  repo_uuid: string;
  rule_code: string;
  workspace_uuid: string | null;
  requested_by: string;
  decided_by: string | null;
  decision: string;
  reason: string;
  identity_status: string;
  created_at: string;
}

const auditDepuisLigne = (l: AuditRow): WaiverAuditEntry => ({
  id: l.id,
  waiverId: l.waiver_id,
  prId: Number(l.pr_id),
  repositoryUuid: l.repo_uuid,
  rule: l.rule_code as RuleCode,
  workspaceUuid: l.workspace_uuid ?? undefined,
  requestedBy: l.requested_by,
  decidedBy: l.decided_by ?? undefined,
  decision: l.decision as WaiverAuditEntry['decision'],
  reason: l.reason,
  identity: l.identity_status as WaiverIdentityStatus,
  createdAt: l.created_at,
});

/** Paramètres d'une ligne d'audit, dans l'ordre de `COLONNES_AUDIT`. */
const paramsAudit = (e: WaiverAuditEntry): SqlValue[] => [
  e.id, e.waiverId, e.prId, e.repositoryUuid, e.rule, e.workspaceUuid ?? null, e.requestedBy,
  e.decidedBy ?? null, e.decision, e.reason, e.identity, e.createdAt,
];

/** `waiver_audit` : la trace des décisions de dérogation, sans limite de durée. */
export function creerWaiverAuditStore(): WaiverAuditRepository {
  const liste = (clause: string, params: SqlValue[], ordre: string) =>
    lire(`SELECT * FROM waiver_audit WHERE ${clause} ORDER BY created_at ${ordre}`, params, auditDepuisLigne);
  return {
    async record(entry) {
      await ecrireAudit(paramsAudit(entry));
    },
    find: (id) => lireUne('SELECT * FROM waiver_audit WHERE id = ?', [id], auditDepuisLigne),
    listByWaiver: (waiverId) => liste('waiver_id = ?', [waiverId], 'ASC'),
    listByPullRequest: (repositoryUuid, prId) =>
      liste('repo_uuid = ? AND pr_id = ?', [repositoryUuid, prId], 'DESC'),
    listSince: (since, until) => {
      const filtre = periodeSur('created_at', since, until);
      return liste(filtre.clause, filtre.params, 'DESC');
    },
  };
}

/**
 * `bridge_nonce` : les nonces déjà vus, avec leur date d'expiration.
 *
 * `seen` ne répond « vu » que pour un nonce dont la fenêtre n'est pas passée :
 * une ligne expirée qui traînerait ne doit pas refuser un nonce légitime
 * réutilisé plus tard.
 */
export function creerNonceStore(clock: () => string = heureReelleIso): NonceStore {
  return {
    seen: (nonce) => lireUne<{ nonce: string }, string>(
      'SELECT nonce FROM bridge_nonce WHERE nonce = ? AND expires_at > ?',
      [nonce, clock()],
      (ligne) => ligne.nonce,
    ).then((trouve) => trouve !== undefined),
    async remember(nonce, expiresAt) {
      await ecrire(
        `INSERT INTO bridge_nonce (nonce, expires_at, created_at) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE expires_at = ?, created_at = ?`,
        [nonce, expiresAt, expiresAt, expiresAt, expiresAt],
      );
    },
    purge: (now) => ecrire('DELETE FROM bridge_nonce WHERE expires_at <= ?', [now]),
  };
}
