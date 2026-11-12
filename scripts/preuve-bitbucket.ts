/**
 * Preuve de bout en bout côté Bitbucket, paramétrée par l'environnement.
 *
 * Ce scénario crée le dépôt `checkout-api` (privé) s'il n'existe pas, pousse la
 * branche `feature/MAC-2-limite-tentatives` (contenant un `README.md` qui décrit
 * la limite de tentatives), ouvre la pull request vers `main` avec un titre et
 * une description qui portent la clé `MAC-2`, réaffiche l'état de la PR et ses
 * contrôles de fusion, liste les « repository access tokens » si l'API les
 * expose, puis imprime les opérations **manuelles** qui restent à faire dans
 * l'interface (activation des *custom merge checks*, espace puis dépôt).
 *
 * Aucun effet de bord tant qu'il n'est pas exécuté : il n'est appelé qu'à la
 * main, et uniquement une fois l'accès à l'espace octroyé.
 *
 * Variables : MAC_BB_TOKEN, MAC_BB_WORKSPACE (requises), MAC_BB_USER (fac.), et
 * MAC_BB_REPO / MAC_BB_BRANCHE / MAC_BB_CIBLE / MAC_BB_TICKET pour surcharger
 * les valeurs par défaut.
 *
 * Sortie : 0 si tout est OK, 1 si des étapes échouent, 2 si la configuration
 * manque, 3 si l'adresse IP est refusée (« whitelist your IP »).
 */
import {
  ClientBitbucket,
  estErreurBlocageIp,
  lireConfiguration,
  messageBlocageIp,
  type ConfigurationBitbucket,
  type Depot,
  type PageDepots,
  type PullRequest,
  type ResultatsControles,
} from './bitbucket-api';
import { afficherMessage, annonce, etape } from './demo-e2e';

/** Valeurs par défaut du scénario, surchargeables par l'environnement. */
const DEFAUTS = {
  repo: 'checkout-api',
  branche: 'feature/MAC-2-limite-tentatives',
  cible: 'main',
  ticket: 'MAC-2',
} as const;

/** Configuration complète du scénario. */
export interface ConfigPreuve {
  client: ConfigurationBitbucket;
  repo: string;
  branche: string;
  cible: string;
  ticket: string;
}

/** Clé de dépôt lisible (espace/slug) pour les lignes OK. */
export function cleDepot(config: ConfigPreuve): string {
  return `${config.client.workspace}/${config.repo}`;
}

/** Contenu posé sur `main` : le squelette du dépôt. */
export function contenuInitial(ticket: string): string {
  return [
    `# ${ticket} — checkout-api`,
    '',
    "Service de paiement du panier. Ce dépôt est la cible de la preuve de",
    '« Merge avec contexte » : une branche, une pull request et le *custom merge',
    'check* du Capteur.',
    '',
  ].join('\n');
}

/** Contenu posé sur la branche : la limite de tentatives (ticket porté). */
export function contenuFonctionnalite(ticket: string): string {
  return [
    `# ${ticket} — Limite de tentatives d'authentification`,
    '',
    'Le endpoint `POST /checkout/auth` limite désormais les tentatives à **5 essais**',
    'par tranche de **15 minutes** et par adresse IP. Au-delà, la réponse `429` renvoie',
    'un délai de réessai (`Retry-After`).',
    '',
    '- 5 essais max, fenêtre glissante de 15 minutes ;',
    '- compteur par couple `(adresse IP, identifiant)` ;',
    '- verrou de 15 minutes puis remise à zéro automatique ;',
    '- journalisation anonymisée des verrous.',
    '',
  ].join('\n');
}

/** Titre de la pull request, qui porte la clé lue par la règle R-01. */
export function titrePullRequest(ticket: string): string {
  return `${ticket} — Limite de tentatives d'authentification`;
}

/** Description de la pull request : rappelle le ticket, la branche et la cible. */
export function descriptionPullRequest(ticket: string, branche: string, cible: string): string {
  return [
    `Implémente la limitation des tentatives d'authentification décrite dans ${ticket}.`,
    '',
    `- branche source : \`${branche}\``,
    `- branche cible : \`${cible}\``,
    '',
  ].join('\n');
}

/** URL web d'une pull request, quand l'API la fournit. */
function urlPullRequest(pr: PullRequest | undefined): string {
  return pr?.links?.html?.href ?? '(URL indisponible)';
}

/** Opérations manuelles qui restent à faire, hors portée de l'API REST. */
export function operationsManuelles(config: ConfigPreuve): string[] {
  const depot = cleDepot(config);
  return [
    `espace ${config.client.workspace} : activer les *custom merge checks* (Workspace settings → Merge checks)`,
    `dépôt ${depot} : activer le merge check du Capteur (Repository settings → Merge checks)`,
  ];
}

