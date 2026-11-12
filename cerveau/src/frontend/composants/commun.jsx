/**
 * Socle commun des écrans Jira du Cerveau (§12).
 *
 * - Dictionnaire bilingue des libellés de chrome : les textes métier viennent
 *   des modèles de vue (`cerveau/src/ui`) ou de `shared/message/strings.ts` ;
 *   ceux qui suivent n'ont de clé nulle part, ils restent ici.
 * - `useResolver` : chargement et appels du resolver Forge, avec état
 *   chargement / erreur / données — un écran n'est jamais blanc.
 * - `useUtilisateur` : le compte courant, joint à la charge utile des écrans qui
 *   doivent savoir si la personne peut agir (décider d'une dérogation).
 *
 * Contrat des resolvers (voir `cerveau/src/index.ts`) : chaque `invoke` renvoie
 * `{ locale, ... }` où les vues sont celles produites par `vmReglages`,
 * `vmEncart`, `vmConsole` et `vmJournal`.
 */
import React from 'react';
import { useCallback, useEffect, useState } from '@forge/react';
import { Box, Button, Heading, SectionMessage, Spinner, Stack, Text } from '@forge/react';
import { invoke, view } from '@forge/bridge';

const TEXTES = {
  'commun.chargement': { fr: 'Chargement…', en: 'Loading…' },
  'commun.erreur': { fr: 'Données indisponibles', en: 'Data unavailable' },
  'commun.erreurDetail': {
    fr: 'L’écran n’a pas pu joindre le Cerveau : {detail}',
    en: 'The screen could not reach Cerebro: {detail}',
  },
  'commun.enregistrer': { fr: 'Enregistrer', en: 'Save' },
  'commun.ajouter': { fr: 'Ajouter', en: 'Add' },
  'reglages.demo': { fr: 'Jeu de démonstration', en: 'Demo dataset' },
  'reglages.demoAide': {
    fr: 'Charge les tickets, les gels, l’incident et la correspondance du jeu d’exemple : la console de test et l’agent Rovo ont alors de la matière.',
    en: 'Loads the demo issues, freezes, incident and repository mapping so the test console and the Rovo agent have something to work with.',
  },
  'reglages.demoCharger': { fr: 'Charger le jeu de démonstration', en: 'Load demo dataset' },
  'commun.annuler': { fr: 'Annuler', en: 'Cancel' },
  'reglages.regles': { fr: 'Règles', en: 'Rules' },
  'reglages.niveau': { fr: 'Niveau', en: 'Level' },
  'reglages.mode': { fr: 'Mode', en: 'Mode' },
  'reglages.portee': { fr: 'Portée : {resume}', en: 'Scope: {resume}' },
  'reglages.jumelage': { fr: 'Jumelage Bitbucket', en: 'Bitbucket pairing' },
  'reglages.genererCode': { fr: 'Générer un code à usage unique', en: 'Generate a single-use code' },
  'reglages.codeEnCours': { fr: 'Code en cours : {code}', en: 'Pending code: {code}' },
  'reglages.codeValide': { fr: 'À saisir côté Bitbucket avant le {label}.', en: 'Enter it in Bitbucket before {label}.' },
  'reglages.codePerime': { fr: 'Code expiré : générez-en un nouveau.', en: 'Code expired: generate a new one.' },
  'reglages.site': { fr: 'Site Bitbucket jumelé', en: 'Paired Bitbucket site' },
  'reglages.repli': { fr: 'Politique de repli', en: 'Fallback policy' },
  'repli.open.option': { fr: 'Ouvert — la fusion reste possible', en: 'Open — the merge stays possible' },
  'repli.closed.option': { fr: 'Fermé — la fusion est bloquée', en: 'Closed — the merge is blocked' },
  'reglages.correspondance': { fr: 'Correspondance dépôt → service', en: 'Repository → service mapping' },
  'reglages.depot': { fr: 'Dépôt', en: 'Repository' },
  'reglages.service': { fr: 'Service', en: 'Service' },
  'reglages.composant': { fr: 'Composant (facultatif)', en: 'Component (optional)' },
  'reglages.approbateurs': { fr: 'Approbateurs de dérogations', en: 'Waiver approvers' },
  'reglages.approbateur': { fr: 'Nouvel approbateur', en: 'New approver' },
  'reglages.aucun': { fr: 'Rien d’enregistré pour l’instant.', en: 'Nothing recorded yet.' },
  'encart.prs': { fr: 'Pull requests du ticket', en: 'Pull requests of this issue' },
  'encart.aucunePr': { fr: 'Aucune PR connue pour ce ticket.', en: 'No known PR for this issue.' },
  'encart.derniere': { fr: 'Dernière évaluation', en: 'Latest evaluation' },
  'encart.message': { fr: 'Message affiché par le contrôle', en: 'Message shown by the check' },
  'encart.raisons': { fr: 'Raisons et marche à suivre', en: 'Reasons and next steps' },
  'encart.derogations': { fr: 'Dérogations en cours', en: 'Active waivers' },
  'encart.derogationAccordee': {
    fr: 'Accordée par {by} jusqu’au {until} : {reason}',
    en: 'Granted by {by} until {until}: {reason}',
  },
  'encart.aucuneDerogation': { fr: 'Aucune dérogation en cours.', en: 'No active waiver.' },
  'encart.demander': { fr: 'Demander une dérogation', en: 'Request a waiver' },
  'encart.regle': { fr: 'Règle', en: 'Rule' },
  'encart.motif': { fr: 'Motif', en: 'Reason' },
  'encart.heures': { fr: 'Durée (heures)', en: 'Duration (hours)' },
  'encart.envoyer': { fr: 'Envoyer la demande', en: 'Send the request' },
  'encart.decider': { fr: 'Demandes en attente de décision', en: 'Requests awaiting a decision' },
  'encart.aucuneDemande': { fr: 'Aucune demande en attente.', en: 'No pending request.' },
  'encart.demande': {
    fr: 'Demandée par {by} le {at} : {reason}',
    en: 'Requested by {by} on {at}: {reason}',
  },
  'encart.accorder': { fr: 'Accorder', en: 'Grant' },
  'encart.refuser': { fr: 'Refuser', en: 'Refuse' },
  'encart.dureeAccord': { fr: 'Durée de l’accord (heures, de 1 à 72)', en: 'Grant duration (hours, 1 to 72)' },
  'encart.decideurs': { fr: 'Qui peut décider', en: 'Who can decide' },
  'encart.aucunDecideur': {
    fr: 'Aucun approbateur dans l’annuaire : ajoutez-en depuis les réglages du projet.',
    en: 'No approver in the directory: add one from the project settings.',
  },
  'encart.motif.annuaire-vide': {
    fr: 'Décision impossible : l’annuaire des approbateurs est vide.',
    en: 'Cannot decide: the approver directory is empty.',
  },
  'encart.motif.non-approbateur': {
    fr: 'Décision impossible : elle est réservée aux approbateurs de l’annuaire.',
    en: 'Cannot decide: it is restricted to the approvers in the directory.',
  },
  'encart.decisions': { fr: 'Décisions prises', en: 'Decisions taken' },
  'encart.statut.refused': { fr: 'Refusée', en: 'Refused' },
  'encart.statut.expired': { fr: 'Expirée', en: 'Expired' },
  'encart.decision': {
    fr: '{statut} — décidée par {by}{echeance} : {reason}',
    en: '{statut} — decided by {by}{echeance}: {reason}',
  },
  'encart.jusquAu': { fr: ' jusqu’au {until}', en: ' until {until}' },
  'encart.avis.accordee': { fr: 'Dérogation accordée.', en: 'Waiver granted.' },
  'encart.avis.refusee': { fr: 'Dérogation refusée.', en: 'Waiver refused.' },
  'encart.avis.non-approbateur': {
    fr: 'Décision non appliquée : seul un approbateur de l’annuaire peut trancher.',
    en: 'Decision not applied: only an approver from the directory can decide.',
  },
  'encart.avis.introuvable': {
    fr: 'Décision non appliquée : aucune dérogation de ce ticket ne correspond.',
    en: 'Decision not applied: no matching waiver for this issue.',
  },
  'encart.avis.deja-decidee': {
    fr: 'Décision non appliquée : cette dérogation a déjà été tranchée.',
    en: 'Decision not applied: this waiver has already been decided.',
  },
  'console.titre': { fr: 'Console de test', en: 'Test console' },
  'console.ticket': { fr: 'Ticket', en: 'Issue key' },
  'console.branche': { fr: 'Branche cible', en: 'Target branch' },
  'console.depot': { fr: 'Dépôt', en: 'Repository' },
  'console.simuler': { fr: 'Simuler la PR', en: 'Simulate the PR' },
  'console.apercu': { fr: 'Aperçu — le message exact du contrôle', en: 'Preview — the exact check message' },
  'console.pasApercu': {
    fr: 'Renseignez le ticket et le dépôt, puis simulez.',
    en: 'Fill in the issue and repository, then simulate.',
  },
  'console.succes': { fr: 'le contrôle laisse passer la fusion', en: 'the check lets the merge through' },
  'console.echec': { fr: 'le contrôle bloque la fusion', en: 'the check blocks the merge' },
  'journal.titre': { fr: 'Journal des évaluations', en: 'Evaluation log' },
  'journal.statistiques': { fr: 'Statistiques', en: 'Statistics' },
  'journal.total': { fr: 'Évaluations', en: 'Evaluations' },
  'journal.allowed': { fr: 'Autorisées', en: 'Allowed' },
  'journal.blocked': { fr: 'Bloquées', en: 'Blocked' },
  'journal.inconclusive': { fr: 'Non concluantes', en: 'Inconclusive' },
  'journal.duree': { fr: 'Durée moyenne (ms)', en: 'Average duration (ms)' },
  'journal.aucune': { fr: 'Aucune évaluation au journal.', en: 'No evaluation logged.' },
  'journal.observation': { fr: 'Rapport d’observation', en: 'Observation report' },
  'journal.observed': { fr: 'Évaluations observées', en: 'Observed evaluations' },
  'journal.wouldHaveBlocked': { fr: 'Auraient été bloquées', en: 'Would have been blocked' },
  // — Item 98 : états vides expliqués (dire quoi faire, pas une liste vide) —
  'vide.prs.titre': { fr: 'Aucune pull request évaluée', en: 'No evaluated pull request' },
  'vide.prs.texte': {
    fr: 'Ce ticket n’a encore aucune PR évaluée. Reliez un dépôt à un service dans les réglages du projet (ou chargez le jeu de démonstration), puis ouvrez une PR qui cite ce ticket : le contrôle apparaîtra ici.',
    en: 'No PR for this issue has been evaluated yet. Map a repository to a service in the project settings (or load the demo dataset), then open a PR citing this issue: the check will appear here.',
  },
  'vide.derogations.titre': { fr: 'Aucune dérogation en cours', en: 'No active waiver' },
  'vide.demandes.titre': { fr: 'Aucune demande à trancher', en: 'No request to decide' },
  'vide.demandes.texte': {
    fr: 'Quand une PR est bloquée, son auteur peut demander une dérogation depuis cet encart : elle apparaîtra ici pour les approbateurs.',
    en: 'When a PR is blocked, its author can request a waiver from this panel: it will show up here for approvers.',
  },
  // — Item 99 : confirmation avant une action qui change l’état —
  'confirm.titre': { fr: 'Confirmer l’action', en: 'Confirm the action' },
  'confirm.confirmer': { fr: 'Confirmer', en: 'Confirm' },
  'confirm.accorder.consequence': {
    fr: 'Vous accordez une dérogation : la règle cessera de bloquer les PR citant ce ticket jusqu’à l’échéance choisie. La décision est tracée.',
    en: 'You are granting a waiver: the rule will stop blocking PRs citing this issue until the chosen expiry. The decision is recorded.',
  },
  'confirm.refuser.consequence': {
    fr: 'Vous refusez la dérogation : la règle continuera de bloquer les PR citant ce ticket. La décision est tracée.',
    en: 'You are refusing the waiver: the rule will keep blocking PRs citing this issue. The decision is recorded.',
  },
  'confirm.demander.consequence': {
    fr: 'Vous envoyez une demande de dérogation : les approbateurs de l’annuaire seront notifiés pour la trancher.',
    en: 'You are sending a waiver request: the approvers in the directory will be notified to decide on it.',
  },
  // — Item 101 : premier écran d’accueil (onboarding) —
  'onboarding.titre': { fr: 'Bienvenue dans Merge avec contexte', en: 'Welcome to Merge with context' },
  'onboarding.intro': {
    fr: 'Aucune évaluation n’a encore eu lieu. Trois étapes pour activer le contrôle :',
    en: 'No evaluation has run yet. Three steps to enable the check:',
  },
  'onboarding.etape1': {
    fr: '1. Jumelez Bitbucket et Jira : générez un code dans les réglages du projet, puis saisissez-le côté Bitbucket.',
    en: '1. Pair Bitbucket with Jira: generate a code in the project settings, then enter it in Bitbucket.',
  },
  'onboarding.etape2': {
    fr: '2. Chargez le jeu de démonstration, ou reliez un dépôt à un service.',
    en: '2. Load the demo dataset, or map a repository to a service.',
  },
  'onboarding.etape3': {
    fr: '3. Réglez les règles (niveau, mode), puis ouvrez une PR : le contrôle s’affiche ici et sur la PR.',
    en: '3. Tune the rules (level, mode), then open a PR: the check appears here and on the PR.',
  },
  // — Item 103 : ce qui bloque le plus —
  'blocages.titre': { fr: 'Ce qui bloque le plus', en: 'What blocks the most' },
  'blocages.fenetre': { fr: 'Sur la fenêtre courante (30 derniers jours).', en: 'Over the current window (last 30 days).' },
  'blocages.vide': { fr: 'Aucun blocage sur la fenêtre courante.', en: 'No block over the current window.' },
  'blocages.ligne': {
    fr: '{code} — {titre} : {blocages} blocage(s), {tauxDerogation} % de dérogations accordées',
    en: '{code} — {title}: {blocks} block(s), {waiverRate} % of waivers granted',
  },
};

