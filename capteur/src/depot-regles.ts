/**
 * Règles du dépôt (MC-17, §23) : lecture et analyse de `.merge-context.yml`.
 *
 * Le fichier vit à la racine du dépôt, versionné avec le code. Il est relu
 * comme le reste du code et **borné par les règles de l'organisation** : le
 * Capteur en fait une proposition de durcissement, le Cerveau la compose avec
 * les réglages de l'espace sans jamais s'affaiblir (voir `shared/rules/depot.ts`).
 *
 * Le format supporté est un **sous-ensemble** de YAML, documenté dans
 * `docs/REGLES-DANS-LE-DEPOT.md` : une liste `rules:` de tables simples, des
 * scalaires et des listes de scalaires. Aucun analyseur général n'est requis —
 * et aucune dépendance n'est ajoutée à l'app (voir la justification dans la
 * PR). Un fichier absent, illisible ou mal formé ne fait jamais échouer le
 * contrôle : l'analyse rend `{ ok: false, motif }` et l'appelant l'ignore.
 */
import type { DepotRule } from './shared/rules/depot';
import { RULE_CODES } from './shared/rules/catalog';
import type { Level, RuleMode } from './shared/types';

/** Nom du fichier de règles, à la racine du dépôt (§23). */
export const FICHIER_REGLES_DEPOT = '.merge-context.yml';

/** Niveaux acceptés dans le fichier. */
const NIVEAUX: Level[] = ['information', 'warning', 'blocking'];
/** Modes acceptés dans le fichier. */
const MODES: RuleMode[] = ['active', 'observe'];

export interface AnalyseDepot {
  ok: true;
  /** Règles retenues, dans l'ordre du fichier. */
  regles: DepotRule[];
  /** Motifs des entrées écartées (code ou forme invalide), pour le journal. */
  ecartees: string[];
}

export type ResultatAnalyse = AnalyseDepot | { ok: false; motif: string };

/** Erreur de forme du fichier : le contrôle ne doit pas échouer pour autant. */
class ErreurYaml extends Error {}

/** Une ligne utile : son indentation et son texte (commentaires retirés). */
interface Ligne {
  indent: number;
  texte: string;
}

/** Valeur lue dans le fichier : scalaire, liste ou table. */
type Valeur = string | number | boolean | null | Valeur[] | { [cle: string]: Valeur };

/** Position courante dans la liste des lignes. */
interface Curseur {
  i: number;
}

/** Retire le commentaire d'une ligne (`#` précédé d'un espace, ou en tête). */
function sansCommentaire(ligne: string): string {
  for (let i = 0; i < ligne.length; i += 1) {
    if (ligne[i] !== '#') continue;
    if (i === 0 || ligne[i - 1] === ' ' || ligne[i - 1] === '\t') return ligne.slice(0, i);
  }
  return ligne;
}

/** Lignes utiles du fichier : indentation et texte, commentaires et vides retirés. */
function lignesUtiles(texte: string): Ligne[] {
  const lignes: Ligne[] = [];
  for (const brute of texte.split('\n')) {
    const sansComment = sansCommentaire(brute.replace(/\r$/, ''));
    const contenu = sansComment.trim();
    if (contenu.length === 0) continue;
    const indent = sansComment.length - sansComment.trimStart().length;
    lignes.push({ indent, texte: contenu });
  }
  return lignes;
}

/** Découpe `cle: valeur` ; `undefined` si la ligne n'est pas un couple. */
function couple(texte: string): { cle: string; valeur?: string } | undefined {
  const i = texte.indexOf(':');
  if (i < 0) return undefined;
  const cle = texte.slice(0, i).trim();
  if (cle.length === 0) return undefined;
  const reste = texte.slice(i + 1).trim();
  return { cle, valeur: reste.length > 0 ? reste : undefined };
}

/** Scalaire : nombre, booléen, ou texte (guillemets retirés s'il y en a). */
function scalaire(texte: string): Valeur {
  const t = texte.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+$/.test(t)) return Number(t);
  if (t.length > 1 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return t.slice(1, -1);
  }
  return t;
}

/** Lit une table (`cle: valeur`) à l'indentation donnée. */
function lireTable(lignes: Ligne[], c: Curseur, indent: number): Record<string, Valeur> {
  const table: Record<string, Valeur> = {};
  while (c.i < lignes.length) {
    const ligne = lignes[c.i];
    if (ligne.indent !== indent || ligne.texte.startsWith('-')) break;
    const cple = couple(ligne.texte);
    if (!cple) throw new ErreurYaml(`ligne illisible : « ${ligne.texte} »`);
    c.i += 1;
    table[cple.cle] = cple.valeur !== undefined ? scalaire(cple.valeur) : lireEnfant(lignes, c, indent);
  }
  return table;
}

/** Lit la valeur imbriquée d'une clé sans valeur : le bloc qui suit, s'il existe. */
function lireEnfant(lignes: Ligne[], c: Curseur, indent: number): Valeur {
  if (c.i >= lignes.length) return null;
  const suivante = lignes[c.i];
  if (suivante.indent <= indent) return null;
  return lireNoeud(lignes, c, suivante.indent);
}

