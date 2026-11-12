/**
 * Types de liens Jira : reconnaître un lien malgré la langue du site.
 *
 * Un site Jira nomme le lien bloquant « Blocks », « bloque », « bloqué par »
 * ou « is blocked by » selon sa langue et ses traditions. Comparer le nom
 * du lien à une liste de noms rend la règle muette sur un site qui écrit
 * autrement que le réglage : le lien est alors ignoré et la fusion passe.
 *
 * La comparaison retenue est donc double :
 *
 *  - **égalité des libellés normalisés** (casse et accents effacés) : le
 *    réglage d'origine continue de fonctionner tel quel ;
 *  - **appartenance à la même famille** : un réglage qui parle de blocage
 *    (« Blocks », « bloque par ») reconnaît tout lien de la famille
 *    bloquante, et un lien d'une autre famille (« Relates to », « Depends
 *    on ») n'est jamais reconnu.
 */
import { motsDuLibelle, normaliserLibelle } from '../shared';

/**
 * Familles de liens et leur vocabulaire.
 *
 * Chaque famille porte ses racines en anglais et en français : les racines
 * françaises sont sans accent, la normalisation les ayant déjà retirés.
 */
const FAMILLES = {
  bloquant: ['block', 'bloqu'],
  dependance: ['depend'],
} as const;

/** Famille de liens reconnue par une règle. */
export type FamilleLien = keyof typeof FAMILLES;

/** Vrai si le libellé dit la famille : un de ses mots commence par une racine. */
function ditLaFamille(libelle: string, famille: FamilleLien): boolean {
  const mots = motsDuLibelle(libelle);
  return mots.some((mot) => FAMILLES[famille].some((racine) => mot.startsWith(racine)));
}

/**
 * Vrai si un lien est du type configuré.
 *
 * @param configures Types réglés pour la règle (`linkTypes`).
 * @param type       Type du lien, tel que Jira le nomme sur le site.
 * @param famille    Famille à laquelle la règle s'intéresse.
 */
export function lienDeType(
  configures: readonly string[],
  type: string,
  famille: FamilleLien,
): boolean {
  const cible = normaliserLibelle(type);
  if (cible.length === 0) return false;
  return configures.some((entree) => {
    const config = normaliserLibelle(entree);
    if (config.length === 0) return false;
    if (config === cible) return true;
    return ditLaFamille(config, famille) && ditLaFamille(cible, famille);
  });
}
