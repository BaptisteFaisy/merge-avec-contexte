#!/usr/bin/env node
/**
 * Démonstration de bout en bout, gratuite, contre l'app Forge déployée.
 *
 * Le script ne simule rien : il signe ses requêtes avec le contrat partagé
 * (`shared/src/bridge/sign.ts`) et les envoie au web trigger du Cerveau, qui
 * évalue réellement les règles, lit ses données et répond. Il joue le parcours
 * du cahier des charges : PR bloquée avec le message imposé du §9, carte
 * détaillée, dérogation demandée puis accordée, parcours de l'astreinte
 * (incident ouvert : rien ne part sur le service, sauf le correctif lié, §3 et
 * §7.2), les trois déclencheurs du contrôle (MC-02) avec le déclencheur de
 * fusion qui rattrape un contexte changé entre le push et la fusion (§13.2,
 * §17 cas 4), gel de branche réellement actif (§18 sc. 2), mode observation
 * (§7.3), R-06/R-07 (blocage par un autre ticket, version publiée),
 * R-02 (statut interdit) et R-13 (dépendance amont non livrée), puis contrôle
 * qu'une requête non signée est refusée.
 *
 * Usage :
 *   MAC_BRIDGE_URL=https://… MAC_SHARED_SECRET=… npm run demo
 *   MAC_BRIDGE_URL=https://… MAC_SHARED_SECRET=… npm run demo -- --reset
 *
 * Variables facultatives : MAC_WORKSPACE (défaut `ws-demo`), MAC_LOCALE (`fr`).
 *
 * `--reset` neutralise les dérogations encore en vigueur sur toutes les PR du
 * jeu de démonstration, puis s'arrête : le pont signé est la seule voie
 * d'écriture, aucune route réservée n'est ajoutée.
 *
 * Aucune dépendance : le contrat partagé fournit la signature et les types.
 */
import { signRequest } from '../shared/src/bridge/sign';

const maintenant = () => new Date().toISOString();

export interface Configuration {
  url: string;
  secret: string;
  workspace: string;
}

/** Lit et valide l'environnement ; explique quoi poser et sort en 2 si absent. */
export function lireConfiguration(env: Record<string, string | undefined>): Configuration | undefined {
  const url = env.MAC_BRIDGE_URL?.trim();
  const secret = env.MAC_SHARED_SECRET?.trim();
  if (!url || !secret) {
    const manquantes = [!url && 'MAC_BRIDGE_URL', !secret && 'MAC_SHARED_SECRET'].filter(Boolean);
    console.error(`Variables manquantes : ${manquantes.join(', ')}`);
    console.error('  forge webtrigger create -f pont-bitbucket -e production -s <site> -p jira');
    console.error('  forge variables set MAC_SHARED_SECRET <secret> -e production --encrypt');
    return undefined;
  }
  return { url, secret, workspace: env.MAC_WORKSPACE?.trim() || 'ws-demo' };
}

interface Reponse {
  status: number;
  corps: unknown;
  ms: number;
}

/** Envoie une requête signée ; rend le statut, le corps JSON et la durée. */
export async function appeler(config: Configuration, route: string, payload: unknown, signer = true): Promise<Reponse> {
  const body = JSON.stringify({ route, payload });
  const entetes: Record<string, string> = { 'content-type': 'application/json' };
  if (signer) Object.assign(entetes, signRequest({ secret: config.secret, body }).headers);
  const debut = Date.now();
  const reponse = await fetch(config.url, { method: 'POST', headers: entetes, body });
  const texte = await reponse.text();
  let corps: unknown = texte;
  try {
    corps = JSON.parse(texte);
  } catch {
    /* corps non JSON : on garde le texte */
  }
  return { status: reponse.status, corps, ms: Date.now() - debut };
}

/** Dépôt par défaut des scénarios qui ne visent pas un service en incident. */
const DEPOT_DEFAUT = 'checkout-api';