/** Lit une liste (`- valeur`) à l'indentation donnée. */
function lireListe(lignes: Ligne[], c: Curseur, indent: number): Valeur[] {
  const items: Valeur[] = [];
  while (c.i < lignes.length) {
    const ligne = lignes[c.i];
    if (ligne.indent !== indent || !ligne.texte.startsWith('-')) break;
    const corps = ligne.texte.slice(1);
    const contenu = corps.replace(/^\s+/, '');
    const colonne = indent + 1 + (corps.length - contenu.length);
    c.i += 1;
    if (contenu.length === 0) {
      items.push(lireEnfant(lignes, c, indent));
      continue;
    }
    const cple = couple(contenu);
    if (!cple) {
      items.push(scalaire(contenu));
      continue;
    }
    const table: Record<string, Valeur> = {};
    table[cple.cle] = cple.valeur !== undefined ? scalaire(cple.valeur) : lireEnfant(lignes, c, colonne);
    items.push({ ...table, ...lireTable(lignes, c, colonne) });
  }
  return items;
}

/** Lit le nœud courant : table ou liste, selon la ligne. */
function lireNoeud(lignes: Ligne[], c: Curseur, indent: number): Valeur {
  if (c.i >= lignes.length) return null;
  const ligne = lignes[c.i];
  if (ligne.indent !== indent) throw new ErreurYaml('indentation inattendue');
  if (ligne.texte.startsWith('-')) return lireListe(lignes, c, indent);
  return lireTable(lignes, c, indent);
}

/** Liste de textes (paramètres `repositories`, `branches`) ou `undefined`. */
function listeDeTextes(valeur: Valeur): string[] | undefined {
  if (!Array.isArray(valeur)) return undefined;
  const textes = valeur.filter((item): item is string => typeof item === 'string');
  return textes.length === valeur.length ? textes : undefined;
}

/** Table simple (`scope`, `params`) ou `undefined`. */
function tableDe(valeur: Valeur): Record<string, Valeur> | undefined {
  if (typeof valeur !== 'object' || valeur === null || Array.isArray(valeur)) return undefined;
  return valeur;
}

/** Convertit une entrée brute du fichier en règle de dépôt, ou en motif d'écart. */
function convertirRegle(brut: Valeur): { regle?: DepotRule; motif?: string } {
  const table = tableDe(brut);
  if (!table) return { motif: 'entrée de règle illisible' };
  const code = table.code;
  if (typeof code !== 'string' || !(RULE_CODES as string[]).includes(code)) {
    return { motif: `code de règle inconnu : « ${String(code)} »` };
  }
  const level = table.level;
  if (typeof level !== 'string' || !NIVEAUX.includes(level as Level)) {
    return { motif: `niveau inconnu pour ${code} : « ${String(level)} »` };
  }
  const mode = table.mode;
  if (mode !== undefined && (typeof mode !== 'string' || !MODES.includes(mode as RuleMode))) {
    return { motif: `mode inconnu pour ${code} : « ${String(mode)} »` };
  }
  const scope = table.scope === undefined ? undefined : tableDe(table.scope);
  const repositories = scope ? listeDeTextes(scope.repositories) : undefined;
  const branches = scope ? listeDeTextes(scope.branches) : undefined;
  const params = table.params === undefined ? undefined : tableDe(table.params);
  const regle: DepotRule = {
    code: code as DepotRule['code'],
    level: level as Level,
    mode: mode === undefined ? 'active' : (mode as RuleMode),
    scope: { ...(repositories ? { repositories } : {}), ...(branches ? { branches } : {}) },
    params: params ? { ...params } : undefined,
  };
  return { regle };
}

/**
 * Analyse `.merge-context.yml`. Rend les règles retenues, ou `{ ok: false }`
 * avec un motif si le fichier est mal formé : l'appelant l'ignore et le
 * journalise, le contrôle n'échoue jamais (audit 20, §23).
 */
export function analyserReglesDepot(texte: string): ResultatAnalyse {
  const lignes = lignesUtiles(texte);
  if (lignes.length === 0) return { ok: true, regles: [], ecartees: [] };
  const curseur: Curseur = { i: 0 };
  let document: Valeur;
  try {
    document = lireNoeud(lignes, curseur, lignes[0].indent);
  } catch (err) {
    const motif = err instanceof Error ? err.message : 'fichier illisible';
    return { ok: false, motif };
  }
  if (curseur.i < lignes.length) return { ok: false, motif: 'contenu inattendu en fin de fichier' };
  const table = tableDe(document);
  const brutes = table ? table.rules : undefined;
  if (brutes === undefined) return { ok: true, regles: [], ecartees: [] };
  if (!Array.isArray(brutes)) return { ok: false, motif: 'la clé « rules » doit être une liste' };
  const regles: DepotRule[] = [];
  const ecartees: string[] = [];
  for (const brut of brutes) {
    const conversion = convertirRegle(brut);
    if (conversion.regle) regles.push(conversion.regle);
    else if (conversion.motif) ecartees.push(conversion.motif);
  }
  return { ok: true, regles, ecartees };
}