/** Langue par défaut quand le resolver n'en renvoie pas. */
export function langueDe(donnees) {
  return donnees && donnees.locale === 'en' ? 'en' : 'fr';
}

/** Rend un libellé du dictionnaire local, avec ses `{param}`. */
export function texte(locale, cle, params = {}) {
  const traduction = TEXTES[cle] || { fr: cle, en: cle };
  return traduction[locale].replace(/\{(\w+)\}/g, (motif, nom) =>
    Object.prototype.hasOwnProperty.call(params, nom) ? String(params[nom]) : motif,
  );
}

/** Détail lisible d'une erreur d'`invoke`. */
function detailErreur(erreur) {
  if (!erreur) return '?';
  return typeof erreur === 'string' ? erreur : erreur.message || String(erreur);
}

/**
 * État d'un écran branché sur un resolver : `{ chargement, erreur, donnees, appeler }`.
 * `appeler(payload)` invoque le resolver et remplace les données ; en cas
 * d'échec, l'erreur est conservée pour l'affichage — jamais d'écran blanc.
 */
export function useResolver(nom) {
  const [etat, setEtat] = useState({ chargement: true, erreur: null, donnees: null });
  const appeler = useCallback(
    async (payload) => {
      setEtat((precedent) => ({ ...precedent, chargement: true, erreur: null }));
      try {
        const reponse = await invoke(nom, payload);
        setEtat({ chargement: false, erreur: null, donnees: reponse });
        return reponse;
      } catch (erreur) {
        setEtat({ chargement: false, erreur: detailErreur(erreur), donnees: null });
        return null;
      }
    },
    [nom],
  );
  return { ...etat, appeler };
}

