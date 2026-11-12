/**
 * Écran 5 — resolver de l'encart sur le ticket (§12).
 *
 * PR connues du ticket, dernière évaluation, dérogations en cours, demande de
 * dérogation depuis le ticket et décision (accord borné de 1 à 72 h, ou refus)
 * par une personne de l'annuaire des approbateurs (§7.1 étape 6, MC-07).
 *
 * Logique pure : aucun import Forge. Les dépendances (`UiDeps`) et les aides
 * communes aux trois écrans viennent de `resolvers-ui`.
 */
import { isRuleCode, type Evaluation, type Locale } from '../shared';
import type { StoredWaiver } from '../storage/ports';
import { vmEncart } from '../ui/view-model-encart';
import { reglesEffectives } from './context-repo';
import { borneHeures, echeance, identifiant } from './waivers';
import { approbateurs, projetEffectif, texte, type UiDeps } from './resolvers-ui';

/** Borne basse pour « depuis toujours » : le journal ne remonte pas plus loin. */
const EPOCH = '1970-01-01T00:00:00.000Z';

/**
 * Item 102 — messages d'erreur lisibles du Cerveau, avec la marche à suivre.
 * Côté Cerveau, l'échec réaliste d'un écran est le stockage (base SQL) qui ne
 * répond pas ; « Cerveau injoignable » est une notion du Capteur (pont coupé),
 * déjà traitée côté `capteur/src/ui/view-models.ts`.
 */
const MESSAGES_ERREUR = {
  'base-indisponible': {
    fr: 'Base indisponible : le stockage du Cerveau ne répond pas. Réessayez dans un instant ; si l’échec persiste, l’administrateur doit vérifier la base Forge SQL.',
    en: 'Storage unavailable: the Cerebro storage is not responding. Retry shortly; if it keeps failing, the administrator must check the Forge SQL database.',
  },
} satisfies Record<string, { fr: string; en: string }>;

/** Message d'erreur lisible du Cerveau (item 102). */
export function messageErreurEncart(cle: keyof typeof MESSAGES_ERREUR, locale: Locale): string {
  return MESSAGES_ERREUR[cle][locale];
}

/** Une lecture/écriture du stockage qui échoue vaut « base indisponible » (item 102). */
async function avecStockage<T>(operation: () => Promise<T>, locale: Locale): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new Error(messageErreurEncart('base-indisponible', locale));
  }
}

/** Enregistre une demande de dérogation faite depuis l'encart du ticket. */
async function demanderDerogationEncart(payload: Record<string, unknown> | undefined, cle: string, deps: UiDeps, now: string): Promise<void> {
  const rule = texte(payload, 'rule');
  if (!rule || !isRuleCode(rule)) return;
  const heures = borneHeures(Number(payload?.hours ?? 2));
  const waiver: StoredWaiver = {
    id: identifiant('w-encart', cle, rule, Date.parse(now)),
    prId: 0,
    repositoryUuid: '',
    rule,
    requestedBy: deps.config.adminAccountId,
    reason: texte(payload, 'reason') ?? 'Dérogation demandée depuis le ticket',
    requestedAt: now,
    expiresAt: new Date(Date.parse(now) + heures * 3_600_000).toISOString(),
    status: 'requested',
    issueKeys: cle ? [cle] : [],
  };
  await deps.store.waivers.create(waiver);
}

/** Ce que l'écran doit dire après une tentative de décision. */
export type CodeAvisEncart = 'accordee' | 'refusee' | 'deja-decidee' | 'introuvable' | 'non-approbateur';

/** Avis rendu avec la vue : l'issue de la décision demandée par l'écran. */
export interface AvisEncart {
  code: CodeAvisEncart;
  waiverId: string;
}

/**
 * Décideur effectif : l'identité que l'écran déclare, sinon l'administrateur de
 * l'installation — la convention déjà en vigueur pour le demandeur.
 *
 * Le resolver ne reçoit pas le contexte Forge : une identité déclarée reste de
 * la bonne foi de l'appelant (audit, item 47). Ce qui est contrôlé ici est
 * l'habilitation : le décideur doit figurer dans l'annuaire des approbateurs.
 */
