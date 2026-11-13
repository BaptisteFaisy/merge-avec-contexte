/**
 * Preuve de bout en bout côté Bitbucket, paramétrée par l'environnement.
 *
 * Ce scénario crée le dépôt `checkout-api` (privé) s'il n'existe pas, pousse la
 * branche `feature/MAC-2-limite-tentatives` (contenant un `README.md` qui décrit
 * la limite de tentatives), ouvre la pull request vers `main` avec un titre et
 * une description qui portent la clé `MAC-2`, réaffiche l'état de la PR,
 * **attend l'apparition du *custom merge check*** puis en affiche le **vrai
 * verdict**, liste les « repository access tokens » si l'API les expose, et
 * imprime les opérations **manuelles** qui restent à faire dans l'interface
 * (activation des *custom merge checks*, espace puis dépôt).
 *
 * L'installation de l'app dans l'espace est **opt-in** : elle n'a lieu que si
 * `MAC_BB_INSTALLER=1` et que l'app n'y est pas déjà installée. Elle passe par
 * le CLI Atlassian (`forge-atlassian install`), lancé depuis `capteur/` pour
 * que le manifeste soit lu ; le lanceur est injecté, les tests n'en lancent
 * jamais un vrai.
 *
 * Aucun effet de bord tant qu'il n'est pas exécuté : il n'est appelé qu'à la
 * main, et uniquement une fois l'accès à l'espace octroyé.
 *
 * Variables : MAC_BB_TOKEN, MAC_BB_WORKSPACE (requises), MAC_BB_USER (fac.), et
 * MAC_BB_REPO / MAC_BB_BRANCHE / MAC_BB_CIBLE / MAC_BB_TICKET pour surcharger
 * les valeurs par défaut, MAC_BB_INSTALLER=1 pour installer l'app.
 *
 * Sortie : 0 si tout est OK, 1 si des étapes échouent, 2 si la configuration
 * manque, 3 si l'adresse IP est refusée (« whitelist your IP »).
 */
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ATTENTE_CONTROLES_MS,
  ClientBitbucket,
  estErreurBlocageIp,
  lireConfiguration,
  messageBlocageIp,
  type ConfigurationBitbucket,
  type ControleFusion,
  type Depot,
  type OptionsAttenteControles,
  type PageDepots,
  type PullRequest,
  type RecuperateurHttp,
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

/** Dossier de l'app Forge « Capteur » : le CLI s'y lance pour lire le manifeste. */
export const DOSSIER_CAPTEUR = fileURLToPath(new URL('../capteur', import.meta.url));

/** Configuration complète du scénario. */
export interface ConfigPreuve {
  client: ConfigurationBitbucket;
  repo: string;
  branche: string;
  cible: string;
  ticket: string;
  /** Vrai si l'app doit être installée dans l'espace (`MAC_BB_INSTALLER=1`). */
  installer: boolean;
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
    installer: env.MAC_BB_INSTALLER?.trim() === '1',
  };
}

/* --- Installation de l'app dans l'espace (CLI Atlassian, opt-in). --- */

/** Résultat d'une commande : code de sortie et sortie standard cumulée. */
export interface ResultatCommande {
  code: number;
  sortie: string;
  /** Message d'erreur du lanceur, quand il y en a un (binaire absent…). */
  erreur?: string;
}

/** Lanceur de commande injectable (les tests fournissent une doublure). */
export type ExecuteurCommande = (
  commande: string,
  args: string[],
  options?: { cwd?: string },
) => Promise<ResultatCommande>;

/** Lanceur par défaut : `child_process.execFile`, qui ne leve jamais. */
export const executeurParDefaut: ExecuteurCommande = (commande, args, options) =>
  new Promise((resolve) => {
    execFile(commande, args, { cwd: options?.cwd, encoding: 'utf8' }, (erreur, stdout) => {
      const code = erreur ? (typeof erreur.code === 'number' ? erreur.code : 1) : 0;
      resolve({ code, sortie: String(stdout ?? ''), erreur: erreur?.message });
    });
  });

