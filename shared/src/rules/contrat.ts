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
export const EMPREINTE_CONTRAT = '0cacae52717559ee3358313e4f8c02165c2f642fc8db344fce2b8e64618b8aa0';
