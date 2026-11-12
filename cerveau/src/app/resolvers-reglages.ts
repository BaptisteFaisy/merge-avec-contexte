/**
 * Écran 4 — resolver des réglages du projet (§12) : les treize règles (niveau,
 * mode, portée, paramètres), le jumelage Bitbucket, la correspondance
 * dépôt → service, les approbateurs de dérogations rangés par projet (item 23)
 * et le calendrier des gels (item 10, MC-14).
 *
 * Logique pure : aucun import Forge. Les dépendances (`UiDeps`) et les aides
 * communes aux trois écrans viennent de `resolvers-ui`. L'horloge est injectée
 * (`deps.clock()`) : aucune fonction ne lit l'heure.
 */
import {
  createPairingOffer,
  isRuleCode,
  type FallbackPolicy,
  type Freeze,
  type Level,
  type Recurrence,
  type RuleConfig,
  type RuleCode,
  type RuleMode,
  type RuleScope,
} from '../shared';
import { localParts } from '../shared/time/moment';
import { defaultRuleConfigs } from '../rules/defaults';
import { chargerJeuDeDemo } from '../seed/loader';
import { localeEffective } from '../ui/view-model-commun';
import { vmReglages, type EtatJumelage } from '../ui/view-model-reglages';
import { reglesEffectives } from './context-repo';
import { approbateursProjet, avecApprobateur } from './reglages';
import { projetEffectif, texte, type UiDeps } from './resolvers-ui';

/** Applique une action de la page de réglages ; `charger` ne change rien. */
async function appliquerReglages(
  method: string,
  payload: Record<string, unknown> | undefined,
  deps: UiDeps,
  now: string,
  projet: string,
): Promise<void> {
  if (method === 'genererCode') {
    const offre = createPairingOffer({ siteUrl: deps.config.siteUrl, createdBy: deps.config.adminAccountId, now });
    await deps.store.pairing.saveOffer(offre);
    return;
  }
  if (method === 'repli') {
    const politique: FallbackPolicy = payload?.politique === 'closed' ? 'closed' : 'open';
    await deps.store.pairing.setFallbackPolicy(politique, now);
    return;
  }
  if (method === 'chargerDemo') await chargerDemo(payload, deps, now);
  if (method === 'enregistrerRegles') await enregistrerRegles(payload, deps, now, projet);
  if (method === 'ajouterCorrespondance') await ajouterCorrespondance(payload, deps, now);
  if (method === 'ajouterApprobateur') await ajouterApprobateur(texte(payload, 'approbateur'), deps, projet);
  if (method === 'ajouterGel') await ajouterGel(payload, deps, now);
  if (method === 'supprimerGel') await supprimerGel(payload, deps);
}

/** Charge le jeu de démonstration dans le stockage (§20). */
async function chargerDemo(payload: Record<string, unknown> | undefined, deps: UiDeps, now: string): Promise<void> {
  await chargerJeuDeDemo(deps.store, {
    projectId: deps.config.projectId,
    now,
    workspaceUuid: typeof payload?.workspaceUuid === 'string' ? payload.workspaceUuid : undefined,
  });
  deps.logger.info('jeu de démonstration chargé', { projet: deps.config.projectId });
}

/**
 * Entrées de règles envoyées par l'écran : objet indexé par code, ou liste
 * d'objets porteurs d'un champ `code`. Les deux formes sont acceptées.
 */
function entreesRegles(brut: unknown): Array<[string, Record<string, unknown>]> {
  if (!brut || typeof brut !== 'object') return [];
  if (Array.isArray(brut)) {
    return brut
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => [String(item.code ?? ''), item] as [string, Record<string, unknown>])
      .filter(([code]) => code !== '');
  }
  return Object.entries(brut as Record<string, Record<string, unknown>>);
}

/** Niveau reçu de l'écran, s'il est connu. */
function niveau(valeur: unknown): Level | undefined {
  return valeur === 'blocking' || valeur === 'warning' || valeur === 'information' ? valeur : undefined;
}

/** Mode reçu de l'écran, s'il est connu. */
function modeRegle(valeur: unknown): RuleMode | undefined {
  return valeur === 'active' || valeur === 'observe' ? valeur : undefined;
}

/** Portée reçue de l'écran : deux listes de motifs glob. */
function portee(valeur: unknown): RuleScope | undefined {
  if (!valeur || typeof valeur !== 'object') return undefined;
  const brut = valeur as { repositories?: unknown; branches?: unknown };
  const scope: RuleScope = {};
  if (Array.isArray(brut.repositories)) {
    scope.repositories = brut.repositories.filter((x): x is string => typeof x === 'string');
  }
  if (Array.isArray(brut.branches)) {
    scope.branches = brut.branches.filter((x): x is string => typeof x === 'string');
  }
  return scope;
}

