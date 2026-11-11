/**
 * Écran 4 — resolver des réglages du projet (§12) : les treize règles, le
 * jumelage Bitbucket, la correspondance dépôt → service et l'annuaire des
 * approbateurs de dérogations.
 *
 * Logique pure : aucun import Forge. Les dépendances (`UiDeps`) et les aides
 * communes aux trois écrans viennent de `resolvers-ui`.
 */
import { createPairingOffer, isRuleCode, type FallbackPolicy, type RuleConfig, type RuleCode } from '../shared';
import { chargerJeuDeDemo } from '../seed/loader';
import { vmReglages, type EtatJumelage } from '../ui/view-model-reglages';
import { reglesEffectives } from './context-repo';
import { approbateurs, projetEffectif, texte, type UiDeps } from './resolvers-ui';

/** Applique une action de la page de réglages ; `charger` ne change rien. */
async function appliquerReglages(method: string, payload: Record<string, unknown> | undefined, deps: UiDeps, now: string, projet: string): Promise<void> {
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
  if (method === 'ajouterApprobateur') await ajouterApprobateur(texte(payload, 'approbateur'), deps);
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

/** Écrit les réglages de règles envoyés par l'écran. */
async function enregistrerRegles(payload: Record<string, unknown> | undefined, deps: UiDeps, now: string, projet: string): Promise<void> {
  const regles = payload?.regles;
  if (!regles || typeof regles !== 'object') return;
  for (const [code, brut] of Object.entries(regles as Record<string, Record<string, unknown>>)) {
    if (!isRuleCode(code)) continue;
    const config: RuleConfig = {
      rule: code as RuleCode,
      level: (brut.niveau as RuleConfig['level']) ?? 'blocking',
      mode: (brut.mode as RuleConfig['mode']) ?? 'active',
      scope: (brut.portee as RuleConfig['scope']) ?? {},
      params: (brut.params as Record<string, unknown>) ?? {},
    };
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

/** Ajoute un approbateur de dérogations, sans doublon. */
async function ajouterApprobateur(nom: string | undefined, deps: UiDeps): Promise<void> {
  if (!nom) return;
  const actuels = await deps.reglages.lire();
  if (actuels.approbateurs.includes(nom)) return;
  await deps.reglages.ecrire({ approbateurs: [...actuels.approbateurs, nom] });
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
  const jumelage = await deps.store.pairing.current();
  const [configs, correspondances, liste] = await Promise.all([
    reglesEffectives(deps.store, projet),
    jumelage ? deps.store.repoService.listByWorkspace(jumelage.workspaceUuid) : Promise.resolve([]),
    approbateurs(deps),
  ]);
  const vue = vmReglages({
    locale: deps.config.locale,
    configs,
    jumelage: await etatJumelage(deps, now),
    correspondance: correspondances.map((ligne) => ({
      depot: ligne.repoUuid,
      service: ligne.service,
      composant: ligne.jiraComponent,
    })),
    approbateurs: liste,
    maintenant: now,
  });
  return { locale: deps.config.locale, vue };
}