/** Une PR du jeu de démonstration : tout ce que les scénarios demandent. */
export interface PrDemo {
  id: number;
  cle: string;
  source: string;
  target: string;
  depot: string;
  trigger?: string;
}

/**
 * PR du jeu de démonstration, par numéro. Les tickets PAY-125, PAY-130,
 * PAY-131, PAY-132 et PAY-133 sont joués sur `pricing-api` (aucun incident) :
 * le verdict rendu isole la règle visée au lieu d'ajouter le blocage R-05.
 */
export const PRS_DEMO: PrDemo[] = [
  { id: 42, cle: 'PAY-123', source: 'feature/PAY-123-limite-tentatives', target: 'main', depot: 'checkout-api' },
  { id: 43, cle: 'PAY-124', source: 'feature/PAY-124-journal-refus', target: 'main', depot: 'checkout-api' },
  { id: 44, cle: 'PAY-140', source: 'hotfix/PAY-140-incident-52', target: 'main', depot: 'checkout-api', trigger: 'on-merge' },
  { id: 45, cle: 'PAY-130', source: 'release/PAY-130-affichage-remises', target: 'release/1.4', depot: 'pricing-api' },
  { id: 46, cle: 'PAY-131', source: 'feature/PAY-131-fournisseur-externe', target: 'main', depot: 'pricing-api' },
  { id: 47, cle: 'PAY-125', source: 'feature/PAY-125-latence-panier', target: 'main', depot: 'pricing-api' },
  { id: 48, cle: 'PAY-130', source: 'feature/PAY-130-affichage-remises', target: 'main', depot: 'pricing-api' },
  { id: 49, cle: 'PAY-132', source: 'feature/PAY-132-paiement-livraison', target: 'main', depot: 'pricing-api' },
  { id: 50, cle: 'PAY-133', source: 'feature/PAY-133-remises-fidelite', target: 'main', depot: 'pricing-api' },
];

/** Charge utile d'évaluation pour une PR du jeu de démonstration. */
export function payloadPr(
  config: Configuration,
  id: number,
  cle: string,
  branche: string,
  trigger = 'on-code-pushed',
  depot = DEPOT_DEFAUT,
  cible = 'main',
) {
  return {
    workspaceUuid: config.workspace,
    repositoryUuid: depot,
    repositorySlug: depot,
    pullRequestId: id,
    trigger,
    issueKeys: [cle],
    sourceBranch: branche,
    targetBranch: cible,
  };
}

/** Charge utile d'une PR listée dans `PRS_DEMO`. */
export function payloadDe(config: Configuration, pr: PrDemo, trigger?: string) {
  return payloadPr(config, pr.id, pr.cle, pr.source, trigger ?? pr.trigger ?? 'on-code-pushed', pr.depot, pr.target);
}

/** PR du jeu de démonstration par numéro. */
export function prParId(id: number): PrDemo {
  const trouve = PRS_DEMO.find((pr) => pr.id === id);
  if (!trouve) throw new Error(`PR #${id} absente du jeu de démonstration`);
  return trouve;
}

const verdictDe = (corps: unknown): string => String((corps as { verdict?: string }).verdict ?? '?');

/** Raisons qui bloquent réellement : ni journalisées en observation, ni dérogées. */
export function raisonsBloquantes(corps: unknown): number {
  const raisons = ((corps as { reasons?: Array<{ level?: string; waived?: boolean; observed?: boolean }> })?.reasons ?? []);
  return raisons.filter((raison) => raison.level === 'blocking' && raison.waived !== true && raison.observed !== true).length;
}
const messageDe = (corps: unknown): string => String((corps as { message?: string }).message ?? '');

/** Affiche le message du §9 tel que Bitbucket l'afficherait. */
export function afficherMessage(message: string): void {
  for (const ligne of message.split('\n')) console.log(`        │ ${ligne}`);
}

const reussi = (condition: boolean): string => (condition ? 'OK  ' : 'ÉCHEC');