/**
 * Identité de la personne qui regarde l'écran.
 *
 * Le resolver ne reçoit pas le contexte Forge : c'est l'écran qui lit le compte
 * courant dans le contexte de la vue et le joint à sa charge utile. Lecture en
 * dernier recours — si la plateforme ne répond pas, l'identité reste vide et le
 * resolver applique sa propre convention (l'administrateur de l'installation).
 */
export function useUtilisateur() {
  const [utilisateur, setUtilisateur] = useState('');
  useEffect(() => {
    let actif = true;
    const retenir = (contexte) => {
      if (actif) setUtilisateur((contexte && contexte.accountId) || '');
    };
    try {
      const contexte = view && view.getContext ? view.getContext() : Promise.resolve(null);
      contexte.then(retenir).catch(() => retenir(null));
    } catch {
      retenir(null);
    }
    return () => {
      actif = false;
    };
  }, []);
  return utilisateur;
}

/** Bandeau d'avertissement affiché quand le resolver échoue. */
export function Erreur({ detail, locale }) {
  // Item 100 : `role="alert"` fait annoncer le bandeau par les lecteurs d’écran.
  return (
    <Box role="alert">
      <SectionMessage appearance="warning" title={texte(locale, 'commun.erreur')}>
        <Text>{texte(locale, 'commun.erreurDetail', { detail })}</Text>
      </SectionMessage>
    </Box>
  );
}