/** Nom ou chemin du CLI Atlassian ; surchargeable par `MAC_FORGE_CLI`. */
export function commandeForge(env: Record<string, string | undefined> = process.env): string {
  return env.MAC_FORGE_CLI?.trim() || join(homedir(), '.local', 'bin', 'forge-atlassian');
}

/** Vrai si la sortie de `install list` annonce une installation dans l'espace. */
export function estInstalleDans(sortie: string, slug: string): boolean {
  const echap = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`bitbucket\\.org/${echap}(?![\\w-])`).test(sortie);
}

/** État de l'installation de l'app dans l'espace. */
export type EtatInstallation = 'ignore' | 'deja' | 'installe' | 'echec';

/** Résultat de l'étape d'installation, avec une raison affichable. */
export interface ResultatInstallation {
  etat: EtatInstallation;
  raison: string;
}

/** Installe l'app dans l'espace si elle ne l'y est pas déjà. */
export async function installerSiAbsente(
  slug: string,
  exec: ExecuteurCommande,
  cli: string,
): Promise<ResultatInstallation> {
  const liste = await exec(cli, ['install', 'list'], { cwd: DOSSIER_CAPTEUR });
  if (estInstalleDans(liste.sortie, slug)) {
    return { etat: 'deja', raison: `déjà installée dans l’espace ${slug}` };
  }
  const installation = await exec(
    cli,
    ['install', '-p', 'bitbucket', '-s', `https://bitbucket.org/${slug}`, '--non-interactive', '-e', 'production'],
    { cwd: DOSSIER_CAPTEUR },
  );
  if (installation.code !== 0) {
    const raison = installation.erreur ? ` — ${installation.erreur}` : '';
    return { etat: 'echec', raison: `le CLI a rendu le code ${installation.code}${raison}` };
  }
  return { etat: 'installe', raison: `installée dans l’espace ${slug}` };
}

/* --- Affichage des contrôles de fusion. --- */

/** Contrôles personnalisés d'un jeu de résultats (ceux du Capteur). */
export function controlesPersonalises(controles: ResultatsControles): ControleFusion[] {
  return (controles.values ?? []).filter((c) => c.type?.startsWith('custom'));
}

/** Une ligne de verdict par contrôle personnalisé (« nom : statut »). */
export function lignesVerdict(controles: ResultatsControles): string[] {
  return controlesPersonalises(controles).map((c) => {
    const nom = c.check?.name ?? c.type ?? 'contrôle';
    return `${nom} : ${c.status ?? '?'}${c.blocking ? ' (bloquant)' : ''}`;
  });
}

/** Affiche le message de chaque contrôle personnalisé, comme Bitbucket l'affiche. */
function afficherControles(controles: ResultatsControles): void {
  for (const c of controlesPersonalises(controles)) {
    const nom = c.check?.name ?? c.type ?? 'contrôle';
    afficherMessage(`${nom} : ${c.status ?? '?'}${c.blocking ? ' (bloquant)' : ''}${c.message ? ` — ${c.message}` : ''}`);
  }
}

/* --- Déroulé du scénario. --- */

/** Contexte d'exécution du scénario, partagé par les étapes. */
interface Pilote {
  client: ClientBitbucket;
  config: ConfigPreuve;
  echecs: number;
  exec: ExecuteurCommande;
  cli: string;
  attente: OptionsAttenteControles;
  verifier: (nom: string, ok: boolean, detail: string) => void;
}

/** Options du scénario : injections pour les tests, rien d'autre. */
export interface OptionsPreuve {
  /** Récupération HTTP injectée (les tests fournissent une doublure). */
  recuperer?: RecuperateurHttp;
  /** Lanceur de commande injecté (les tests fournissent une doublure). */
  exec?: ExecuteurCommande;
  /** Options d'attente des contrôles de fusion. */
  attente?: OptionsAttenteControles;
  /** Nom ou chemin du CLI Atlassian. */
  cli?: string;
}