/** Charge la configuration du scénario depuis l'environnement. */
export function lireConfigPreuve(env: Record<string, string | undefined>): ConfigPreuve | undefined {
  const client = lireConfiguration(env);
  if (!client) return undefined;
  return {
    client,
    repo: env.MAC_BB_REPO?.trim() || DEFAUTS.repo,
    branche: env.MAC_BB_BRANCHE?.trim() || DEFAUTS.branche,
    cible: env.MAC_BB_CIBLE?.trim() || DEFAUTS.cible,
    ticket: env.MAC_BB_TICKET?.trim() || DEFAUTS.ticket,
  };
}

/** Lignes d'observation des contrôles de fusion affichées à l'écran. */
function afficherControles(controles: ResultatsControles): void {
  const personnalises = (controles.values ?? []).filter((c) => c.type?.startsWith('custom'));
  for (const c of personnalises) {
    const nom = c.check?.name ?? c.type ?? 'contrôle';
    afficherMessage(`${nom} : ${c.status ?? '?'}${c.blocking ? ' (bloquant)' : ''}${c.message ? ` — ${c.message}` : ''}`);
  }
}

/** Vrai si la PR a des contrôles personnalisés exposés. */
function exposeControles(controles: ResultatsControles): boolean {
  return (controles.values ?? []).some((c) => c.type?.startsWith('custom'));
}

/** Contexte d'exécution du scénario, partagé par les étapes. */
interface Pilote {
  client: ClientBitbucket;
  config: ConfigPreuve;
  echecs: number;
  verifier: (nom: string, ok: boolean, detail: string) => void;
}

/** Construit le pilote : le client et le compteur d'échecs. */
function creerPilote(config: ConfigPreuve): Pilote {
  const pilote: Pilote = {
    client: new ClientBitbucket(config.client),
    config,
    echecs: 0,
    verifier: (nom, ok, detail) => {
      etape(nom, ok, detail);
      if (!ok) pilote.echecs += 1;
    },
  };
  return pilote;
}

/** 1. Accès : lister les dépôts de l'espace (refus IP → message clair, sortie 3). */
async function etapeAcces(p: Pilote): Promise<PageDepots | undefined> {
  try {
    const depots = await p.client.listerDepots();
    p.verifier('Accès à l’espace Bitbucket', true, `${p.config.client.workspace} (${depots.values?.length ?? 0} dépôt(s))`);
    return depots;
  } catch (erreur) {
    if (estErreurBlocageIp(erreur)) {
      console.error(messageBlocageIp(p.config.client.workspace));
      process.exit(3);
    }
    p.verifier('Accès à l’espace Bitbucket', false, String(erreur));
    return undefined;
  }
}

/** 2. Dépôt : présent ou créé (privé). Rend faux si le dépôt est injoignable. */
async function etapeDepot(p: Pilote, depots: PageDepots | undefined): Promise<boolean> {
  let depot: Depot | undefined = (depots?.values ?? []).find((d) => d.slug === p.config.repo);
  if (depot) {
    p.verifier(`Dépôt ${cleDepot(p.config)}`, true, 'déjà présent');
    return true;
  }
  try {
    depot = await p.client.creerDepot(p.config.repo, true);
    p.verifier(`Dépôt ${cleDepot(p.config)}`, Boolean(depot?.slug), 'créé (privé)');
    return Boolean(depot?.slug);
  } catch (erreur) {
    p.verifier(`Dépôt ${cleDepot(p.config)}`, false, String(erreur));
    return false;
  }
}

/** 3. Branche : squelette sur `main`, puis branche de fonctionnalité (refs). */
async function etapeBranche(p: Pilote): Promise<boolean> {
  const { repo, cible, branche, ticket } = p.config;
  try {
    await p.client.deposerFichier(repo, 'README.md', contenuInitial(ticket), 'checkout-api : squelette initial', cible);
    const main = await p.client.lireBranche(repo, cible);
    const hash = main?.target?.hash;
    if (!hash) throw new Error(`impossible de lire le hash de ${cible}`);
    await p.client.creerBranche(repo, branche, hash);
    p.verifier(`Branche ${branche}`, true, `depuis ${cible} (${hash.slice(0, 7)})`);
    return true;
  } catch (erreur) {
    p.verifier(`Branche ${branche}`, false, String(erreur));
    return false;
  }
}

