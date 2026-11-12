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
  'reglages.projet': { fr: 'Projet : {cle}', en: 'Project: {cle}' },
  'portee.depots.label': { fr: 'Dépôts (motifs glob)', en: 'Repositories (glob patterns)' },
  'portee.branches.label': { fr: 'Branches (motifs glob)', en: 'Branches (glob patterns)' },
  'portee.aide': {
    fr: 'Motifs séparés par des virgules ; vide = partout.',
    en: 'Patterns separated by commas; empty = everywhere.',
  },
  'parametres.aide': {
    fr: 'Paramètres de la règle, tels que le catalogue les définit.',
    en: 'Rule parameters, as the catalog defines them.',
  },
  'param.label.keyPattern': { fr: 'Motif de clé', en: 'Key pattern' },
  'param.label.branchExceptions': { fr: 'Branches exemptées', en: 'Exempt branches' },
  'param.label.allowedStatuses': { fr: 'Statuts autorisés', en: 'Allowed statuses' },
  'param.label.source': { fr: 'Source des critères', en: 'Criteria source' },
  'param.label.fieldId': { fr: 'Identifiant du champ', en: 'Field identifier' },
  'param.label.jsmProjects': { fr: 'Projets JSM', en: 'JSM projects' },
  'param.label.mappingSource': { fr: 'Source de correspondance', en: 'Mapping source' },
  'param.label.linkTypes': { fr: 'Types de liens', en: 'Link types' },
  'param.label.branches': { fr: 'Branches', en: 'Branches' },
  'param.label.days': { fr: 'Jours calmes', en: 'Quiet days' },
  'param.label.startHour': { fr: 'Heure de début', en: 'Start hour' },
  'param.label.endHour': { fr: 'Heure de fin', en: 'End hour' },
  'param.label.timezone': { fr: 'Fuseau horaire', en: 'Time zone' },
  'param.label.label': { fr: 'Étiquette', en: 'Label' },
  'param.label.teamSource': { fr: 'Source de l’équipe', en: 'Team source' },
  'param.label.pathPatterns': { fr: 'Chemins sensibles', en: 'Sensitive paths' },
  'param.label.planLabel': { fr: 'Étiquette du plan', en: 'Plan label' },
  'param.label.deliveredStatuses': { fr: 'Statuts livrés', en: 'Delivered statuses' },
  'gel.etat.active': { fr: 'En cours', en: 'Active' },
  'gel.etat.upcoming': { fr: 'À venir', en: 'Upcoming' },
  'gel.etat.past': { fr: 'Terminé', en: 'Ended' },
  'gel.recurrence.none': { fr: 'Aucune', en: 'None' },
  'gel.recurrence.daily': { fr: 'Quotidienne', en: 'Daily' },
  'gel.recurrence.weekly': { fr: 'Hebdomadaire', en: 'Weekly' },
  'gel.jour.0': { fr: 'dim.', en: 'Sun' },
  'gel.jour.1': { fr: 'lun.', en: 'Mon' },
  'gel.jour.2': { fr: 'mar.', en: 'Tue' },
  'gel.jour.3': { fr: 'mer.', en: 'Wed' },
  'gel.jour.4': { fr: 'jeu.', en: 'Thu' },
  'gel.jour.5': { fr: 'ven.', en: 'Fri' },
  'gel.jour.6': { fr: 'sam.', en: 'Sat' },
  'gel.titre': { fr: 'Gels', en: 'Freezes' },
  'gel.aide': {
    fr: 'Heures locales du fuseau choisi ; une récurrence répète la fenêtre chaque jour ou chaque semaine.',
    en: 'Local time in the chosen time zone; a recurrence repeats the window every day or every week.',
  },
  'gel.nom': { fr: 'Nom du gel', en: 'Freeze name' },
  'gel.debut': { fr: 'Début (AAAA-MM-JJ)', en: 'Start (YYYY-MM-DD)' },
  'gel.heureDebut': { fr: 'Heure de début (HH:MM)', en: 'Start time (HH:MM)' },
  'gel.fin': { fr: 'Fin (AAAA-MM-JJ)', en: 'End (YYYY-MM-DD)' },
  'gel.heureFin': { fr: 'Heure de fin (HH:MM)', en: 'End time (HH:MM)' },
  'gel.branches': { fr: 'Branches (motifs glob)', en: 'Branches (glob patterns)' },
  'gel.services': { fr: 'Services', en: 'Services' },
  'gel.recurrence': { fr: 'Récurrence', en: 'Recurrence' },
  'gel.jours': { fr: 'Jours de la semaine (0 = dimanche)', en: 'Days of the week (0 = Sunday)' },
  'gel.fuseau': { fr: 'Fuseau horaire (IANA)', en: 'Time zone (IANA)' },
  'gel.creer': { fr: 'Créer le gel', en: 'Create the freeze' },
  'gel.supprimer': { fr: 'Supprimer', en: 'Delete' },
  'gel.supprimerConsequence': {
    fr: 'Le gel « {nom} » sera retiré du calendrier : les fusions ne seront plus bloquées par cette fenêtre.',
    en: 'The freeze “{nom}” will be removed from the calendar: merges will no longer be blocked by this window.',
  },
  'gel.aucun': { fr: 'Aucun gel enregistré.', en: 'No freeze recorded.' },
  'gel.fenetres': { fr: '{debut} → {fin}', en: '{debut} → {fin}' },
  'gel.branchesLabel': { fr: 'Branches : {list}', en: 'Branches: {list}' },
  'gel.servicesLabel': { fr: 'Services : {list}', en: 'Services: {list}' },
  'gel.toutesBranches': { fr: 'Toutes les branches', en: 'All branches' },
  'gel.tousServices': { fr: 'Tous les services', en: 'All services' },
  'approbateurs.aide': {
    fr: 'Annuaire de ce projet : un approbateur n’habilite que les dérogations de ce projet.',
    en: 'Directory of this project: an approver only authorizes waivers of this project.',
  },
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