/** Une étape mesurée, affichée au fil de l'eau. */
export function etape(nom: string, reussie: boolean, detail: string, ms = 0): void {
  const duree = ms > 0 ? ` (${ms} ms)` : '';
  console.log(`${reussi(reussie)} ${nom}${duree}${detail ? ` — ${detail}` : ''}`);
}

/** Annonce un parcours : une ligne de récit avant ses étapes. */
export function annonce(titre: string): void {
  console.log(`\n— ${titre} —`);
}

/** Vrai si le message contient chacun des mots demandés. */
function contient(message: string, ...mots: string[]): boolean {
  return mots.every((mot) => message.includes(mot));
}

type Verifier = (nom: string, condition: boolean, detail: string, ms?: number) => void;

/**
 * Neutralise les dérogations encore en vigueur sur toutes les PR du jeu de
 * démonstration.
 *
 * Une démonstration se rejoue : sans cette remise à zéro, les dérogations
 * accordées aux passages précédents continueraient de lever les règles, et la
 * PR #42 finirait par passer — ce qui ferait échouer la première étape.
 * La liste vient de la carte de chaque PR, la neutralisation passe par la route
 * publique des dérogations : aucune route réservée n'est ajoutée pour la démo.
 */
export async function remettreAZero(config: Configuration): Promise<number> {
  let neutralisees = 0;
  for (const pr of PRS_DEMO) {
    const carte = await appeler(config, 'card', payloadDe(config, pr));
    const waivers = ((carte.corps as { waivers?: Array<{ id?: string }> })?.waivers ?? []);
    for (const waiver of waivers) {
      if (waiver.id) {
        await appeler(config, 'waiver.decide', { waiverId: waiver.id, decision: 'refused', decidedBy: 'demo' });
        neutralisees += 1;
      }
    }
  }
  return neutralisees;
}

/**
 * §3 et §7.2, parcours de l'astreinte : l'incident INC-52 est ouvert sur
 * `checkout-api`. Deux PR visent ce service pendant l'incident : #43 (PAY-124,
 * sans lien avec l'incident) ne part pas ; #44 (PAY-140, correctif lié à
 * INC-52) passe, avec la mention « correctif d'incident ».
 */
async function jouerAstreinte(config: Configuration, verifier: Verifier): Promise<void> {
  annonce('Parcours de l’astreinte (§3, §7.2) : incident INC-52 ouvert sur checkout-api, deux PR visent le service');
  const horsIncident = await appeler(config, 'evaluate', payloadDe(config, prParId(43)));
  verifier(
    'Astreinte : la PR sans lien avec l’incident ne part pas (#43, PAY-124)',
    verdictDe(horsIncident.corps) === 'blocked' && contient(messageDe(horsIncident.corps), 'INC-52', 'checkout-api'),
    messageDe(horsIncident.corps).split('\n')[1] ?? '',
    horsIncident.ms,
  );
  const correctif = await appeler(config, 'evaluate', payloadDe(config, prParId(44)));
  verifier(
    'Astreinte : seul le correctif lié à l’incident passe (#44, PAY-140)',
    verdictDe(correctif.corps) === 'allowed' && contient(messageDe(correctif.corps), 'Correctif d’incident INC-52'),
    messageDe(correctif.corps).split('\n')[0],
    correctif.ms,
  );
}

/**
 * MC-02 : le contrôle s'exécute aux trois déclencheurs — push, changement
 * d'avis d'un relecteur, tentative de fusion (§13.2). Le dernier prouve sa
 * raison d'être : il rattrape un contexte changé entre le push et la fusion
 * (§17 cas 4). Le changement est posé via une dérogation accordée entre les
 * deux évaluations : c'est la seule écriture que le pont signé expose ; un gel
 * qui commence ou un incident qui s'ouvre entre-temps serait rattrapé de même.
 * PR #47 (PAY-125, pricing-api) : R-06 la bloque seule, verdict déterministe.
 */
