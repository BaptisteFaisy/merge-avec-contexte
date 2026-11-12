/**
 * Réglages de l'espace de travail du Capteur — UI Kit 2 (§12, écran 3).
 *
 * Code de jumelage, état de la liaison, politique de repli et envoi des
 * chemins de fichiers. Le resolver `resolverWorkspaceSettings` renvoie un
 * `ReglagesVm` déjà calculé et enregistre les changements (`action: 'save'`).
 */
import React from 'react';
import { useEffect, useState } from 'react';
import { invoke } from '@forge/bridge';
import {
  Badge,
  Box,
  Button,
  Form,
  FormFooter,
  FormSection,
  Heading,
  Label,
  SectionMessage,
  Select,
  Spinner,
  Stack,
  Text,
  TextField,
  Toggle,
} from '@forge/react';

function messageDe(erreur) {
  if (erreur && typeof erreur.message === 'string' && erreur.message !== '') return erreur.message;
  return 'Les réglages n’ont pas pu être chargés.';
}

function Chargement() {
  return (
    <Stack space="space.100" alignInline="center">
      <Spinner size="medium" />
      <Text>Chargement des réglages…</Text>
    </Stack>
  );
}

function Erreur({ message, onRelancer }) {
  return (
    <Stack space="space.100">
      <SectionMessage appearance="error" title="Réglages indisponibles">
        <Text>{message}</Text>
      </SectionMessage>
      <Button appearance="default" onClick={onRelancer}>
        Réessayer
      </Button>
    </Stack>
  );
}

function BlocLiaison({ liaison }) {
  return (
    <Stack space="space.050">
      <Stack space="space.050" alignInline="center">
        <Badge appearance={liaison.jumele ? 'success' : 'default'}>
          {liaison.jumele ? 'Jumelé' : 'Non jumelé'}
        </Badge>
        <Text>{liaison.texte}</Text>
      </Stack>
      {liaison.depuis ? <Text size="small">{`Liaison établie le ${liaison.depuis.slice(0, 10)}.`}</Text> : null}
    </Stack>
  );
}

function BlocCode({ vm }) {
  return (
    <Stack space="space.050">
      <Label labelFor="code-jumelage">{vm.codeJumelage.libelle}</Label>
      <TextField
        id="code-jumelage"
        name="code"
        placeholder={vm.codeJumelage.exemple}
        isRequired={vm.codeJumelage.obligatoire}
      />
      <Text size="small">{vm.codeJumelage.aide}</Text>
    </Stack>
  );
}

function BlocPolitique({ vm }) {
  const options = vm.politique.options.map((option) => ({ label: option.label, value: option.value }));
  const choisie = options.find((option) => option.value === vm.politique.valeur);
  return (
    <Stack space="space.050">
      <Label labelFor="politique-repli">{vm.politique.libelle}</Label>
      <Select id="politique-repli" name="politique" options={options} defaultValue={choisie} />
      <Text size="small">{vm.politique.aide}</Text>
    </Stack>
  );
}

function BlocChemins({ vm }) {
  return (
    <Stack space="space.050">
      <Toggle name="chemins" label={vm.envoyerChemins.libelle} defaultChecked={vm.envoyerChemins.actif} />
      <Text size="small">{vm.envoyerChemins.aide}</Text>
    </Stack>
  );
}

function BandeauPont({ bandeau }) {
  return (
    <Box role="alert">
      <SectionMessage appearance="warning" title={bandeau.titre}>
        <Text>{bandeau.texte}</Text>
      </SectionMessage>
    </Box>
  );
}

/** Item 98 : état vide expliqué — quoi faire quand l'espace n'est pas jumelé. */
function EtatVide({ vide }) {
  return (
    <Box role="status">
      <Stack space="space.050">
        <Heading as="h4">{vide.titre}</Heading>
        <Text>{vide.texte}</Text>
      </Stack>
    </Box>
  );
}

