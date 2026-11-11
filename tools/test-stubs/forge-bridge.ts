/**
 * Doublure de `@forge/bridge` pour les tests de rendu des écrans (§AUDIT 4, 37).
 *
 * Le vrai module lève à l'import hors plateforme (`BridgeAPIError : Unable to
 * establish a connection with the Custom UI bridge`) : ce bouchon remplace
 * `invoke` par une fonction contrôlable, consignée, sans aucun réseau. Chaque
 * test injecte le comportement qu'il veut observer, puis lit l'historique.
 */

/** Réponse attendue par `invoke` : valeur, promesse, ou fonction paresseuse. */
export type ReponseInvoke = unknown | Promise<unknown> | (() => unknown | Promise<unknown>);

/** Comportement injecté : reçoit le resolver et la charge utile de chaque appel. */
export type ComportementInvoke = (
  resolver: string,
  payload?: unknown,
) => ReponseInvoke;

/** Un appel consigné : le resolver et la charge utile, tels que l'écran les envoie. */
export interface AppelInvoke {
  resolver: string;
  payload: unknown;
}

let comportement: ComportementInvoke | undefined;
let historique: AppelInvoke[] = [];

/** `invoke` bouché — signature compatible avec `@forge/bridge`. */
export function invoke(resolver: string, payload?: unknown): Promise<unknown> {
  const appel = { resolver, payload };
  historique.push(appel);
  if (!comportement) {
    return Promise.reject(
      new Error(`bouchon @forge/bridge : aucun comportement défini pour « ${resolver} »`),
    );
  }
  return Promise.resolve().then(() => comportement!(resolver, payload));
}

/** Définit le comportement du prochain (et des suivants) `invoke`. */
export function bouchonInvoke(prochain: ComportementInvoke): void {
  comportement = prochain;
}

/** Les appels que l'écran a réellement émis, dans l'ordre. */
export function appelsInvoke(): AppelInvoke[] {
  return historique.map((appel) => ({ ...appel }));
}

/** Vide l'historique et le comportement, avant chaque scénario. */
export function reinitialiserInvoke(): void {
  historique = [];
  comportement = undefined;
}