async function jouerDeclencheurs(config: Configuration, verifier: Verifier): Promise<void> {
  annonce('Les trois déclencheurs du contrôle (MC-02, §13.2) — PR #47 bloquée par R-06 (PAY-126 non livré)');
  const pr = prParId(47);
  const push = await appeler(config, 'evaluate', payloadDe(config, pr, 'on-code-pushed'));
  verifier(
    'Déclencheur push : PR #47 contrôlée et bloquée',
    verdictDe(push.corps) === 'blocked',
    `verdict ${verdictDe(push.corps)}`,
    push.ms,
  );
  const relecteur = await appeler(config, 'evaluate', payloadDe(config, pr, 'on-reviewer-status-changed'));
  verifier(
    'Déclencheur changement d’avis d’un relecteur : contrôle rejoué',
    verdictDe(relecteur.corps) === 'blocked',
    `verdict ${verdictDe(relecteur.corps)}`,
    relecteur.ms,
  );
  // Contexte changé entre le push et la fusion : PAY-126 est livré « pour de
  // vrai » dans la foulée ; en attendant, une dérogation R-06 de 2 h le simule.
  const demande = await appeler(config, 'waiver.request', {
    prId: pr.id, repositoryUuid: pr.depot, rule: 'R-06', hours: 2,
    reason: 'PAY-126 livré dans la foulée', requestedBy: 'lea', issueKey: pr.cle,
  });
  const waiverId = String((demande.corps as { id?: string })?.id ?? '');
  const accord = await appeler(config, 'waiver.decide', { waiverId, decision: 'granted', decidedBy: 'tech-lead', hours: 2 });
  const fusion = await appeler(config, 'evaluate', payloadDe(config, pr, 'on-merge'));
  verifier(
    'Déclencheur fusion : le contexte changé entre le push et la fusion est rattrapé (§17 cas 4)',
    accord.status === 200 && verdictDe(fusion.corps) === 'allowed',
    `push ${verdictDe(push.corps)} → fusion ${verdictDe(fusion.corps)}`,
    fusion.ms,
  );
  await appeler(config, 'waiver.decide', { waiverId, decision: 'refused', decidedBy: 'demo' });
}

/** §18 scénario 2 : un gel court, actif à l'instant, bloque la branche release. */
async function jouerGelActif(config: Configuration, verifier: Verifier): Promise<void> {
  const rep = await appeler(config, 'evaluate', payloadDe(config, prParId(45)));
  const message = messageDe(rep.corps);
  verifier(
    'PR #45 sur release/1.4 bloquée par le gel actif',
    verdictDe(rep.corps) === 'blocked' && contient(message, 'Fenêtre release', 'release/1.4', 'jusqu’au'),
    message.split('\n')[1] ?? '',
    rep.ms,
  );
}

/** §7.3 : une règle bloquante passée en observation n'affiche ni ne bloque plus. */
async function jouerObservation(config: Configuration, verifier: Verifier): Promise<void> {
  const pr = prParId(46);
  const evaluation = await appeler(config, 'evaluate', payloadDe(config, pr));
  const carte = await appeler(config, 'card', payloadDe(config, pr));
  const raisons = ((carte.corps as { reasons?: Array<{ rule?: string; observed?: boolean; level?: string }> })?.reasons ?? []);
  const observee = raisons.find((raison) => raison.rule === 'R-09');
  const regle = ((carte.corps as { rules?: Array<{ rule: string; mode: string }> })?.rules ?? []).find((entree) => entree.rule === 'R-09');
  verifier(
    'Règle bloquante en observation ne bloque plus (PAY-131)',
    verdictDe(evaluation.corps) === 'allowed' && !messageDe(evaluation.corps).includes('sécurité'),
    `verdict ${verdictDe(evaluation.corps)}`,
    evaluation.ms,
  );
  verifier(
    'L’observation est journalisée, pas affichée',
    observee?.observed === true && regle?.mode === 'observe',
    `R-09 observée, ${raisons.length} raison(s) exposée(s)`,
    carte.ms,
  );
}