/**
 * Paramètres reçus de l'écran, appliqués à ceux déjà enregistrés : une valeur
 * `null` efface le paramètre, une valeur absente le laisse intact.
 */
function params(valeur: unknown, base: Record<string, unknown>): Record<string, unknown> {
  const resultat: Record<string, unknown> = { ...base };
  if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) return resultat;
  for (const [cle, brut] of Object.entries(valeur as Record<string, unknown>)) {
    if (brut === undefined) continue;
    if (brut === null) {
      delete resultat[cle];
      continue;
    }
    resultat[cle] = brut;
  }
  return resultat;
}

/** Réglage complet d'une règle : ce qui est enregistré, complété par le catalogue. */
async function configComplete(
  code: RuleCode,
  brut: Record<string, unknown>,
  deps: UiDeps,
  projet: string,
): Promise<RuleConfig> {
  const enregistree = await deps.store.ruleConfig.find(projet, code);
  const defaut = defaultRuleConfigs().find((config) => config.rule === code);
  const base: RuleConfig = enregistree
    ?? defaut
    ?? { rule: code, level: 'blocking', mode: 'active', scope: {}, params: {} };
  return {
    rule: code,
    level: niveau(brut.niveau) ?? base.level,
    mode: modeRegle(brut.mode) ?? base.mode,
    scope: portee(brut.portee) ?? base.scope,
    params: params(brut.params, base.params),
  };
}

/** Écrit les réglages de règles envoyés par l'écran, sans écraser l'existant. */
async function enregistrerRegles(
  payload: Record<string, unknown> | undefined,
  deps: UiDeps,
  now: string,
  projet: string,
): Promise<void> {
  for (const [code, brut] of entreesRegles(payload?.regles)) {
    if (!isRuleCode(code)) continue;
    const config = await configComplete(code as RuleCode, brut, deps, projet);
    await deps.store.ruleConfig.upsert(projet, config, now);
  }
}

/** Ajoute une ligne à la correspondance dépôt → service. */
async function ajouterCorrespondance(payload: Record<string, unknown> | undefined, deps: UiDeps, now: string): Promise<void> {
  const depot = texte(payload, 'depot');
  const service = texte(payload, 'service');
  if (!depot || !service) return;
  const jumelage = await deps.store.pairing.current();
  if (!jumelage) return;
  await deps.store.repoService.upsert(
    { workspaceUuid: jumelage.workspaceUuid, repoUuid: depot, service, jiraComponent: texte(payload, 'composant') },
    now,
  );
}

/**
 * Ajoute un approbateur de dérogations à l'annuaire du projet (item 23).
 * L'annuaire global reste l'union des annuaires : les écrans qui ignorent
 * encore le projet — encart de dérogation, actions Rovo — le lisent ainsi.
 */
async function ajouterApprobateur(nom: string | undefined, deps: UiDeps, projet: string): Promise<void> {
  if (!nom) return;
  const actuels = await deps.reglages.lire();
  await deps.reglages.ecrire(avecApprobateur(actuels, projet, nom));
}

/** Annuaire effectif d'un projet : le sien, sinon l'annuaire global. */
async function annuaire(deps: UiDeps, projet: string): Promise<string[]> {
  const lus = await deps.reglages.lire();
  const liste = approbateursProjet(lus, projet);
  return liste.length > 0 ? liste : deps.config.approbateurs;
}

/** Minutes depuis l'époque, pour un instant ISO. */
function minutesUtc(iso: string): number | undefined {
  const instant = Date.parse(iso);
  return Number.isFinite(instant) ? instant / 60000 : undefined;
}

/** Minutes « mur » (heure locale du fuseau) d'un instant ISO. */
function minutesMur(iso: string, fuseau: string): number | undefined {
  const parts = localParts(iso, fuseau);
  if (!parts) return undefined;
  const [annee, mois, jour] = parts.date.split('-').map(Number);
  if (!annee || !mois || !jour) return undefined;
  return Date.UTC(annee, mois - 1, jour) / 60000 + parts.minutes;
}

/**
 * Instant ISO d'une heure locale (`2026-12-24T18:00`) dans un fuseau IANA.
 * Deux passes suffisent : la première approche l'écart, la seconde l'affine.
 */
function instantDepuisHeureLocale(mur: string | undefined, fuseau: string): string | undefined {
  if (!mur) return undefined;
  const cible = minutesUtc(mur.length === 16 ? `${mur}:00Z` : `${mur}Z`);
  if (cible === undefined) return undefined;
  let instant = cible;
  for (let passe = 0; passe < 2; passe += 1) {
    const local = minutesMur(new Date(instant * 60000).toISOString(), fuseau);
    if (local === undefined) return undefined;
    instant += cible - local;
  }
  return new Date(instant * 60000).toISOString();
}