function decideur(payload: Record<string, unknown> | undefined, deps: UiDeps): string {
  return texte(payload, 'utilisateur') ?? deps.config.adminAccountId;
}

/**
 * Accorde ou refuse une dérogation demandée pour ce ticket (§7.1, étape 6).
 *
 * L'accord est borné de 1 à 72 h (`borneHeures`) : une dérogation ne neutralise
 * jamais une règle indéfiniment. Rien n'est écrit quand la dérogation est
 * inconnue, déjà tranchée, ou quand le décideur n'est pas de l'annuaire :
 * l'écran reçoit alors un avis qui dit pourquoi.
 */
async function deciderDerogation(
  payload: Record<string, unknown> | undefined,
  cle: string,
  deps: UiDeps,
  now: string,
): Promise<AvisEncart | undefined> {
  const waiverId = texte(payload, 'waiverId');
  const decision = texte(payload, 'decision');
  if (!waiverId || (decision !== 'granted' && decision !== 'refused')) return undefined;
  const trouve = await deps.store.waivers.find(waiverId);
  if (!trouve || (cle !== '' && !trouve.issueKeys.includes(cle))) return { code: 'introuvable', waiverId };
  if (trouve.status !== 'requested') return { code: 'deja-decidee', waiverId };
  const par = decideur(payload, deps);
  if (!(await approbateurs(deps)).includes(par)) return { code: 'non-approbateur', waiverId };
  if (decision === 'granted') {
    await deps.store.waivers.grant(waiverId, par, echeance(now, borneHeures(Number(payload?.hours ?? 2))));
  } else {
    await deps.store.waivers.refuse(waiverId, par);
  }
  return { code: decision === 'granted' ? 'accordee' : 'refusee', waiverId };
}

/** `resolverEncart` : état du ticket vis-à-vis des règles (§12, écran 5). */
export async function handleResolverEncart(payload: Record<string, unknown> | undefined, issueKey: string | undefined, deps: UiDeps, projetCtx?: string) {
  const now = deps.clock();
  const locale = deps.config.locale;
  const cle = (texte(payload, 'issueKey') ?? issueKey ?? '').toUpperCase();
  const method = texte(payload, 'method') ?? 'charger';
  let avis: AvisEncart | undefined;
  if (method === 'demanderDerogation') await avecStockage(() => demanderDerogationEncart(payload, cle, deps, now), locale);
  if (method === 'deciderDerogation') avis = await avecStockage(() => deciderDerogation(payload, cle, deps, now), locale);
  // Item 102 : un stockage qui ne répond pas produit une erreur lisible, pas un écran blanc.
  const lu = await avecStockage(async () => {
    const [derniere, waivers, configs, annuaire, stats] = await Promise.all([
      cle ? deps.store.evaluations.latestByIssue(cle) : Promise.resolve(undefined),
      cle ? deps.store.waivers.listByIssue(cle) : Promise.resolve([]),
      reglesEffectives(deps.store, projetEffectif(deps, projetCtx)),
      approbateurs(deps),
      deps.store.evaluations.stats(EPOCH, now),
    ]);
    // Item 101 : aucune évaluation sur l'installation → l'encart affiche l'accueil.
    return { derniere, waivers, configs, annuaire, premierUsage: stats.total === 0 };
  }, locale);
  const prs = lu.derniere
    ? [{ prId: lu.derniere.pullRequestId, depot: lu.derniere.repositoryUuid, evaluation: lu.derniere as Evaluation }]
    : [];
  const vue = vmEncart({
    locale,
    prs,
    waivers: lu.waivers,
    configs: lu.configs,
    maintenant: now,
    approbateurs: lu.annuaire,
    utilisateur: decideur(payload, deps),
    premierUsage: lu.premierUsage,
  });
  return { locale, vue, ...(avis ? { avis } : {}) };
}
