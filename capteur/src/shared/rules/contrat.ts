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
export const EMPREINTE_CONTRAT = '9ba079a18f4f05914b1c10de2ae1014a0ee66feb1a3f34ad6fd4db7a7f65e3b0';
