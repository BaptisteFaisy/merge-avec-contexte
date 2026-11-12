/**
 * Liens de ticket Jira — logique pure, sans le moindre import Forge.
 *
 * Un lien porte un type (nommé par le site, dans sa langue), un sens
 * (`inwardIssue` ou `outwardIssue`) et une cible : clé, statut, identifiant
 * de statut et catégorie Jira. Ce module lit tout cela ; l'incident JSM qu'un
 * lien peut désigner en est lu aussi.
 */
import type { IssueContext, IssueLink } from '../shared';

/** Catégorie Jira (`new` / `indeterminate` / `done`) ramenée au contrat. */
export function categorieStatut(brut: unknown): IssueContext['statusCategory'] {
  const cle = (brut as { statusCategory?: { key?: unknown } } | undefined)?.statusCategory?.key;
  if (cle === 'new') return 'toDo';
  if (cle === 'indeterminate') return 'inProgress';
  if (cle === 'done') return 'done';
  return undefined;
}

/** Statut Jira lu dans un objet `status` : nom, identifiant, catégorie. */
export function statutLu(brut: unknown): {
  nom: string;
  id?: string;
  categorie?: IssueContext['statusCategory'];
} {
  const objet = (brut ?? {}) as { name?: unknown; id?: unknown };
  return {
    nom: typeof objet.name === 'string' ? objet.name : '',
    id: typeof objet.id === 'string' ? objet.id : undefined,
    categorie: categorieStatut(brut),
  };
}

/** Nom de type de lien qui désigne un incident : « Incident », « is caused by ». */
const MOTIF_INCIDENT = /incident|caused by/i;

/** Cible d'un lien Jira : clé, statut, type d'incident éventuel. */
interface CibleLien {
  key: string;
  status: string;
  statusId?: string;
  statusCategory?: IssueContext['statusCategory'];
  type?: string;
  /** Sens du lien, calé sur la cible retenue. */
  direction: 'inward' | 'outward';
}

/**
 * Cible d'un lien (`inwardIssue` / `outwardIssue`), quelle que soit sa forme.
 *
 * Jira envoie les deux clés, l'une valant `null` : la cible retenue est celle
 * qui porte une clé, et le sens du lien est calé sur elle.
 */
function cibleDuLien(lien: Record<string, unknown>): CibleLien | undefined {
  const candidats = [
    { issue: lien.outwardIssue, direction: 'outward' as const },
    { issue: lien.inwardIssue, direction: 'inward' as const },
  ];
  for (const candidat of candidats) {
    const brute = candidat.issue as
      | { key?: unknown; fields?: { status?: unknown; issuetype?: { name?: unknown } } }
      | undefined;
    if (!brute || typeof brute.key !== 'string') continue;
    const statut = statutLu(brute.fields?.status);
    return {
      key: brute.key,
      status: statut.nom,
      statusId: statut.id,
      statusCategory: statut.categorie,
      type: typeof brute.fields?.issuetype?.name === 'string' ? brute.fields.issuetype.name : undefined,
      direction: candidat.direction,
    };
  }
  return undefined;
}

/**
 * Clé de l'incident JSM porté par un lien, s'il y en a un.
 *
 * Un lien désigne un incident quand sa cible est de type « Incident » ou quand
 * le type de lien le dit (« is caused by », « incident »).
 */
export function cleIncident(lien: unknown): string | undefined {
  if (!lien || typeof lien !== 'object') return undefined;
  const brut = lien as Record<string, unknown>;
  const cible = cibleDuLien(brut);
  if (!cible) return undefined;
  const type = brut.type as { name?: unknown; inward?: unknown; outward?: unknown } | undefined;
  const nomme = [type?.name, type?.inward, type?.outward].filter(
    (v): v is string => typeof v === 'string',
  );
  const parleIncident = nomme.some((nom) => MOTIF_INCIDENT.test(nom));
  const estIncident = typeof cible.type === 'string' && MOTIF_INCIDENT.test(cible.type);
  return parleIncident || estIncident ? cible.key : undefined;
}

/** Liens du ticket, dans les deux sens, avec la cible et son statut. */
export function parseLiens(issuelinks: unknown): IssueLink[] {
  if (!Array.isArray(issuelinks)) return [];
  const liens: IssueLink[] = [];
  for (const brute of issuelinks) {
    if (!brute || typeof brute !== 'object') continue;
    const lien = brute as Record<string, unknown>;
    const cible = cibleDuLien(lien);
    if (!cible) continue;
    const type = lien.type as { name?: unknown } | undefined;
    liens.push({
      type: typeof type?.name === 'string' ? type.name : '',
      direction: cible.direction,
      targetKey: cible.key,
      targetStatus: cible.status,
      targetStatusId: cible.statusId,
      targetStatusCategory: cible.statusCategory,
    });
  }
  return liens;
}
