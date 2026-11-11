/**
 * Transformation pure du brut Bitbucket en `PrContext` du contrat partagé.
 *
 * Aucun appel réseau, aucune lecture d'horloge : ce module ne fait que
 * traduire des structures, afin d'être testable en vitest.
 * Seul les métadonnées circulent (§13.3, sobriété) : jamais une ligne de code.
 */
import type { PrContext, Reviewer, Trigger } from '../shared';
import type { CommitBrut, DiffstatBrut, ParticipantBrut, PullRequestBrut } from './types';

/** Déclencheurs reconnus ; tout autre est ramené au push (MC-02). */
const DECLENCHEURS: Trigger[] = ['on-code-pushed', 'on-reviewer-status-changed', 'on-merge'];

/** Avis d'un relecteur déduit de l'état Bitbucket. */
type EtatRelu = Reviewer['state'];

/** Identifiant d'un relecteur, dans l'ordre de confiance des champs reçus. */
function compteRelu(participant: ParticipantBrut): string | undefined {
  const user = participant.user;
  if (!user) return undefined;
  return user.account_id ?? user.uuid ?? user.nickname;
}

/** Traduit `participants[].state` en avis du contrat (inconnu → `none`). */
function etatRelu(participant: ParticipantBrut): EtatRelu {
  if (participant.state === 'approved' || participant.approved === true) return 'approved';
  if (participant.state === 'changes_requested') return 'changes_requested';
  return 'none';
}

/** Relecteurs : un avis par participant ayant rendu une décision. */
export function relecteursDepuisParticipants(participants: ParticipantBrut[] = []): Reviewer[] {
  const vus = new Map<string, Reviewer>();
  for (const participant of participants) {
    const accountId = compteRelu(participant);
    if (!accountId) continue;
    const state = etatRelu(participant);
    if (state === 'none' && participant.role !== 'REVIEWER') continue;
    vus.set(accountId, {
      accountId,
      displayName: participant.user?.display_name ?? participant.user?.nickname,
      state,
    });
  }
  return [...vus.values()];
}

/** Chemins modifiés du diffstat, dédupliqués, dans l'ordre reçu. */
export function cheminsDepuisDiffstat(diffstat: DiffstatBrut[] = []): string[] {
  const vus = new Set<string>();
  const sortie: string[] = [];
  for (const entree of diffstat) {
    const chemin = entree.new?.path ?? entree.old?.path;
    if (!chemin || vus.has(chemin)) continue;
    vus.add(chemin);
    sortie.push(chemin);
  }
  return sortie;
}

/** Messages de commit, débarrassés des entrées vides. */
export function messagesDepuisCommits(commits: CommitBrut[] = []): string[] {
  return commits.map((commit) => (commit.message ?? '').trim()).filter((message) => message.length > 0);
}

/** Traduit le type reçu de Bitbucket en `Trigger` ; inconnu → push. */
export function declencheurDepuisBitbucket(type: string | undefined): Trigger {
  const normalise = (type ?? '').trim();
  return (DECLENCHEURS as string[]).includes(normalise) ? (normalise as Trigger) : 'on-code-pushed';
}

/** Ce que le Capteur envoie au Cerveau : les chemins peuvent être retirés. */
export interface OptionsPrContext {
  workspaceUuid: string;
  repositoryUuid: string;
  repositorySlug?: string;
  trigger: Trigger;
  /** Faux = l'administrateur a désactivé l'envoi des chemins (§13.3). */
  envoiDesChemins: boolean;
}

/** Construit le `PrContext` du contrat partagé depuis les lectures brutes. */
export function versPrContext(
  pr: PullRequestBrut,
  commits: CommitBrut[],
  diffstat: DiffstatBrut[],
  options: OptionsPrContext,
): PrContext {
  return {
    workspaceUuid: options.workspaceUuid,
    repositoryUuid: options.repositoryUuid,
    repositorySlug: options.repositorySlug,
    pullRequestId: pr.id,
    title: pr.title ?? '',
    sourceBranch: pr.source?.branch?.name ?? '',
    targetBranch: pr.destination?.branch?.name ?? '',
    commitMessages: messagesDepuisCommits(commits),
    changedPaths: options.envoiDesChemins ? cheminsDepuisDiffstat(diffstat) : [],
    reviewers: relecteursDepuisParticipants(pr.participants),
    trigger: options.trigger,
  };
}