/** R-06 : PAY-125 est bloqué par PAY-126, qui n'est pas livré. */
async function jouerR06(config: Configuration, verifier: Verifier): Promise<void> {
  const rep = await appeler(config, 'evaluate', payloadDe(config, prParId(47)));
  const message = messageDe(rep.corps);
  verifier(
    'R-06 bloque PAY-125 (PAY-126 non livré)',
    verdictDe(rep.corps) === 'blocked' && contient(message, 'PAY-125', 'PAY-126'),
    message.split('\n')[1] ?? '',
    rep.ms,
  );
}

/** R-07 : PAY-130 vise une version déjà publiée, la fusion resterait sans effet. */
async function jouerR07(config: Configuration, verifier: Verifier): Promise<void> {
  const rep = await appeler(config, 'evaluate', payloadDe(config, prParId(48)));
  const message = messageDe(rep.corps);
  verifier(
    'R-07 avertit PAY-130 (version 2.3.0 déjà publiée)',
    verdictDe(rep.corps) === 'allowed' && contient(message, '2.3.0'),
    message.split('\n')[0],
    rep.ms,
  );
}

/** R-02 : PAY-132 est au statut « Suspendu », hors statuts autorisés. */
async function jouerR02(config: Configuration, verifier: Verifier): Promise<void> {
  const rep = await appeler(config, 'evaluate', payloadDe(config, prParId(49)));
  const message = messageDe(rep.corps);
  verifier(
    'R-02 bloque PAY-132 (statut interdit)',
    verdictDe(rep.corps) === 'blocked' && contient(message, 'PAY-132', 'Suspendu'),
    message.split('\n')[1] ?? '',
    rep.ms,
  );
}

/** R-13 : PAY-133 a une dépendance amont PAY-134 qui n'est pas livrée. */
async function jouerR13(config: Configuration, verifier: Verifier): Promise<void> {
  const pr = prParId(50);
  const rep = await appeler(config, 'evaluate', payloadDe(config, pr));
  // D'autres règles peuvent bloquer en même temps (heures calmes la nuit, par
  // exemple) : on cherche la raison R-13 parmi toutes, pas en première ligne.
  const carte = await appeler(config, 'card', payloadDe(config, pr));
  const raisons = ((carte.corps as { reasons?: Array<{ rule?: string; text?: string }> })?.reasons ?? []);
  const dependance = raisons.find((raison) => raison.rule === 'R-13');
  verifier(
    'R-13 bloque PAY-133 (dépendance PAY-134 non livrée)',
    verdictDe(rep.corps) === 'blocked' && dependance !== undefined && contient(dependance.text ?? '', 'PAY-134'),
    dependance?.text ?? messageDe(rep.corps).split('\n')[1] ?? '',
    rep.ms,
  );
}

