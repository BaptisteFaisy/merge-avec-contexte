/**
 * Correspondance de motifs glob, partagée par les portées de règles, les gels
 * et les chemins de fichiers.
 *
 * Motifs supportés : `*` (tout sauf `/`), `**` (tout, séparateurs compris),
 * `?` (un caractère). Un motif sans joker est comparé en égalité stricte.
 */

/** Échappe les caractères spéciaux d'une expression rationnelle. */
function echapper(texte: string): string {
  return texte.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

/** Traduit un motif glob en expression rationnelle ancrée. */
export function globToRegExp(motif: string): RegExp {
  let source = '';
  for (let i = 0; i < motif.length; i += 1) {
    const caractere = motif[i] ?? '';
    if (caractere === '*') {
      if (motif[i + 1] === '*') {
        source += '.*';
        i += 1;
        if (motif[i + 1] === '/') i += 1;
      } else {
        source += '[^/]*';
      }
      continue;
    }
    if (caractere === '?') {
      source += '[^/]';
      continue;
    }
    source += echapper(caractere);
  }
  return new RegExp(`^${source}$`);
}

/** Vrai si la valeur correspond au motif. */
export function globMatch(motif: string, valeur: string): boolean {
  if (!motif.includes('*') && !motif.includes('?')) return motif === valeur;
  return globToRegExp(motif).test(valeur);
}

/** Vrai si la valeur correspond à l'un des motifs (liste vide = toujours vrai). */
export function globMatchAny(motifs: string[] | undefined, valeur: string): boolean {
  if (!motifs || motifs.length === 0) return true;
  return motifs.some((motif) => globMatch(motif, valeur));
}
