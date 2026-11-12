/**
 * Bascule en masse du mode observation (audit 25, §7.3).
 *
 * §7.3 décrit la sortie du mode observation : « elle active la règle en
 * avertissement partout, en bloquant sur ce dépôt ». Cette fonction en est la
 * logique pure : elle prend un code de règle, le niveau voulu partout, une
 * portée à rendre bloquante, et l'ensemble des réglages existants ; elle rend
 * les réglages résultants. L'écran qui l'appelle est un autre lot : elle est
 * exposée, testée, et n'importe rien de Forge ni d'UI.
 *
 * Modèle : une règle peut porter plusieurs réglages de portées différentes (le
 * moteur les évalue tous, la plus stricte l'emporte). La bascule pose donc un
 * réglage « partout » au niveau cible, plus un réglage « sur la portée » en
 * bloquant. Sans portée, seul le réglage « partout » est posé.
 */
import type { Level, RuleConfig, RuleMode, RuleScope } from '../types';
import type { RuleCode } from '../types';

/** Vrai si la portée demande au moins un dépôt ou une branche. */
function porteeNonVide(portee: RuleScope | undefined): boolean {
  if (!portee) return false;
  return (portee.repositories?.length ?? 0) > 0 || (portee.branches?.length ?? 0) > 0;
}

/** Paramètres conservés depuis le réglage « partout » existant, sinon le premier. */
function paramsExistants(configs: readonly RuleConfig[], code: RuleCode): Record<string, unknown> {
  const partout = configs.find(
    (c) => c.rule === code && (c.scope.repositories?.length ?? 0) === 0 && (c.scope.branches?.length ?? 0) === 0,
  );
  const premier = configs.find((c) => c.rule === code);
  return { ...((partout ?? premier)?.params ?? {}) };
}

/**
 * Rend les réglages après bascule en masse d'une règle.
 *
 * - Les réglages des **autres** règles sont conservés tels quels.
 * - Les réglages existants de `code` sont remplacés par un réglage « partout »
 *   (`scope` vide) au niveau `niveauCible`, mode actif.
 * - Si `porteeBloquante` est non vide, un réglage « bloquant sur cette portée »
 *   est ajouté (§7.3 : avertissement partout, bloquant sur ce dépôt).
 *
 * Fonction pure : ne modifie pas `configs`, rend une nouvelle liste.
 */
export function basculeMasse(
  configs: readonly RuleConfig[],
  code: RuleCode,
  niveauCible: Level,
  porteeBloquante?: RuleScope,
): RuleConfig[] {
  const autres = configs.filter((c) => c.rule !== code);
  const params = paramsExistants(configs, code);
  const mode: RuleMode = 'active';
  const partout: RuleConfig = { rule: code, level: niveauCible, mode, scope: {}, params };
  const resultat: RuleConfig[] = [...autres, partout];
  if (porteeNonVide(porteeBloquante)) {
    resultat.push({ rule: code, level: 'blocking', mode, scope: { ...porteeBloquante }, params });
  }
  return resultat;
}