/** Fuseau choisi à l'écran, s'il est connu de `Intl` ; `UTC` par défaut. */
function fuseauValide(valeur: string | undefined): string {
  if (!valeur) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: valeur });
    return valeur;
  } catch {
    return 'UTC';
  }
}

/** Liste de motifs : tableau de chaînes, ou texte séparé par des virgules. */
function liste(valeur: unknown): string[] {
  if (Array.isArray(valeur)) return valeur.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean);
  if (typeof valeur !== 'string') return [];
  return valeur.split(',').map((x) => x.trim()).filter(Boolean);
}

/** Jours de la semaine d'une récurrence hebdomadaire : nombres de 0 à 6. */
function joursSemaine(valeur: unknown): number[] {
  return liste(valeur)
    .map((jour) => Number(jour))
    .filter((jour) => Number.isInteger(jour) && jour >= 0 && jour <= 6);
}

/** Récurrence demandée par l'écran, avec les jours d'une récurrence hebdomadaire. */
function recurrence(valeur: unknown, jours: unknown): Recurrence {
  if (valeur === 'daily') return { kind: 'daily' };
  if (valeur === 'weekly') return { kind: 'weekly', daysOfWeek: joursSemaine(jours) };
  return { kind: 'none' };
}

/** Identifiant d'un gel : l'instant de création (injecté) et le nom. */
function identifiantGel(nom: string, now: string): string {
  const base = nom.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'gel';
  return `gel-${Date.parse(now)}-${base}`;
}

/** Crée un gel : heures locales dans le fuseau choisi (§10, MC-14). */
async function ajouterGel(payload: Record<string, unknown> | undefined, deps: UiDeps, now: string): Promise<void> {
  const nom = texte(payload, 'nom');
  if (!nom) return;
  const fuseau = fuseauValide(texte(payload, 'fuseau'));
  const debut = instantDepuisHeureLocale(texte(payload, 'debut'), fuseau);
  const fin = instantDepuisHeureLocale(texte(payload, 'fin'), fuseau);
  if (!debut || !fin || Date.parse(fin) <= Date.parse(debut)) return;
  const freeze: Freeze = {
    id: identifiantGel(nom, now),
    name: nom,
    startsAt: debut,
    endsAt: fin,
    branches: liste(payload?.branches),
    services: liste(payload?.services),
    recurrence: recurrence(payload?.recurrence, payload?.jours),
    timezone: fuseau,
    createdBy: deps.config.adminAccountId,
  };
  await deps.store.freezes.save(freeze);
}

/** Supprime un gel du calendrier. */
async function supprimerGel(payload: Record<string, unknown> | undefined, deps: UiDeps): Promise<void> {
  const id = texte(payload, 'id');
  if (!id) return;
  await deps.store.freezes.remove(id);
}

/** État du jumelage affiché par la page de réglages. */
async function etatJumelage(deps: UiDeps, now: string) {
  const [jumelage, offre, politique] = await Promise.all([
    deps.store.pairing.current(),
    deps.store.pairing.currentOffer(),
    deps.store.pairing.fallbackPolicy(),
  ]);
  const codeValide = Boolean(offre) && !offre?.used && Date.parse(now) < Date.parse(offre?.expiresAt ?? now);
  const etat: EtatJumelage = jumelage ? 'paired' : codeValide ? 'code-pending' : 'unpaired';
  return {
    etat,
    code: codeValide ? offre?.code : undefined,
    codeExpireA: codeValide ? offre?.expiresAt : undefined,
    siteUrl: deps.config.siteUrl,
    politiqueRepli: politique,
  };
}

/** `resolverReglages` : lecture et actions de la page de réglages du projet. */
export async function handleResolverReglages(payload: Record<string, unknown> | undefined, deps: UiDeps, projetCtx?: string) {
  const now = deps.clock();
  const projet = projetEffectif(deps, projetCtx);
  const method = texte(payload, 'method') ?? 'charger';
  await appliquerReglages(method, payload, deps, now, projet);
  const locale = localeEffective(payload?.locale, deps.config.locale);
  const jumelage = await deps.store.pairing.current();
  const [configs, correspondances, liste, gels] = await Promise.all([
    reglesEffectives(deps.store, projet),
    jumelage ? deps.store.repoService.listByWorkspace(jumelage.workspaceUuid) : Promise.resolve([]),
    annuaire(deps, projet),
    deps.store.freezes.list(),
  ]);
  const vue = vmReglages({
    locale,
    configs,
    jumelage: await etatJumelage(deps, now),
    correspondance: correspondances.map((ligne) => ({
      depot: ligne.repoUuid,
      service: ligne.service,
      composant: ligne.jiraComponent,
    })),
    approbateurs: liste,
    gels,
    projet,
    maintenant: now,
  });
  return { locale, vue };
}
