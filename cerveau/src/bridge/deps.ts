/**
 * Ports du pont du Cerveau (§13.3).
 *
 * Le pont ne parle à personne d'autre qu'à travers ces ports : une base, un
 * cache Jira, un journal. Chaque implémentation réelle vit dans un adaptateur
 * (`storage/`, `jira/`) ; les tests fournissent des doublures en mémoire.
 * Aucun port n'est synchrone : tout ce que le pont attend peut casser, et
 * doit donc pouvoir échouer.
 */
import type {
  Evaluation,
  FallbackPolicy,
  Freeze,
  Locale,
  NonceStore,
  PairingOffer,
  PairResult,
  PrContext,
  RuleConfig,
  Waiver,
  WaiverDecisionPayload,
  WaiverRequestPayload,
} from '../shared';

export type { NonceStore };

/** Horloge injectée : horodatage ISO 8601. Jamais `Date.now()` ici. */
export type Clock = () => string;

/** Journalisation : le pont n'écrit jamais sur la sortie standard. */
export interface Logger {
  info(message: string, contexte?: Record<string, unknown>): void;
  error(message: string, contexte?: Record<string, unknown>): void;
}

/** Un jumelage actif : un espace de travail, un site Jira, un secret. */
export interface PairingRecord {
  workspaceUuid: string;
  /** Secret partagé courant : il remplace celui d'un jumelage précédent. */
  secret: string;
  /** Site Jira jumelé, atteint par les lectures de contexte. */
  siteUrl: string;
  pairedAt: string;
}

/**
 * Dépôt des offres et des jumelages.
 *
 * Une offre est à usage unique et valable dix minutes ; un jumelage porte le
 * secret partagé. Un nouveau jumelage remplace le secret et invalide l'ancien.
 */
export interface PairingRepository {
  /** Enregistre une offre de jumelage à usage unique. */
  saveOffer(offer: PairingOffer): Promise<void>;
  /** Offre correspondant à un code normalisé, si elle existe encore. */
  findOffer(code: string): Promise<PairingOffer | undefined>;
  /** Marque l'offre comme consommée : elle ne peut plus servir. */
  markOfferUsed(code: string): Promise<void>;
  /** Enregistre le jumelage et remplace le secret précédent. */
  savePairing(pairing: PairingRecord): Promise<void>;
  /** Jumelage actif d'un espace de travail, s'il y en a un. */
  pairingForWorkspace(workspaceUuid: string): Promise<PairingRecord | undefined>;
  /** Tous les jumelages actifs : sert à la vérification de signature. */
  pairings(): Promise<PairingRecord[]>;
  /** Politique de repli choisie par l'administrateur (§13.5). */
  fallbackPolicy(workspaceUuid: string): Promise<FallbackPolicy>;
}

/**
 * Contexte du projet, lu dans le site Jira jumelé.
 *
 * Le pont ne connaît ni Jira ni la base : il demande, et reçoit des données
 * déjà chargées. Les tickets et les incidents ne sont pas dans ce port :
 * `EvaluateService` les charge lui-même (§13.4, cache par ticket).
 */
export interface ContextRepository {
  /** Réglage des règles du projet (§14, `rule_config`). */
  rules(siteUrl: string): Promise<RuleConfig[]>;
  /** Service alimenté par le dépôt ; absent = correspondance inconnue. */
  serviceForRepository(siteUrl: string, repositoryUuid: string): Promise<string | undefined>;
  /** Gels déclarés sur le site. */
  freezes(siteUrl: string): Promise<Freeze[]>;
}

/** Dérogations : demander, décider, lister (§7.1, MC-07). */
export interface WaiverService {
  demander(demande: WaiverRequestPayload): Promise<Waiver>;
  decider(demande: WaiverDecisionPayload): Promise<Waiver>;
  lister(filtre: { prId?: number; repositoryUuid?: string }): Promise<Waiver[]>;
}

/**
 * Tout ce dont une évaluation a besoin, déjà chargé par le pont.
 *
 * Le pont rassemble le contexte (site, règles, service, gels, dérogations) ;
 * `EvaluateService` charge les tickets, puis applique les règles.
 */
export interface EvaluationInput {
  /** PR décrite par ses métadonnées (§13.3, sobriété). */
  pr: PrContext;
  /** Clés de tickets reconnues dans la PR, venues du Capteur. */
  issueKeys: string[];
  /** Site Jira jumelé : où lire les tickets. */
  siteUrl: string;
  /** Gels utiles à cette PR (branche ou service concernés). */
  freezes: Freeze[];
  /** Dérogations utiles à cette PR. */
  waivers: Waiver[];
  /** Service alimenté par le dépôt ; absent = correspondance inconnue. */
  service?: string;
  /** Réglage des règles du projet. */
  configs: RuleConfig[];
  /** Horodatage ISO injecté : rien ne lit l'heure. */
  now: string;
  locale: Locale;
  /** Politique de repli du site, appliquée si le contexte manque. */
  fallbackPolicy: FallbackPolicy;
}

/**
 * Service d'évaluation : implémenté ailleurs (moteur de règles), injecté ici.
 * Le pont ne connaît que sa signature.
 */
export type EvaluateService = (input: EvaluationInput) => Promise<Evaluation>;

/** Réglages de linstallation : URL du pont, version, langue par défaut. */
export interface BridgeConfig {
  /** URL du web trigger du Cerveau, remise au Capteur au jumelage. */
  bridgeUrl: string;
  /** Version du pont, annoncée par la route `health`. */
  version: string;
  /** Site Jira par défaut, utilisé pour créer une offre de jumelage. */
  siteUrl: string;
  /** Compte administrateur qui crée les offres de jumelage. */
  adminAccountId: string;
  /** Langue des messages si la requête n'en demande pas. */
  locale: Locale;
}

/** Tout ce dont le pont a besoin pour traiter une requête. */
export interface BridgeDeps {
  pairing: PairingRepository;
  context: ContextRepository;
  waivers: WaiverService;
  nonces: NonceStore;
  evaluate: EvaluateService;
  clock: Clock;
  logger: Logger;
  config: BridgeConfig;
}

/** Résultat d'un jumelage : succès, ou refus explicite. */
export type PairingOutcome =
  | { ok: true; result: PairResult }
  | { ok: false; reason: 'expired' | 'used' | 'mismatch' };
