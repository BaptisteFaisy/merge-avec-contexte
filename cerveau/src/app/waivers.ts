/**
 * Adaptateurs des dérogations : le stockage (`storage/ports.ts`) vu comme le
 * `WaiverService` du pont et comme le `WaiverRepository` des actions Rovo.
 *
 * La durée d'une dérogation est bornée (1 à 72 h) : une demande abusive ne
 * peut pas neutraliser une règle indéfiniment (§7.1, MC-07).
 */
import { erreurPont } from '../bridge/errors';
import type { WaiverService } from '../bridge/deps';
import type { WaiverRepository as RovoWaivers, WaiverRequestDraft } from '../rovo/deps';
import type { Waiver } from '../shared';
import type { StoredWaiver, Store } from '../storage/ports';
import type { HorlogeIso } from './horloge';

/** Durée bornée d'une dérogation, en heures. */
export function borneHeures(hours: number): number {
  if (!Number.isFinite(hours)) return 1;
  return Math.min(Math.max(Math.round(hours), 1), 72);
}

/** Échéance ISO calculée depuis l'horloge injectée. */
export function echeance(now: string, hours: number): string {
  return new Date(Date.parse(now) + borneHeures(hours) * 3_600_000).toISOString();
}

/** Identifiant déterministe : aucune base ne fournit d'auto-incrément. */
export function identifiant(prefixe: string, ...morceaux: Array<string | number>): string {
  return [prefixe, ...morceaux.map(String)].join('-');
}

/** Fabrique le `WaiverService` attendu par le pont. */
export function createWaiverService(store: Store, clock: HorlogeIso): WaiverService {
  return {
    async demander(demande) {
      const now = clock();
      const waiver: StoredWaiver = {
        id: identifiant('w', demande.prId, demande.rule, Date.parse(now)),
        prId: demande.prId,
        repositoryUuid: demande.repositoryUuid,
        rule: demande.rule,
        requestedBy: demande.requestedBy,
        reason: demande.reason,
        requestedAt: now,
        expiresAt: echeance(now, demande.hours),
        status: 'requested',
        issueKeys: demande.issueKey ? [demande.issueKey] : [],
      };
      await store.waivers.create(waiver);
      return waiver;
    },
    async decider(decision) {
      const now = clock();
      const maj = decision.decision === 'granted'
        ? await store.waivers.grant(decision.waiverId, decision.decidedBy, decision.hours ? echeance(now, decision.hours) : undefined)
        : await store.waivers.refuse(decision.waiverId, decision.decidedBy);
      if (!maj) throw erreurPont('not-found', `Dérogation ${decision.waiverId} introuvable.`);
      return maj;
    },
    async lister(filtre) {
      if (filtre.prId === undefined || !filtre.repositoryUuid) return [];
      return store.waivers.listByPullRequest(filtre.repositoryUuid, filtre.prId);
    },
  };
}

/** Fabrique le `WaiverRepository` attendu par les actions Rovo. */
export function createRovoWaivers(store: Store): RovoWaivers {
  return {
    async listByIssue(issueKey) {
      return store.waivers.listByIssue(issueKey);
    },
    async createRequest(draft: WaiverRequestDraft): Promise<Waiver> {
      const waiver: StoredWaiver = {
        id: identifiant('w-rovo', draft.issueKey, draft.rule, Date.parse(draft.requestedAt)),
        prId: 0,
        repositoryUuid: '',
        rule: draft.rule,
        requestedBy: 'rovo',
        reason: draft.reason,
        requestedAt: draft.requestedAt,
        expiresAt: draft.expiresAt,
        status: 'requested',
        issueKeys: [draft.issueKey],
      };
      await store.waivers.create(waiver);
      return waiver;
    },
  };
}
