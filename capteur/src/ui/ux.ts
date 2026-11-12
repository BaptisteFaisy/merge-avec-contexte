/**
 * Textes et aides d'expérience utilisateur des écrans du Capteur (§12).
 *
 * Extrait de `view-models.ts` pour rester sous la limite de taille par fichier
 * (`docs/CONVENTIONS.md` §3). Module **pur** : aucun import Forge, aucune heure.
 *
 * - Item 102 : messages d'erreur qui distinguent « non jumelé », « Cerveau
 *   injoignable » et « base indisponible », chacun avec la marche à suivre.
 * - Item 98 : état vide expliqué de la page de réglages quand l'espace n'est pas
 *   encore jumelé (dire quoi faire plutôt qu'afficher des réglages sans effet).
 */
import type { Locale } from '../shared/types';

/** Item 102 : les trois situations d'échec que le Capteur sait nommer. */
export type EspeceErreurCapteur = 'non-jumele' | 'injoignable' | 'base-indisponible';

const TEXTES_ERREUR: Record<EspeceErreurCapteur, { fr: string; en: string }> = {
  'non-jumele': {
    fr: 'Espace non jumelé : cet espace Bitbucket n’est relié à aucun site Jira. Ouvrez les réglages de l’espace de travail, générez un code côté Jira puis saisissez-le ici.',
    en: 'Workspace not paired: this Bitbucket workspace is linked to no Jira site. Open the workspace settings, generate a code in Jira, then enter it here.',
  },
  'injoignable': {
    fr: 'Cerveau injoignable : le site Jira ne répond pas. Vérifiez le jumelage dans les réglages de l’espace de travail puis relancez le contrôle ; la politique de repli s’applique entre-temps.',
    en: 'Brain unreachable: the Jira site is not responding. Check the pairing in the workspace settings then run the check again; the fallback policy applies meanwhile.',
  },
  'base-indisponible': {
    fr: 'Base indisponible : le stockage de l’extension ne répond pas. Réessayez dans un instant ; si l’échec persiste, l’administrateur doit vérifier le stockage Forge.',
    en: 'Storage unavailable: the app storage is not responding. Retry in a moment; if it keeps failing, the administrator must check the Forge storage.',
  },
};

/**
 * Message d'erreur lisible du Capteur, avec la marche à suivre (item 102).
 * Distingue « non jumelé », « Cerveau injoignable » et « base indisponible ».
 */
export function messageErreurCapteur(espece: EspeceErreurCapteur, locale: Locale = 'fr'): string {
  return TEXTES_ERREUR[espece][locale];
}

const ETAT_VIDE_REGLAGES = {
  titre: {
    fr: 'Aucun jumelage pour cet espace',
    en: 'No pairing for this workspace',
  },
  texte: {
    fr: 'Cet espace Bitbucket n’est relié à aucun site Jira, donc aucun contrôle ne s’applique encore. Générez un code dans les réglages du projet Jira, saisissez-le ci-dessous puis enregistrez pour activer les contrôles.',
    en: 'This Bitbucket workspace is linked to no Jira site, so no check applies yet. Generate a code in the Jira project settings, enter it below, then save to enable the checks.',
  },
};

/**
 * Item 98 : état vide de la page de réglages, ou `undefined` si l'espace est
 * jumelé. Le modèle de vue l'injecte dans `ReglagesVm.etatVide`.
 */
export function etatVideReglages(jumele: boolean, locale: Locale = 'fr'): { titre: string; texte: string } | undefined {
  if (jumele) return undefined;
  return { titre: ETAT_VIDE_REGLAGES.titre[locale], texte: ETAT_VIDE_REGLAGES.texte[locale] };
}
