/**
 * Écran 4 — réglages du projet (§12) : treize règles (niveau, mode, portée,
 * paramètres), jumelage Bitbucket (code à usage unique, état, politique de
 * repli), correspondance dépôt → service et approbateurs de dérogations.
 *
 * Toute la logique d'affichage vient du modèle de vue `vmReglages`
 * (`cerveau/src/ui`) : ce composant rend la `VueReglages` renvoyée par
 * `invoke('resolverReglages', …)` et remonte les actions. En cas d'échec du
 * resolver, un `SectionMessage` d'avertissement s'affiche — jamais d'écran blanc.
 */
import React from 'react';
import { useEffect, useState } from '@forge/react';
import { Badge, Box, Button, Heading, Stack, Text, TextField } from '@forge/react';
import { EtatEcran, langueDe, texte, useResolver } from './composants/commun';
import LigneRegle from './composants/ligne-regle';
import SectionJumelage from './composants/section-jumelage';

/** Tableau des règles : une ligne par règle du catalogue, plus l'enregistrement. */
function SectionRegles({ vue, locale, modifs, onChangement, onEnregistrer }) {
  return (
    <Box>
      <Heading>{texte(locale, 'reglages.regles')}</Heading>
      <Stack>
        {vue.regles.map((ligne) => (
          <LigneRegle key={ligne.code} ligne={ligne} locale={locale} onChangement={onChangement} />
        ))}
      </Stack>
      <Button appearance="primary" isDisabled={Object.keys(modifs).length === 0} onClick={onEnregistrer}>
        {texte(locale, 'commun.enregistrer')}
      </Button>
    </Box>
  );
}

/** Correspondance dépôt → service : liste enregistrée et formulaire d'ajout. */
function SectionCorrespondance({ vue, locale, ajout, onChamp, onAjouter }) {
  return (
    <Box>
      <Heading>{texte(locale, 'reglages.correspondance')}</Heading>
      {vue.correspondance.length === 0 ? <Text>{texte(locale, 'reglages.aucun')}</Text> : null}
      <Stack>
        {vue.correspondance.map((ligne) => (
          <Text key={ligne.depot}>
            {ligne.depot} → {ligne.service}
            {ligne.composant ? ` · ${ligne.composant}` : ''}
          </Text>
        ))}
      </Stack>
      <Text>{texte(locale, 'reglages.depot')}</Text>
      <TextField value={ajout.depot} onChange={(e) => onChamp('depot', e.target.value)} />
      <Text>{texte(locale, 'reglages.service')}</Text>
      <TextField value={ajout.service} onChange={(e) => onChamp('service', e.target.value)} />
      <Text>{texte(locale, 'reglages.composant')}</Text>
      <TextField value={ajout.composant} onChange={(e) => onChamp('composant', e.target.value)} />
      <Button isDisabled={!ajout.depot || !ajout.service} onClick={onAjouter}>
        {texte(locale, 'commun.ajouter')}
      </Button>
    </Box>
  );
}

/** Approbateurs de dérogations : badges et ajout. */
function SectionApprobateurs({ vue, locale, valeur, onChamp, onAjouter }) {
  return (
    <Box>
      <Heading>{texte(locale, 'reglages.approbateurs')}</Heading>
      {vue.approbateurs.length === 0 ? <Text>{texte(locale, 'reglages.aucun')}</Text> : null}
      <Stack>
        {vue.approbateurs.map((nom) => (
          <Badge key={nom}>{nom}</Badge>
        ))}
      </Stack>
      <Text>{texte(locale, 'reglages.approbateur')}</Text>
      <TextField value={valeur} onChange={(e) => onChamp(e.target.value)} />
      <Button isDisabled={!valeur.trim()} onClick={onAjouter}>
        {texte(locale, 'commun.ajouter')}
      </Button>
    </Box>
  );
}

const AJOUT_VIDE = { depot: '', service: '', composant: '' };

export default function ReglagesProjet() {
  const { chargement, erreur, donnees, appeler } = useResolver('resolverReglages');
  const [modifs, setModifs] = useState({});
  const [ajout, setAjour] = useState(AJOUT_VIDE);
  const [approbateur, setApprobateur] = useState('');
  useEffect(() => {
    appeler({ method: 'charger' });
  }, []);
  const locale = langueDe(donnees);
  if (erreur || chargement || !donnees || !donnees.vue) {
    return <EtatEcran chargement={!erreur} erreur={erreur} locale={locale} />;
  }
  const { vue } = donnees;

  const changerRegle = (code, champ, valeur) =>
    setModifs((precedent) => ({ ...precedent, [code]: { ...precedent[code], [champ]: valeur } }));
  const enregistrerRegles = () => {
    const regles = Object.entries(modifs).map(([code, changement]) => ({ code, ...changement }));
    setModifs({});
    appeler({ method: 'enregistrerRegles', regles });
  };
  const champAjout = (champ, valeur) => setAjour((precedent) => ({ ...precedent, [champ]: valeur }));
  const ajouterCorrespondance = () => {
    setAjour(AJOUT_VIDE);
    appeler({ method: 'ajouterCorrespondance', ...ajout });
  };
  const ajouterApprobateur = () => {
    const nom = approbateur.trim();
    setApprobateur('');
    appeler({ method: 'ajouterApprobateur', approbateur: nom });
  };

  return (
    <Box>
      <Stack>
        <SectionRegles
          vue={vue}
          locale={locale}
          modifs={modifs}
          onChangement={changerRegle}
          onEnregistrer={enregistrerRegles}
        />
        <SectionJumelage
          jumelage={vue.jumelage}
          locale={locale}
          onGenererCode={() => appeler({ method: 'genererCode' })}
          onRepli={(politique) => appeler({ method: 'repli', politique })}
        />
        <SectionCorrespondance
          vue={vue}
          locale={locale}
          ajout={ajout}
          onChamp={champAjout}
          onAjouter={ajouterCorrespondance}
        />
        <SectionApprobateurs
          vue={vue}
          locale={locale}
          valeur={approbateur}
          onChamp={setApprobateur}
          onAjouter={ajouterApprobateur}
        />
      </Stack>
    </Box>
  );
}
