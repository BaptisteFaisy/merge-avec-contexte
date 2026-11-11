#!/usr/bin/env node
/**
 * Démonstration de bout en bout, gratuite, contre l'app Forge déployée.
 *
 * Le script ne simule rien : il signe ses requêtes avec le contrat partagé
 * (`shared/src/bridge/sign.ts`) et les envoie au web trigger du Cerveau, qui
 * évalue réellement les règles, lit ses données et répond. Il joue le parcours
 * du cahier des charges : PR bloquée avec le message imposé du §9, carte
 * détaillée, dérogation demandée puis accordée, incident ouvert avec voie
 * rapide pour le correctif lié, puis contrôle qu'une requête non signée est
 * refusée.
 *
 * Usage :
 *   MAC_BRIDGE_URL=https://… MAC_SHARED_SECRET=… npm run demo
 * Variables facultatives : MAC_WORKSPACE (défaut `ws-demo`), MAC_LOCALE (`fr`).
 *
 * Aucune dépendance : le contrat partagé fournit la signature et les types.
 */
import { signRequest } from '../shared/src/bridge/sign';

const REPO = 'checkout-api';
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

const pr = (id: number, cle: string, branche: string) => ({
  workspaceUuid: '',
  repositoryUuid: REPO,
  repositorySlug: REPO,
  pullRequestId: id,
  trigger: 'on-code-pushed',
  issueKeys: [cle],
  sourceBranch: branche,
  targetBranch: 'main',
});

/** Payload d'évaluation pour une PR du jeu de démonstration. */
export function payloadPr(config: Configuration, id: number, cle: string, branche: string, trigger = 'on-code-pushed') {
  return { ...pr(id, cle, branche), workspaceUuid: config.workspace, trigger };
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

/**
 * Neutralise les dérogations encore en vigueur sur la PR de démonstration.
 *
 * Une démonstration se rejoue : sans cette remise à zéro, les dérogations
 * accordées aux passages précédents continueraient de lever les règles, et la
 * PR #42 finirait par passer — ce qui ferait échouer la première étape.
 * La liste vient de la carte de PR, la neutralisation passe par la route
 * publique des dérogations : aucune route réservée n'est ajoutée pour la démo.
 */
export async function remettreAZero(config: Configuration): Promise<number> {
  const carte = await appeler(config, 'card', payloadPr(config, 42, 'PAY-123', 'feature/PAY-123-limite-tentatives'));
  const waivers = ((carte.corps as { waivers?: Array<{ id?: string }> })?.waivers ?? []);
  for (const waiver of waivers) {
    if (waiver.id) {
      await appeler(config, 'waiver.decide', { waiverId: waiver.id, decision: 'refused', decidedBy: 'demo' });
    }
  }
  return waivers.length;
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

  const p42 = await appeler(config, 'evaluate', payloadPr(config, 42, 'PAY-123', 'feature/PAY-123-limite-tentatives'));
  const bloque = verdictDe(p42.corps) === 'blocked';
  verifier('PR #42 bloquée', bloque, `verdict ${verdictDe(p42.corps)}`, p42.ms);
  if (bloque) afficherMessage(messageDe(p42.corps));

  const carte = await appeler(config, 'card', payloadPr(config, 42, 'PAY-123', 'feature/PAY-123-limite-tentatives'));
  const regles = ((carte.corps as { rules?: unknown[] })?.rules ?? []).length;
  verifier('Carte de PR détaillée', carte.status === 200 && regles > 0, `${regles} règle(s) exposée(s)`, carte.ms);

  // La règle visée est R-03 (critères d'acceptation) : PAY-123 en a deux non
  // cochés, quel que soit l'état laissé par une démonstration précédente.
  const demande = await appeler(config, 'waiver.request', {
    prId: 42, repositoryUuid: REPO, rule: 'R-03', hours: 2,
    reason: 'correctif de prix avant l’ouverture', requestedBy: 'lea', issueKey: 'PAY-123',
  });
  const waiverId = String((demande.corps as { id?: string })?.id ?? '');
  verifier('Dérogation demandée', demande.status === 200 && waiverId !== '', `dérogation ${waiverId}`, demande.ms);

  const accord = await appeler(config, 'waiver.decide', { waiverId, decision: 'granted', decidedBy: 'tech-lead', hours: 2 });
  verifier('Dérogation accordée', accord.status === 200, 'par tech-lead, 2 h', accord.ms);

  const apres = await appeler(config, 'evaluate', payloadPr(config, 42, 'PAY-123', 'feature/PAY-123-limite-tentatives', 'on-merge'));
  const sansCritere = !messageDe(apres.corps).includes('critère');
  verifier(
    'La dérogation lève la règle visée',
    sansCritere,
    `${raisonsBloquantes(apres.corps)} blocage(s) restant(s)`,
    apres.ms,
  );

  const remise = await appeler(config, 'waiver.decide', { waiverId, decision: 'refused', decidedBy: 'demo' });
  const apresRemise = await appeler(config, 'evaluate', payloadPr(config, 42, 'PAY-123', 'feature/PAY-123-limite-tentatives'));
  verifier(
    'Dérogation retirée, la règle rebloque',
    remise.status === 200 && verdictDe(apresRemise.corps) === 'blocked',
    `verdict ${verdictDe(apresRemise.corps)}`,
    apresRemise.ms,
  );

  const p43 = await appeler(config, 'evaluate', payloadPr(config, 43, 'PAY-124', 'feature/PAY-124-journal-refus'));
  verifier('PR #43 bloquée par l’incident', verdictDe(p43.corps) === 'blocked', messageDe(p43.corps).split('\n')[1] ?? '', p43.ms);

  const p44 = await appeler(config, 'evaluate', payloadPr(config, 44, 'PAY-140', 'hotfix/PAY-140-incident-52', 'on-merge'));
  verifier('Correctif lié à l’incident autorisé', verdictDe(p44.corps) === 'allowed', messageDe(p44.corps).split('\n')[0], p44.ms);

  const nue = await appeler(config, 'evaluate', payloadPr(config, 42, 'PAY-123', 'x'), false);
  verifier('Requête non signée refusée', nue.status === 401, `HTTP ${nue.status}`, nue.ms);

  return echecs;
}

/** Point d'entrée : configuration, démonstration, code de sortie. */
async function main(): Promise<void> {
  const config = lireConfiguration(process.env);
  if (!config) process.exit(2);
  console.log(`\nDémonstration « Merge avec contexte » — ${maintenant()}\n`);
  const echecs = await demonstration(config);
  console.log(`\n${echecs === 0 ? 'Démonstration réussie' : `${echecs} étape(s) en échec`}\n`);
  process.exit(echecs === 0 ? 0 : 1);
}

/**
 * Vrai si le fichier est exécuté (et non importé par un test).
 *
 * Sous `vite-node`, `process.argv[1]` est le binaire du lanceur, pas le
 * script : on compare donc le module à lui-même par son URL.
 */
export function estExecute(): boolean {
  // Sous vitest le module est importé, pas exécuté : sans cette garde, les
  // tests déclencheraient de vraies requêtes HTTP vers le pont.
  if (process.env.VITEST) return false;
  return process.argv[1]?.endsWith('demo-e2e.ts') === true
    || import.meta.url.endsWith('/scripts/demo-e2e.ts');
}

if (estExecute()) main();
