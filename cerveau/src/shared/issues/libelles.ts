/**
 * Normalisation des libellés Jira.
 *
 * Un site Jira nomme ses statuts et ses liens dans sa langue : « En cours »,
 * « In Progress », « bloque par », « is blocked by ». Comparer ces libellés
 * tels quels rend la règle dépendante de la langue du site ; les normaliser
 * (casse et accents effacés) rend la comparaison insensible à la façon dont
 * le site écrit ses libellés.
 */

/** Minuscules, accents retirés, espaces réduits à un seul. */
export function normaliserLibelle(valeur: string): string {
  return valeur
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Mots d'un libellé normalisé (séparateurs et ponctuation deviennent des espaces). */
export function motsDuLibelle(valeur: string): string[] {
  return normaliserLibelle(valeur)
    .split(/[^a-z0-9]+/)
    .filter((mot) => mot.length > 0);
}
