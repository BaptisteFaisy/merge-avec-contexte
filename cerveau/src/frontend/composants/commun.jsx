/**
 * Socle commun des écrans Jira du Cerveau (§12).
 *
 * - Dictionnaire bilingue des libellés de chrome : les textes métier viennent
 *   des modèles de vue (`cerveau/src/ui`) ou de `shared/message/strings.ts` ;
 *   ceux qui suivent n'ont de clé nulle part, ils restent ici.
 * - `useResolver` : chargement et appels du resolver Forge, avec état
 *   chargement / erreur / données — un écran n'est jamais blanc.
 *
 * Contrat des resolvers (voir `cerveau/src/index.ts`) : chaque `invoke` renvoie
 * `{ locale, ... }` où les vues sont celles produites par `vmReglages`,
 * `vmEncart`, `vmConsole` et `vmJournal`.
 */
import React from 'react';
import { useCallback, useState } from '@forge/react';
import { Box, SectionMessage, Spinner, Text } from '@forge/react';
import { invoke } from '@forge/bridge';

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
  'encart.aucuneDerogation': { fr: 'Aucune dérogation en cours.', en: 'No active waiver.' },
  'encart.demander': { fr: 'Demander une dérogation', en: 'Request a waiver' },
  'encart.regle': { fr: 'Règle', en: 'Rule' },
  'encart.motif': { fr: 'Motif', en: 'Reason' },
  'encart.heures': { fr: 'Durée (heures)', en: 'Duration (hours)' },
  'encart.envoyer': { fr: 'Envoyer la demande', en: 'Send the request' },
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

/** Bandeau d'avertissement affiché quand le resolver échoue. */
export function Erreur({ detail, locale }) {
  return (
    <SectionMessage appearance="warning" title={texte(locale, 'commun.erreur')}>
      <Text>{texte(locale, 'commun.erreurDetail', { detail })}</Text>
    </SectionMessage>
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
      <Box>
        <Spinner />
        <Text>{texte(locale, 'commun.chargement')}</Text>
      </Box>
    );
  }
  return null;
}
