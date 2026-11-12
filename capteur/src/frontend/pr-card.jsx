/**
 * Carte de PR du Capteur — UI Kit 2 (§12, écran 2).
 *
 * Le resolver `resolverPrCard` renvoie un modèle de vue déjà calculé
 * (`capteur/src/ui/view-models.ts`) ; cet écran ne décide de rien, il affiche.
 * Trois états, jamais d'écran blanc : chargement, erreur, contenu.
 */
import React from 'react';
import { useEffect, useState } from 'react';
import { invoke } from '@forge/bridge';
import { Badge, Box, Button, Heading, Link, SectionMessage, Spinner, Stack, Text } from '@forge/react';

const APPARENCE_VERDICT = { bloque: 'removed', autorise: 'success', nonConcluant: 'warning' };
const APPARENCE_NIVEAU = { blocking: 'removed', warning: 'warning', information: 'information' };

/** Message lisible d'une erreur d'invocation, sans jargon Forge. */
function messageDe(erreur) {
  if (erreur && typeof erreur.message === 'string' && erreur.message !== '') return erreur.message;
  return 'Le contexte de la PR n’a pas pu être chargé.';
}

function Chargement() {
  return (
    <Stack space="space.100" alignInline="center">
      <Spinner size="medium" />
      <Text>Chargement du contexte de la PR…</Text>
    </Stack>
  );
}

function Erreur({ message, onRelancer }) {
  return (
    <Stack space="space.100">
      <Box role="alert">
        <SectionMessage appearance="error" title="Contexte indisponible">
          <Text>{message}</Text>
        </SectionMessage>
      </Box>
      <Button appearance="default" onClick={onRelancer}>
        Réessayer
      </Button>
    </Stack>
  );
}

function LigneRaison({ raison }) {
  return (
    <Stack space="space.050">
      <Badge appearance={APPARENCE_NIVEAU[raison.level] ?? 'default'}>{raison.rule}</Badge>
      <Text>{raison.text}</Text>
      {raison.action ? <Text size="small">{raison.action}</Text> : null}
      {raison.lien ? (
        <Link href={raison.lien.url} openNewTab>
          {raison.lien.label}
        </Link>
      ) : null}
    </Stack>
  );
}

function BlocRaisons({ raisons }) {
  if (!raisons || raisons.length === 0) return null;
  return (
    <Stack space="space.100">
      {raisons.map((raison, index) => (
        <LigneRaison key={`${raison.rule}-${index}`} raison={raison} />
      ))}
    </Stack>
  );
}

function BlocTicket({ ticket }) {
  if (!ticket || !ticket.reconnu) {
    return <Text size="small">Aucun ticket Jira reconnu dans cette PR.</Text>;
  }
  return (
    <Stack space="space.050">
      <Text weight="medium">Ticket reconnu</Text>
      {ticket.liens.map((lien) => (
        <Link key={lien.url} href={lien.url} openNewTab>
          {lien.label}
        </Link>
      ))}
      {ticket.liens.length === 0 ? <Text size="small">{ticket.cles.join(', ')}</Text> : null}
    </Stack>
  );
}

function BlocDerogation({ derogation, onDerogation, envoi, retour }) {
  return (
    <Stack space="space.100">
      {derogation.disponible ? (
        <Button appearance="primary" onClick={onDerogation} isDisabled={envoi}>
          {derogation.libelle}
        </Button>
      ) : (
        <Text size="small">{derogation.motif}</Text>
      )}
      {retour ? (
        <Box role={retour.type === 'ko' ? 'alert' : 'status'}>
          <SectionMessage appearance={retour.type === 'ko' ? 'error' : 'success'}>
            <Text>{retour.texte}</Text>
          </SectionMessage>
        </Box>
      ) : null}
    </Stack>
  );
}

function Carte({ vm, retour, envoi, onDerogation, onRelancer }) {
  return (
    <Box padding="space.100">
      <Stack space="space.200">
        <Stack space="space.050">
          <Heading as="h4">{vm.verdictTexte}</Heading>
          <Badge appearance={APPARENCE_VERDICT[vm.verdict] ?? 'default'}>{vm.verdictTexte}</Badge>
        </Stack>
        <BlocTicket ticket={vm.ticket} />
        <BlocRaisons raisons={vm.raisons} />
        {vm.marcheASuivre ? (
          <Box role="status">
            <SectionMessage appearance="warning" title={vm.marcheASuivre.titre}>
              <Text>{vm.marcheASuivre.texte}</Text>
            </SectionMessage>
          </Box>
        ) : null}
        <BlocDerogation
          derogation={vm.derogation}
          envoi={envoi}
          retour={retour}
          onDerogation={onDerogation}
        />
        <Text size="small">{vm.jumelage.texte}</Text>
        <Button appearance="subtle" onClick={onRelancer}>
          Relancer le contrôle
        </Button>
      </Stack>
    </Box>
  );
}

export default function CarteDePr() {
  const [etat, setEtat] = useState({ statut: 'chargement' });
  const [retour, setRetour] = useState(undefined);
  const [envoi, setEnvoi] = useState(false);

  async function charger() {
    setEtat({ statut: 'chargement' });
    try {
      const vm = await invoke('resolverPrCard');
      if (!vm) throw new Error('Le resolver n’a rien renvoyé.');
      setEtat({ statut: 'pret', vm });
    } catch (erreur) {
      setEtat({ statut: 'erreur', message: messageDe(erreur) });
    }
  }

  async function demanderDerogation() {
    setEnvoi(true);
    setRetour(undefined);
    try {
      await invoke('resolverPrCard', { action: 'request-waiver' });
      setRetour({ type: 'ok', texte: 'Demande envoyée : les approbateurs sont notifiés.' });
    } catch (erreur) {
      setRetour({ type: 'ko', texte: messageDe(erreur) });
    } finally {
      setEnvoi(false);
    }
  }

  useEffect(() => {
    charger();
  }, []);

  if (etat.statut === 'chargement') return <Chargement />;
  if (etat.statut === 'erreur') return <Erreur message={etat.message} onRelancer={charger} />;
  return (
    <Carte
      vm={etat.vm}
      envoi={envoi}
      retour={retour}
      onDerogation={demanderDerogation}
      onRelancer={charger}
    />
  );
}
