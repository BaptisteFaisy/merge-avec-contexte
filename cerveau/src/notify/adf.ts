/**
 * Format ADF des commentaires Jira (audit item 18) : logique pure, sans Forge.
 *
 * Un commentaire Jira Cloud est un document ADF (`{ type: 'doc', version: 1,
 * content: [...] }`). Ce module construit le document à partir du texte du §9
 * et y scelle l'empreinte du blocage dans une ligne-marque relisible, pour que
 * la déduplication survive au conteneur : on relit les commentaires d'un
 * ticket, on en extrait les empreintes déjà posées.
 */

/** Préfixe de la ligne-marque portant l'empreinte (relue pour la déduplication). */
export const MARQUEUR_PREFIXE = 'mac-blocage:';

/** Nœud ADF minimal : ce que le constructeur et le lecteur savent exploiter. */
interface NoeudAdf {
  type?: string;
  text?: string;
  content?: NoeudAdf[];
  marks?: Array<{ type?: string }>;
}

/** Ligne-marque qui scelle l'empreinte dans le commentaire. */
export function ligneMarque(empreinte: string): string {
  return `${MARQUEUR_PREFIXE}${empreinte}`;
}

/** Un paragraphe ADF pour une ligne de texte (ligne vide = espace insécable). */
function paragraphe(ligne: string): NoeudAdf {
  return {
    type: 'paragraph',
    content: [{ type: 'text', text: ligne.length > 0 ? ligne : ' ' }],
  };
}

/**
 * Document ADF d'un commentaire : le corps ligne par ligne, puis la
 * ligne-marque scellée en `code` (visible, mais clairement technique).
 */
export function adfDepuisTexte(corps: string, empreinte: string): NoeudAdf {
  const lignes = corps.split('\n').map(paragraphe);
  lignes.push({
    type: 'paragraph',
    content: [{ type: 'text', text: ligneMarque(empreinte), marks: [{ type: 'code' }] }],
  });
  return { type: 'doc', version: 1, content: lignes } as NoeudAdf;
}

/** Texte plat d'un nœud ADF (concaténation récursive des `text`). */
export function texteAdf(noeud: unknown): string {
  if (!noeud || typeof noeud !== 'object') return '';
  const n = noeud as NoeudAdf;
  if (typeof n.text === 'string') return n.text;
  if (!Array.isArray(n.content)) return '';
  return n.content.map(texteAdf).join('\n');
}

/** Empreintes scellées dans une liste de commentaires Jira bruts. */
export function extraireEmpreintes(commentairesBruts: unknown): string[] {
  const liste = Array.isArray(commentairesBruts)
    ? commentairesBruts
    : ((commentairesBruts as { comments?: unknown[] } | undefined)?.comments ?? []);
  if (!Array.isArray(liste)) return [];
  const empreintes: string[] = [];
  for (const brut of liste) {
    const texte = texteAdf((brut as { body?: unknown } | undefined)?.body);
    for (const ligne of texte.split('\n')) {
      if (ligne.startsWith(MARQUEUR_PREFIXE)) empreintes.push(ligne.slice(MARQUEUR_PREFIXE.length).trim());
    }
  }
  return empreintes;
}