/**
 * Langue demandée par l'utilisateur ou le site (item 97, §16) : `fr` ou `en`
 * quand le code reçu commence par l'une des deux langues supportées
 * (`fr-FR`, `en-GB`…), `undefined` sinon — l'appelant retombe alors sur la
 * langue de la configuration. Fonction pure : aucune lecture de contexte.
 */
export function localeDemandee(valeur: unknown): Locale | undefined {
  if (typeof valeur !== 'string') return undefined;
  const langue = valeur.trim().toLowerCase();
  if (langue.startsWith('fr')) return 'fr';
  if (langue.startsWith('en')) return 'en';
  return undefined;
}

/** Langue effective des écrans : celle demandée si elle est connue, sinon le repli. */
export function localeEffective(demandee: unknown, repli: Locale): Locale {
  return localeDemandee(demandee) ?? repli;
}

/** Libellé d'un paramètre de règle : son nom traduit si le dictionnaire le connaît. */
export function libelleParam(name: string, locale: Locale): string {
  const cle = `param.label.${name}`;
  if (!(cle in TEXTES)) return name;
  return texte(locale, cle as CleTexte);
}

/** Les trois récurrences de gel, dans l'ordre du formulaire. */
export function optionsRecurrence(locale: Locale): Option<'none' | 'daily' | 'weekly'>[] {
  return (['none', 'daily', 'weekly'] as const).map((value) => ({
    value,
    label: texte(locale, `gel.recurrence.${value}`),
  }));
}

/** Libellé d'un jour de semaine (0 = dimanche), pour la récurrence hebdomadaire. */
export function libelleJour(jour: number, locale: Locale): string {
  if (!Number.isInteger(jour) || jour < 0 || jour > 6) return String(jour);
  return texte(locale, `gel.jour.${jour}` as CleTexte);
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
