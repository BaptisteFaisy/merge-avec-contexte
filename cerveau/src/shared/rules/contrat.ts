/**
 * Empreinte du contrat partagé (audit 79), régénérée par `npm run shared:sync`.
 *
 * Somme SHA-256 de l’arborescence `shared/src/` (chemins + contenus, triés),
 * ce module lui-même excepté (sinon l’empreinte serait circulaire). Les deux
 * apps l’embarquent via leur copie générée : la route `health` du Cerveau et
 * le modèle des réglages du Capteur la renvoient, pour qu’un écart de version
 * de contrat entre les deux déploiements soit visible d’un coup d’œil.
 *
 * **Ne pas modifier à la main** : `scripts/shared-sync.mjs` l’écrit, et
 * `npm run shared:check` vérifie qu’elle correspond au contenu courant.
 */
export const EMPREINTE_CONTRAT = 'c7f2722418b7d8a79f6b3eb8f041bc435416dfa25fb32fe968987359137fdc3c';