function Reglages({ vm, retour, envoi, onEnregistrer }) {
  return (
    <Box padding="space.100">
      <Stack space="space.200">
        <Heading as="h3">Merge avec contexte</Heading>
        {vm.etatVide ? <EtatVide vide={vm.etatVide} /> : null}
        {vm.pontInjoignable && vm.bandeauPont ? <BandeauPont bandeau={vm.bandeauPont} /> : null}
        <BlocLiaison liaison={vm.liaison} />
        <Form onSubmit={onEnregistrer}>
          <FormSection>
            <BlocCode vm={vm} />
            <BlocPolitique vm={vm} />
            <BlocChemins vm={vm} />
          </FormSection>
          <FormFooter>
            <Button appearance="primary" type="submit" isDisabled={envoi}>
              {envoi ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </FormFooter>
        </Form>
        {retour ? (
          <Box role={retour.type === 'ko' ? 'alert' : 'status'}>
            <SectionMessage appearance={retour.type === 'ko' ? 'error' : 'success'}>
              <Text>{retour.texte}</Text>
            </SectionMessage>
          </Box>
        ) : null}
      </Stack>
    </Box>
  );
}

/**
 * Item 99 : confirmation explicite avant l'enregistrement, avec le rappel de la
 * conséquence (la politique de repli choisie et ce qu'elle implique).
 */
function ConfirmationEnregistrement({ vm, donnees, envoi, onConfirmer, onAnnuler }) {
  const valeur = valeurDe(donnees.politique);
  const option = vm.politique.options.find((o) => o.value === valeur) ?? vm.politique.options[0];
  return (
    <Box padding="space.100" role="alert">
      <Stack space="space.200">
        <Heading as="h3">Confirmer l’enregistrement</Heading>
        <Text>{`Vous enregistrez les réglages de l’espace. Politique de repli choisie : ${option.label}.`}</Text>
        <Text size="small">{`Conséquence : ${option.aide}`}</Text>
        <Stack space="space.100" alignInline="start">
          <Button appearance="primary" onClick={onConfirmer} isDisabled={envoi}>
            {envoi ? 'Enregistrement…' : 'Confirmer'}
          </Button>
          <Button appearance="subtle" onClick={onAnnuler}>
            Annuler
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

/** Valeur d'un champ du formulaire, que le Select rende l'option ou sa valeur. */
function valeurDe(valeur) {
  if (valeur && typeof valeur === 'object' && 'value' in valeur) return valeur.value;
  return valeur;
}

export default function ReglagesEspace() {
  const [etat, setEtat] = useState({ statut: 'chargement' });
  const [retour, setRetour] = useState(undefined);
  const [envoi, setEnvoi] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  async function charger() {
    setEtat({ statut: 'chargement' });
    try {
      const vm = await invoke('resolverWorkspaceSettings');
      if (!vm) throw new Error('Le resolver n’a rien renvoyé.');
      setEtat({ statut: 'pret', vm });
    } catch (erreur) {
      setEtat({ statut: 'erreur', message: messageDe(erreur) });
    }
  }

  async function enregistrer(donnees) {
    const champs = donnees ?? {};
    setEnvoi(true);
    setRetour(undefined);
    try {
      const vm = await invoke('resolverWorkspaceSettings', {
        action: 'save',
        codeJumelage: champs.code ?? '',
        politique: valeurDe(champs.politique),
        envoyerChemins: champs.chemins === true,
      });
      if (vm) setEtat({ statut: 'pret', vm });
      setRetour({ type: 'ok', texte: 'Réglages enregistrés.' });
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
  // Item 99 : l'enregistrement passe par une confirmation qui rappelle la conséquence.
  if (confirmation) {
    return (
      <ConfirmationEnregistrement
        vm={etat.vm}
        donnees={confirmation}
        envoi={envoi}
        onConfirmer={() => {
          const donnees = confirmation;
          setConfirmation(null);
          enregistrer(donnees);
        }}
        onAnnuler={() => setConfirmation(null)}
      />
    );
  }
  return (
    <Reglages
      vm={etat.vm}
      retour={retour}
      envoi={envoi}
      onEnregistrer={(donnees) => setConfirmation(donnees ?? {})}
    />
  );
}
