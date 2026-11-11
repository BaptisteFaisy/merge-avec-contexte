/**
 * Utilitaires partagés par les tests de rendu des écrans (aucune duplication
 * entre les deux apps). Aucune dépendance Forge, aucun réseau, horloge absente.
 */

/** Promesse pilotable : utile pour figer l'état « chargement » d'un écran. */
export interface PromesseRetardee<T> {
  promesse: Promise<T>;
  resoudre: (valeur: T) => void;
  rejeter: (erreur: unknown) => void;
}

/** Crée une promesse que le test résout/rejette à la main. */
export function promesseRetardee<T>(): PromesseRetardee<T> {
  let resoudre!: (valeur: T) => void;
  let rejeter!: (erreur: unknown) => void;
  const promesse = new Promise<T>((ok, ko) => {
    resoudre = ok;
    rejeter = ko;
  });
  return { promesse, resoudre, rejeter };
}

/** Active le mode « act » de React 18 pour éviter les avertissements. */
export function activerEnvironnementReact(): void {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
}