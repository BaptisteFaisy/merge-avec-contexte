/**
 * Extraction des clés de tickets (§8, « Extraire le ticket »).
 *
 * La clé est cherchée dans le nom de la branche source, puis le titre de la
 * PR, puis les messages de commit. Plusieurs clés trouvées : toutes sont
 * renvoyées, dans l'ordre de découverte — le moteur prendra le résultat le
 * plus strict.
 */

/** Format standard d'une clé Jira : PROJET-NUMERO, en majuscules. */
export const ISSUE_KEY_PATTERN = /\b([A-Z][A-Z0-9]{1,10}-\d{1,7})\b/g;

export interface KeySearchSource {
  sourceBranch: string;
  title: string;
  commitMessages: string[];
}

export interface ExtractOptions {
  /** Clés de projets attendues : autorise la reconnaissance en minuscules. */
  projectKeys?: string[];
  /** Clés à écarter (ex. préfixes réservés d'un autre outil). */
  ignore?: string[];
}

/** Construit le motif tolérant aux minuscules pour des projets connus. */
function motifProjets(projectKeys: string[]): RegExp | undefined {
  if (projectKeys.length === 0) return undefined;
  const alternatifs = projectKeys.map((cle) => cle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp(`\\b(${alternatifs})-(\\d{1,7})\\b`, 'gi');
}

/** Déduplique en préservant l'ordre d'apparition. */
function dedupliquer(cles: string[]): string[] {
  const vus = new Set<string>();
  const sortie: string[] = [];
  for (const cle of cles) {
    if (vus.has(cle)) continue;
    vus.add(cle);
    sortie.push(cle);
  }
  return sortie;
}

/** Clés trouvées dans un texte, majuscules normalisées. */
export function findKeysIn(texte: string, options: ExtractOptions = {}): string[] {
  const trouvees = [...texte.matchAll(ISSUE_KEY_PATTERN)].map((match) => match[1] ?? '');
  const motif = motifProjets(options.projectKeys ?? []);
  if (motif) {
    for (const match of texte.matchAll(motif)) {
      const projet = (match[1] ?? '').toUpperCase();
      const numero = match[2] ?? '';
      trouvees.push(`${projet}-${numero}`);
    }
  }
  const ignorees = new Set(options.ignore ?? []);
  return dedupliquer(trouvees.filter((cle) => cle.length > 0 && !ignorees.has(cle)));
}

/** Clés de la PR : branche, puis titre, puis messages de commit. */
export function extractIssueKeys(source: KeySearchSource, options: ExtractOptions = {}): string[] {
  const cles = [
    ...findKeysIn(source.sourceBranch, options),
    ...findKeysIn(source.title, options),
    ...source.commitMessages.flatMap((message) => findKeysIn(message, options)),
  ];
  return dedupliquer(cles);
}