/** Construit le pilote : le client, le lanceur et le compteur d'échecs. */
function creerPilote(config: ConfigPreuve, options: OptionsPreuve): Pilote {
  const pilote: Pilote = {
    client: new ClientBitbucket(config.client, options.recuperer),
    config,
    echecs: 0,
    exec: options.exec ?? executeurParDefaut,
    cli: options.cli ?? commandeForge(),
    attente: options.attente ?? {},
    verifier: (nom, ok, detail) => {
      etape(nom, ok, detail);
      if (!ok) pilote.echecs += 1;
    },
  };
  return pilote;
}

/** 0. Installation : opt-in (`MAC_BB_INSTALLER=1`) et app déjà absente. */
async function etapeInstallation(p: Pilote): Promise<boolean> {
  if (!p.config.installer) {
    p.verifier('App Capteur dans l’espace', true, 'installation non demandée (MAC_BB_INSTALLER≠1)');
    return true;
  }
  try {
    const resultat = await installerSiAbsente(p.config.client.workspace, p.exec, p.cli);
    const ok = resultat.etat === 'deja' || resultat.etat === 'installe';
    p.verifier('App Capteur dans l’espace', ok, `${resultat.etat} — ${resultat.raison}`);
    return ok;
  } catch (erreur) {
    p.verifier('App Capteur dans l’espace', false, String(erreur));
    return false;
  }
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
    console.log(`  · URL de la pull request : ${urlPullRequest(pr)}`);
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

/**
 * 7. Merge check : attendre son apparition, puis afficher le vrai verdict.
 *
 * Si les contrôles ne viennent jamais, l'étape échoue **avec un message clair**
 * (pas de trace d'exception) et les opérations manuelles sont imprimées à la
 * suite par `afficherManuelles`.
 */
async function etapeMergeCheck(p: Pilote, pr: PullRequest | undefined): Promise<boolean> {
  const delai = p.attente.attenteMs ?? ATTENTE_CONTROLES_MS;
  try {
    const controles = await p.client.attendreControles(p.config.repo, pr?.id ?? 0, p.attente);
    if (!controles) {
      p.verifier('Merge check du Capteur', false, `aucun contrôle exposé après ${Math.round(delai / 1000)} s — opérations manuelles restantes ci-dessous`);
      return false;
    }
    afficherControles(controles);
    const lignes = lignesVerdict(controles);
    p.verifier('Merge check du Capteur', lignes.length > 0, lignes.length ? lignes.join(' | ') : 'aucun contrôle personnalisé exposé');
    return lignes.length > 0;
  } catch (erreur) {
    p.verifier('Merge check du Capteur', false, String(erreur));
    return false;
  }
}

/** 8. Jetons d'accès : lister si l'API les expose (jamais en créer). */
async function etapeJetons(p: Pilote): Promise<void> {
  try {
    const jetons = await p.client.listerJetonsAcces(p.config.repo);
    const detail = jetons === undefined ? 'non exposés par l’API REST (information)' : `${jetons.length} jeton(s)`;
    p.verifier('Jetons d’accès de dépôt', true, detail);
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
export async function executerPreuve(config: ConfigPreuve, options: OptionsPreuve = {}): Promise<number> {
  const p = creerPilote(config, options);

  await etapeInstallation(p);
  const depots = await etapeAcces(p);
  if (!depots) return p.echecs;

  if (!(await etapeDepot(p, depots))) return p.echecs;
  if (!(await etapeBranche(p))) return p.echecs;
  if (!(await etapeFichier(p))) return p.echecs;

  const pr = await etapePullRequest(p);
  if (!pr) return p.echecs;

  await etapeEtat(p, pr);
  await etapeMergeCheck(p, pr);
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
  if (echecs > 0) {
    console.log('\nLa preuve n’est pas concluante : les étapes en échec et les opérations ci-dessus disent quoi faire.');
  }
  console.log(`\n${echecs === 0 ? 'Preuve Bitbucket concluante' : `${echecs} étape(s) en échec`}\n`);
  process.exit(echecs === 0 ? 0 : 1);
}

/* L'import (par les tests) ne doit rien exécuter : `vitest` pose `VITEST=true`.
 * À l'invocation directe (`vite-node scripts/preuve-bitbucket.ts`), la variable
 * est absente et le scénario se joue. */
if (!process.env.VITEST) {
  main();
}