/** Démonstration complète ; rend le nombre d'échecs. */
export async function demonstration(config: Configuration): Promise<number> {
  let echecs = 0;
  const verifier = (nom: string, condition: boolean, detail: string, ms = 0) => {
    etape(nom, condition, detail, ms);
    if (!condition) echecs += 1;
  };

  const neutralisees = await remettreAZero(config);
  if (neutralisees > 0) etape('Dérogations précédentes neutralisées', true, `${neutralisees} dérogation(s)`);

  const sante = await appeler(config, 'health', {});
  verifier('Le pont répond', sante.status === 200, `stockage ${String((sante.corps as { stockage?: string })?.stockage ?? '?')}`, sante.ms);

  const p42 = await appeler(config, 'evaluate', payloadDe(config, prParId(42)));
  const bloque = verdictDe(p42.corps) === 'blocked';
  verifier('PR #42 bloquée', bloque, `verdict ${verdictDe(p42.corps)}`, p42.ms);
  if (bloque) afficherMessage(messageDe(p42.corps));

  const carte = await appeler(config, 'card', payloadDe(config, prParId(42)));
  const regles = ((carte.corps as { rules?: unknown[] })?.rules ?? []).length;
  verifier('Carte de PR détaillée', carte.status === 200 && regles > 0, `${regles} règle(s) exposée(s)`, carte.ms);

  // La règle visée est R-03 (critères d'acceptation) : PAY-123 en a deux non
  // cochés, quel que soit l'état laissé par une démonstration précédente.
  const demande = await appeler(config, 'waiver.request', {
    prId: 42, repositoryUuid: DEPOT_DEFAUT, rule: 'R-03', hours: 2,
    reason: 'correctif de prix avant l’ouverture', requestedBy: 'lea', issueKey: 'PAY-123',
  });
  const waiverId = String((demande.corps as { id?: string })?.id ?? '');
  verifier('Dérogation demandée', demande.status === 200 && waiverId !== '', `dérogation ${waiverId}`, demande.ms);

  const accord = await appeler(config, 'waiver.decide', { waiverId, decision: 'granted', decidedBy: 'tech-lead', hours: 2 });
  verifier('Dérogation accordée', accord.status === 200, 'par tech-lead, 2 h', accord.ms);

  const apres = await appeler(config, 'evaluate', payloadDe(config, prParId(42), 'on-merge'));
  const sansCritere = !messageDe(apres.corps).includes('critère');
  verifier(
    'La dérogation lève la règle visée',
    sansCritere,
    `${raisonsBloquantes(apres.corps)} blocage(s) restant(s)`,
    apres.ms,
  );

  const remise = await appeler(config, 'waiver.decide', { waiverId, decision: 'refused', decidedBy: 'demo' });
  const apresRemise = await appeler(config, 'evaluate', payloadDe(config, prParId(42)));
  verifier(
    'Dérogation retirée, la règle rebloque',
    remise.status === 200 && verdictDe(apresRemise.corps) === 'blocked',
    `verdict ${verdictDe(apresRemise.corps)}`,
    apresRemise.ms,
  );

  await jouerAstreinte(config, verifier);

  await jouerGelActif(config, verifier);
  await jouerObservation(config, verifier);
  await jouerR06(config, verifier);
  await jouerR07(config, verifier);
  await jouerR02(config, verifier);
  await jouerR13(config, verifier);
  await jouerDeclencheurs(config, verifier);

  const nue = await appeler(config, 'evaluate', payloadDe(config, prParId(42)), false);
  verifier('Requête non signée refusée', nue.status === 401, `HTTP ${nue.status}`, nue.ms);

  return echecs;
}

/** Remise à zéro seule : neutralise puis s'arrête, sans jouer les scénarios. */
async function reinitialiser(config: Configuration): Promise<void> {
  console.log('Remise à zéro du jeu de démonstration (via le pont signé)…');
  const neutralisees = await remettreAZero(config);
  console.log(`${neutralisees} dérogation(s) neutralisée(s).`);
}

/** Point d'entrée : configuration, remise à zéro ou démonstration, code de sortie. */
async function main(): Promise<void> {
  const config = lireConfiguration(process.env);
  if (!config) process.exit(2);
  if (process.argv.includes('--reset')) {
    await reinitialiser(config);
    process.exit(0);
  }
  console.log(`\nDémonstration « Merge avec contexte » — ${maintenant()}\n`);
  const echecs = await demonstration(config);
  console.log(`\n${echecs === 0 ? 'Démonstration réussie' : `${echecs} étape(s) en échec`}\n`);
  process.exit(echecs === 0 ? 0 : 1);
}

/**
 * Point d'entrée de la démonstration.
 *
 * L'appel se fait depuis `scripts/demo-entree.ts` : importer ce module (par un
 * test, ou par `scripts/preuve-reelle.ts`) ne lance jamais la démonstration —
 * c'était le défaut corrigé ici, l'import déclenchait la démonstration entière.
 */
export { main as lancerDemonstration };