/** État transitoire : chargement en cours, ou erreur à signaler. */
export function EtatEcran({ chargement, erreur, locale }) {
  if (erreur) {
    return (
      <Box>
        <Erreur detail={erreur} locale={locale} />
      </Box>
    );
  }
  if (chargement) {
    return (
      <Box role="status">
        <Spinner />
        <Text>{texte(locale, 'commun.chargement')}</Text>
      </Box>
    );
  }
  return null;
}

/**
 * Item 98 — état vide expliqué : au lieu d'une liste vide, un bloc qui dit quoi
 * faire. `actionLabel`/`onAction` sont facultatifs (l'encart n'a pas de
 * navigation ; la consigne reste alors dans le texte).
 */
export function EtatVide({ titre, texte: corps, actionLabel, onAction }) {
  return (
    <Box>
      <Stack>
        <Heading>{titre}</Heading>
        <Text>{corps}</Text>
        {actionLabel && onAction ? (
          <Button appearance="primary" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : null}
      </Stack>
    </Box>
  );
}

/**
 * Item 100 — bandeau d'état accessible : le `SectionMessage` UI Kit 2 n'expose
 * pas de rôle, on l'enveloppe dans un `Box` porteur du rôle ARIA (`status` pour
 * une information, `alert` pour une erreur) et d'un texte d'annonce visible.
 */
export function BandeauStatut({ appearance, titre, role, children }) {
  return (
    <Box role={role ?? 'status'}>
      <SectionMessage appearance={appearance} title={titre}>
        {children}
      </SectionMessage>
    </Box>
  );
}

/**
 * Item 99 — confirmation explicite avant une action qui change l'état, avec le
 * rappel de la conséquence. L'appelant décide d'afficher ce bloc (état local) ;
 * `onConfirmer` exécute l'action, `onAnnuler` revient en arrière.
 */
export function Confirmation({ titre, consequence, confirmerLabel, onConfirmer, onAnnuler, locale }) {
  return (
    <Box role="alert">
      <Stack>
        <Heading>{titre ?? texte(locale, 'confirm.titre')}</Heading>
        <Text>{consequence}</Text>
        <Stack alignInline="start">
          <Button appearance="primary" onClick={onConfirmer}>
            {confirmerLabel ?? texte(locale, 'confirm.confirmer')}
          </Button>
          <Button appearance="subtle" onClick={onAnnuler}>
            {texte(locale, 'commun.annuler')}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

/**
 * Item 101 — premier écran d'accueil : trois étapes pour activer le contrôle.
 * Affiché tant qu'aucune évaluation n'a eu lieu (voir `VueEncart.onboarding`).
 */
export function Onboarding({ locale }) {
  const etapes = ['onboarding.etape1', 'onboarding.etape2', 'onboarding.etape3'];
  return (
    <Box>
      <Stack>
        <Heading>{texte(locale, 'onboarding.titre')}</Heading>
        <Text>{texte(locale, 'onboarding.intro')}</Text>
        <Stack>
          {etapes.map((cle) => (
            <Text key={cle}>{texte(locale, cle)}</Text>
          ))}
        </Stack>
      </Stack>
    </Box>
  );
}

/**
 * Item 103 — « ce qui bloque le plus » : les trois règles qui ont le plus
 * bloqué sur la fenêtre courante, avec leur taux de dérogation. Les données
 * viennent de `VueReglages.blocages` (calcul pur dans `view-model-reglages`).
 */
export function SectionBlocages({ blocages, locale }) {
  return (
    <Box>
      <Stack>
        <Heading>{texte(locale, 'blocages.titre')}</Heading>
        <Text size="small">{texte(locale, 'blocages.fenetre')}</Text>
        {blocages.length === 0 ? (
          <Text>{texte(locale, 'blocages.vide')}</Text>
        ) : (
          <Stack>
            {blocages.map((ligne) => (
              <Text key={ligne.code}>
                {texte(locale, 'blocages.ligne', {
                  code: ligne.code,
                  titre: ligne.titre,
                  blocages: ligne.blocages,
                  tauxDerogation: ligne.tauxDerogation,
                })}
              </Text>
            ))}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
