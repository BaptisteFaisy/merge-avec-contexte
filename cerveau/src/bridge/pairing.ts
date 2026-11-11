/**
 * Jumelage du Cerveau et du Capteur (§13.3, MC-01).
 *
 * L'administrateur Jira génère un code à usage unique valable dix minutes ;
 * l'administrateur Bitbucket le saisit ; le Capteur appelle alors la route
 * `pair` du pont, qui rend le secret partagé. Un nouveau jumelage remplace le
 * secret : l'ancien ne signe plus rien.
 *
 * C'est donc aussi la **procédure de rotation en cas de fuite du secret** :
 * nouvelle offre, nouveau jumelage, ancien secret invalidé de fait (plus aucun
 * jumelage actif ne le porte). La marche à suivre détaillée est documentée dans
 * l'en-tête du module `handler.ts` (item 52).
 */
import {
  consumePairingOffer,
  createPairingOffer,
  generateSharedSecret,
  normalizePairingCode,
  type PairingOffer,
} from '../shared';
import type { BridgeDeps, PairingOutcome } from './deps';

/** Refus explicite d'un jumelage, avec sa raison. */
export type PairingRefusal = 'expired' | 'used' | 'mismatch';

/** Message lisible d'un refus : rien ne révèle si le code a existé. */
const MESSAGES: Record<PairingRefusal, string> = {
  expired: 'Code de jumelage expiré.',
  used: 'Code de jumelage déjà utilisé.',
  mismatch: 'Code de jumelage inconnu.',
};

/**
 * Crée une offre de jumelage : un code à usage unique, valable dix minutes.
 *
 * L'offre est déposée telle quelle ; c'est le Capteur qui la consomme, en
 * appelant la route `pair` avec le code.
 */
export async function creerOffre(deps: BridgeDeps): Promise<PairingOffer> {
  const offer = createPairingOffer({
    siteUrl: deps.config.siteUrl,
    createdBy: deps.config.adminAccountId,
    now: deps.clock(),
  });
  await deps.pairing.saveOffer(offer);
  deps.logger.info('Pont : offre de jumelage créée', { expiresAt: offer.expiresAt });
  return offer;
}

/**
 * Consomme le code et enregistre le jumelage.
 *
 * Renvoie le secret partagé au Capteur, ou le refus : `expired`, `used` ou
 * `mismatch`. Un refus ne consomme pas l'offre : un code faux laisse
 * l'administrateur recommencer jusqu'à l'expiration.
 */
export async function jumeler(
  code: string,
  workspaceUuid: string,
  deps: BridgeDeps,
): Promise<PairingOutcome> {
  const now = deps.clock();
  const normalise = normalizePairingCode(code);
  const offre = await deps.pairing.findOffer(normalise);
  if (!offre) {
    deps.logger.info('Pont : code de jumelage inconnu', { workspaceUuid });
    return { ok: false, reason: 'mismatch' };
  }
  const consommation = consumePairingOffer(offre, code, now);
  if (!consommation.ok) {
    deps.logger.info('Pont : code de jumelage refusé', { reason: consommation.reason });
    return { ok: false, reason: consommation.reason };
  }
  const secret = generateSharedSecret();
  await deps.pairing.savePairing({
    workspaceUuid,
    secret,
    siteUrl: offre.siteUrl,
    pairedAt: now,
  });
  await deps.pairing.markOfferUsed(normalise);
  deps.logger.info('Pont : jumelage enregistré', { workspaceUuid });
  return {
    ok: true,
    result: {
      secret,
      bridgeUrl: deps.config.bridgeUrl,
      siteUrl: offre.siteUrl,
      pairedAt: now,
    },
  };
}

/** Message public d'un refus de jumelage. */
export function messageRefus(reason: PairingRefusal): string {
  return MESSAGES[reason];
}
