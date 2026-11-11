/**
 * Panneau de l'onglet Overview du Capteur — UI Kit 2 (§12, écran 2 bis).
 *
 * Même contenu que la carte de PR, en plus large : le détail des règles
 * évaluées (niveau, mode, résultat) et l'historique de l'évaluation.
 * Le resolver `resolverPrPanel` renvoie un `PanneauVm` déjà calculé.
 */
import { useEffect, useState } from 'react';
import { invoke } from '@forge/bridge';
import { Badge, Box, Button, Heading, Link, SectionMessage, Spinner, Stack, Text } from '@forge/react';

const APPARENCE_VERDICT = { bloque: 'removed', autorise: 'success', nonConcluant: 'warning' };
const APPARENCE_RESULTAT = { pass: 'success', fail: 'removed', 'not-evaluated': 'default' };
const LIBELLE_RESULTAT = { pass: 'réussie', fail: 'échouée', 'not-evaluated': 'non évaluée' };
const LIBELLE_MODE = { active: 'active', observe: 'observation' };
const LIBELLE_NIVEAU = { blocking: 'bloquant', warning: 'avertissement', information: 'information' };

function messageDe(erreur) {
  if (erreur && typeof erreur.message === 'string' && erreur.message !== '') return erreur.message;
  return 'Le détail du contrôle n’a pas pu être chargé.';
}

function Chargement() {
  return (
    <Stack space="space.100" alignInline="center">
      <Spinner size="medium" />
      <Text>Chargement du détail…</Text>
    </Stack>
  );
}

function Erreur({ message, onRelancer }) {
  return (
    <Stack space="space.100">
      <SectionMessage appearance="error" title="Contexte indisponible">
        <Text>{message}</Text>
      </SectionMessage>
      <Button appearance="default" onClick={onRelancer}>
        Réessayer
      </Button>
    </Stack>
  );
}

function LigneRegle({ regle }) {
  const resume = `${LIBELLE_NIVEAU[regle.niveau] ?? regle.niveau}, mode ${LIBELLE_MODE[regle.mode] ?? regle.mode}, ${LIBELLE_RESULTAT[regle.resultat] ?? regle.resultat}`;
  return (
    <Box padding="space.075">
      <Stack space="space.025">
        <Stack space="space.050" alignInline="center">
          <Badge appearance={APPARENCE_RESULTAT[regle.resultat] ?? 'default'}>{regle.code}</Badge>
          <Text weight="medium">{regle.titre}</Text>
        </Stack>
        <Text size="small">{resume}</Text>
      </Stack>
    </Box>
  );
}

function BlocRegles({ regles }) {
  return (
    <Stack space="space.100">
      <Heading as="h5">Règles évaluées</Heading>
      {regles && regles.length > 0 ? (
        regles.map((regle) => <LigneRegle key={regle.code} regle={regle} />)
      ) : (
        <Text size="small">Aucune règle configurée pour ce dépôt.</Text>
      )}
    </Stack>
  );
}

function BlocHistorique({ vm }) {
  return (
    <Stack space="space.050">
      <Heading as="h5">Historique de l’évaluation</Heading>
      <Text size="small">{`Dernière évaluation : ${vm.evalueLe}, ${vm.dureeMs} ms.`}</Text>
      {vm.historique.map((entree, index) => (
        <Text key={`${entree.evalueLeIso}-${index}`} size="small">
          {`${index + 1}. ${entree.evalueLe} — ${entree.verdictTexte} (${entree.dureeMs} ms)`}
        </Text>
      ))}
    </Stack>
  );
}

function BlocRaisons({ raisons }) {
  if (!raisons || raisons.length === 0) return null;
  return (
    <Stack space="space.075">
      {raisons.map((raison, index) => (
        <Stack key={`${raison.rule}-${index}`} space="space.025">
          <Text>{raison.text}</Text>
          {raison.action ? <Text size="small">{raison.action}</Text> : null}
          {raison.lien ? (
            <Link href={raison.lien.url} openNewTab>
              {raison.lien.label}
            </Link>
          ) : null}
        </Stack>
      ))}
    </Stack>
  );
}

function BlocTicket({ ticket }) {
  if (!ticket || !ticket.reconnu) return <Text size="small">Aucun ticket Jira reconnu dans cette PR.</Text>;
  if (ticket.liens.length === 0) return <Text size="small">{`Ticket : ${ticket.cles.join(', ')}`}</Text>;
  return (
    <Stack space="space.050" alignInline="center">
      <Text weight="medium">Ticket</Text>
      {ticket.liens.map((lien) => (
        <Link key={lien.url} href={lien.url} openNewTab>
          {lien.label}
        </Link>
      ))}
    </Stack>
  );
}

function Panneau({ vm, onRelancer }) {
  return (
    <Box padding="space.100">
      <Stack space="space.200">
        <Stack space="space.050" alignInline="center">
          <Heading as="h4">{vm.verdictTexte}</Heading>
          <Badge appearance={APPARENCE_VERDICT[vm.verdict] ?? 'default'}>{vm.verdictTexte}</Badge>
          <BlocTicket ticket={vm.ticket} />
        </Stack>
        <BlocRaisons raisons={vm.raisons} />
        {vm.marcheASuivre ? (
          <SectionMessage appearance="warning" title={vm.marcheASuivre.titre}>
            <Text>{vm.marcheASuivre.texte}</Text>
          </SectionMessage>
        ) : null}
        <BlocRegles regles={vm.regles} />
        <BlocHistorique vm={vm} />
        <Text size="small">{vm.jumelage.texte}</Text>
        <Button appearance="subtle" onClick={onRelancer}>
          Relancer le contrôle
        </Button>
      </Stack>
    </Box>
  );
}

export default function PanneauDePr() {
  const [etat, setEtat] = useState({ statut: 'chargement' });

  async function charger() {
    setEtat({ statut: 'chargement' });
    try {
      const vm = await invoke('resolverPrPanel');
      if (!vm) throw new Error('Le resolver n’a rien renvoyé.');
      setEtat({ statut: 'pret', vm });
    } catch (erreur) {
      setEtat({ statut: 'erreur', message: messageDe(erreur) });
    }
  }

  useEffect(() => {
    charger();
  }, []);

  if (etat.statut === 'chargement') return <Chargement />;
  if (etat.statut === 'erreur') return <Erreur message={etat.message} onRelancer={charger} />;
  return <Panneau vm={etat.vm} onRelancer={charger} />;
}
