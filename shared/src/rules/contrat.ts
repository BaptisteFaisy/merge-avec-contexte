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
export const EMPREINTE_CONTRAT = 'e994386baab07d0a8553661ae3a6424989929f5eeadb3d05ba01892e8d468d24';
