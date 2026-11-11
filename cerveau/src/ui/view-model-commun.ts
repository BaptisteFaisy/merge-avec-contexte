/**
 * Fragments partagés par les modèles de vue des écrans Jira (§12).
 *
 * Les libellés de niveau, de mode, de verdict et de portée n'ont pas de clé dans
 * `shared/src/message/strings.ts` (ce fichier appartient au socle) : ils sont
 * tenus ici, en français et en anglais. Les titres de règles, eux, viennent du
 * catalogue (`descriptorFor(code).titleKey`), donc d'une seule source.
 *
 * Module **pur** : aucun import Forge, aucune lecture d'heure.
 */
import type { Level, Locale, Reason, RuleMode, Verdict } from '../shared/types';

interface Traduction {
  fr: string;
  en: string;
}

const TEXTES = {
  'niveau.blocking': { fr: 'Bloquant', en: 'Blocking' },
  'niveau.warning': { fr: 'Avertissement', en: 'Warning' },
  'niveau.information': { fr: 'Information', en: 'Information' },
  'mode.active': { fr: 'Actif', en: 'Active' },
  'mode.observe': { fr: 'Observation', en: 'Observation' },
  'verdict.blocked': { fr: 'Bloqué', en: 'Blocked' },
  'verdict.allowed': { fr: 'Autorisé', en: 'Allowed' },
  'verdict.inconclusive': { fr: 'Non concluant', en: 'Inconclusive' },
  'portee.tout': { fr: 'Tous les dépôts, toutes les branches', en: 'All repositories, all branches' },
  'portee.depots': { fr: 'Dépôts : {list}', en: 'Repositories: {list}' },
  'portee.branches': { fr: 'Branches : {list}', en: 'Branches: {list}' },
  'jumelage.paired': { fr: 'Jumelé avec Bitbucket', en: 'Paired with Bitbucket' },
  'jumelage.unpaired': { fr: 'Non jumelé', en: 'Not paired' },
  'jumelage.code-pending': { fr: 'Code de jumelage en attente', en: 'Pairing code pending' },
  'repli.open': { fr: 'Ouvert : la fusion reste possible', en: 'Open: the merge stays possible' },
  'repli.closed': { fr: 'Fermé : la fusion est bloquée', en: 'Closed: the merge is blocked' },
  'derogation.sansEcheance': { fr: 'sans échéance', en: 'no expiry' },
  'param.oui': { fr: 'oui', en: 'yes' },
  'param.non': { fr: 'non', en: 'no' },
} satisfies Record<string, Traduction>;

export type CleTexte = keyof typeof TEXTES;

/** Rend un libellé de ce module, avec ses `{param}`. */
export function texte(locale: Locale, cle: CleTexte, params: Record<string, string | number> = {}): string {
  return TEXTES[cle][locale].replace(/\{(\w+)\}/g, (motif, nom: string) =>
    Object.prototype.hasOwnProperty.call(params, nom) ? String(params[nom]) : motif,
  );
}

/** Une option de `Select` : valeur brute à enregistrer, libellé à afficher. */
export interface Option<V extends string> {
  value: V;
  label: string;
}

const NIVEAUX: Level[] = ['blocking', 'warning', 'information'];
const MODES: RuleMode[] = ['active', 'observe'];

/** Les trois niveaux, dans l'ordre de gravité. */
export function optionsNiveau(locale: Locale): Option<Level>[] {
  return NIVEAUX.map((value) => ({ value, label: texte(locale, `niveau.${value}`) }));
}

/** Les deux modes, actif puis observation. */
export function optionsMode(locale: Locale): Option<RuleMode>[] {
  return MODES.map((value) => ({ value, label: texte(locale, `mode.${value}`) }));
}

/** Libellé d'un verdict, pour un badge ou un titre de section. */
export function libelleVerdict(locale: Locale, verdict: Verdict): string {
  return texte(locale, `verdict.${verdict}`);
}

/** Une raison prête à afficher : texte, marche à suivre, gravité. */
export interface VueRaison {
  text: string;
  action: string | null;
  level: Level;
}

/** Raisons mises à plat pour l'affichage : texte, marche à suivre, gravité. */
export function raisonsSimples(reasons: Reason[]): VueRaison[] {
  return reasons.map((raison) => ({
    text: raison.text,
    action: raison.action ?? null,
    level: raison.level,
  }));
}