/** 4. Contenu : le README de la fonctionnalité, déposé sur la branche. */
async function etapeFichier(p: Pilote): Promise<boolean> {
  const { repo, branche, ticket } = p.config;
  try {
    await p.client.deposerFichier(repo, 'README.md', contenuFonctionnalite(ticket), `${ticket} : limite de tentatives`, branche);
    p.verifier(`Fichier README.md sur ${branche}`, true, 'contenu déposé');
    return true;
  } catch (erreur) {
    p.verifier(`Fichier README.md sur ${branche}`, false, String(erreur));
    return false;
  }
}

/** 5. Pull request : titre et description portent la clé du ticket. */
async function etapePullRequest(p: Pilote): Promise<PullRequest | undefined> {
  const { repo, branche, cible, ticket } = p.config;
  try {
    const pr = await p.client.creerPullRequest(repo, {
      title: titrePullRequest(ticket),
      description: descriptionPullRequest(ticket, branche, cible),
      source: { branch: { name: branche } },
      destination: { branch: { name: cible } },
    });
    p.verifier('Pull request ouverte', Boolean(pr?.id), `#${pr?.id} — ${urlPullRequest(pr)}`);
    return pr;
  } catch (erreur) {
    p.verifier('Pull request ouverte', false, String(erreur));
    return undefined;
  }
}

/** 6. État : relire la PR et afficher source → cible et état. */
async function etapeEtat(p: Pilote, pr: PullRequest | undefined): Promise<void> {
  const { repo } = p.config;
  if (!pr?.id) return;
  try {
    const relue = await p.client.lirePullRequest(repo, pr.id);
    afficherMessage(`${relue.title ?? '?'} [${relue.state ?? '?'}] : ${relue.source?.branch?.name ?? '?'} → ${relue.destination?.branch?.name ?? '?'}`);
    p.verifier('État de la pull request', relue.id === pr.id, `#${relue.id} — ${relue.state ?? '?'}`);
  } catch (erreur) {
    p.verifier('État de la pull request', false, String(erreur));
  }
}

/** 7. Contrôles de fusion : lire et afficher les résultats (si exposés). */
async function etapeControles(p: Pilote, pr: PullRequest | undefined): Promise<void> {
  try {
    const controles = await p.client.lireControlesFusion(p.config.repo, pr?.id ?? 0);
    afficherControles(controles);
    p.verifier('Contrôles de fusion lus', true, exposeControles(controles) ? 'contrôles personnalisés exposés' : 'aucun contrôle personnalisé (à activer)');
  } catch (erreur) {
    p.verifier('Contrôles de fusion lus', false, String(erreur));
  }
}

/** 8. Jetons d'accès : lister si l'API les expose (jamais en créer). */
async function etapeJetons(p: Pilote): Promise<void> {
  try {
    const jetons = await p.client.listerJetonsAcces(p.config.repo);
    p.verifier('Jetons d’accès de dépôt', jetons !== undefined, jetons === undefined ? 'non exposés par l’API REST' : `${jetons.length} jeton(s)`);
  } catch (erreur) {
    p.verifier('Jetons d’accès de dépôt', false, String(erreur));
  }
}

/** 9. Opérations manuelles restantes. */
function afficherManuelles(p: Pilote): void {
  annonce('Opérations manuelles restantes (hors API REST)');
  for (const operation of operationsManuelles(p.config)) console.log(`  · ${operation}`);
}

/** Scénario complet ; rend le nombre d'étapes en échec. */
export async function executerPreuve(config: ConfigPreuve): Promise<number> {
  const p = creerPilote(config);

  const depots = await etapeAcces(p);
  if (!depots) return p.echecs;

  if (!(await etapeDepot(p, depots))) return p.echecs;
  if (!(await etapeBranche(p))) return p.echecs;
  if (!(await etapeFichier(p))) return p.echecs;

  const pr = await etapePullRequest(p);
  if (!pr) return p.echecs;

  await etapeEtat(p, pr);
  await etapeControles(p, pr);
  await etapeJetons(p);
  afficherManuelles(p);

  return p.echecs;
}

/** Point d'entrée : configuration, scénario, code de sortie. */
async function main(): Promise<void> {
  const config = lireConfigPreuve(process.env);
  if (!config) process.exit(2);
  console.log(`\nPreuve Bitbucket « Merge avec contexte » — ${new Date().toISOString()}\n`);
  const echecs = await executerPreuve(config);
  console.log(`\n${echecs === 0 ? 'Preuve Bitbucket concluante' : `${echecs} étape(s) en échec`}\n`);
  process.exit(echecs === 0 ? 0 : 1);
}

/* L'import (par les tests) ne doit rien exécuter : `vitest` pose `VITEST=true`.
 * À l'invocation directe (`vite-node scripts/preuve-bitbucket.ts`), la variable
 * est absente et le scénario se joue. */
if (!process.env.VITEST) {
  main();
}