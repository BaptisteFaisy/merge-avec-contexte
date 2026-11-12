/**
 * Écran 4 — réglages du projet (§12) : treize règles (niveau, mode, portée,
 * paramètres — tout éditable), jumelage Bitbucket (code à usage unique, état,
 * politique de repli), correspondance dépôt → service, approbateurs de
 * dérogations rangés par projet et calendrier des gels (item 10).
 *
 * Toute la logique d'affichage vient du modèle de vue `vmReglages`
 * (`cerveau/src/ui`) : ce composant rend la `VueReglages` renvoyée par
 * `invoke('resolverReglages', …)` et remonte les actions. La langue de
 * l'utilisateur ou du site, lue dans le contexte de la vue Forge (item 97),
 * accompagne chaque appel ; le resolver retombe sur la langue de la
 * configuration. En cas d'échec du resolver, un `SectionMessage` d'avertissement
 * s'affiche — jamais d'écran blanc.
 */
import React from 'react';
import { useEffect, useState } from '@forge/react';
import { Badge, Box, Button, Heading, Stack, Text, TextField } from '@forge/react';
import { view } from '@forge/bridge';
import { EtatEcran, langueDe, texte, useResolver } from './composants/commun';
import LigneRegle from './composants/ligne-regle';
import SectionGels from './composants/section-gels';
import SectionJumelage from './composants/section-jumelage';

/**
 * Langue de l'utilisateur ou du site (item 97, §16).
 *
 * Elle est portée par le contexte de la vue Forge (`view.getContext()`), que
 * la plateforme renseigne avec la langue du poste. Seules les deux langues du
 * produit sont retenues (`fr-FR` → `fr`, `en-GB` → `en`) ; hors plateforme —
 * tests, ou plateforme qui ne répond pas — la langue reste inconnue et le
 * resolver applique celle de la configuration.
 */
function langueNormale(valeur) {
  if (!valeur) return null;
  const basse = String(valeur).toLowerCase();
  if (basse.startsWith('fr')) return 'fr';
  if (basse.startsWith('en')) return 'en';
  return null;
}

function useLangue() {
  const [langue, setLangue] = useState(null);
  useEffect(() => {
    let actif = true;
    const retenir = (contexte) => {
      if (actif) setLangue(langueNormale(contexte && contexte.locale));
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
  return langue;
}

/** Tableau des règles : une ligne par règle du catalogue, plus l'enregistrement. */
function SectionRegles({ vue, locale, modifs, onChangement, onEnregistrer }) {
  return (
    <Box>
      <Heading>{texte(locale, 'reglages.regles')}</Heading>
      <Stack>
        {vue.regles.map((ligne) => (
          <LigneRegle
            key={ligne.code}
            ligne={ligne}
            locale={locale}
            libelles={vue.libelles.regles}
            changement={modifs[ligne.code]}
            onChangement={onChangement}
          />
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

/** Chargement du jeu de démonstration (§20, niveau 1 des juges). */
function SectionDemo({ locale, onCharger }) {
  return (
    <Box>
      <Heading>{texte(locale, 'reglages.demo')}</Heading>
      <Text>{texte(locale, 'reglages.demoAide')}</Text>
      <Button onClick={onCharger}>{texte(locale, 'reglages.demoCharger')}</Button>
    </Box>
  );
}

/** Approbateurs de dérogations : annuaire du projet, badges et ajout. */
function SectionApprobateurs({ vue, locale, valeur, onChamp, onAjouter }) {
  return (
    <Box>
      <Heading>{texte(locale, 'reglages.approbateurs')}</Heading>
      {vue.projetLabel ? <Text>{vue.projetLabel}</Text> : null}
      <Text>{vue.libelles.approbateursAide}</Text>
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
  const langue = useLangue();
  const [modifs, setModifs] = useState({});
  const [ajout, setAjour] = useState(AJOUT_VIDE);
  const [approbateur, setApprobateur] = useState('');

  /** Appel au resolver, avec la langue de l'utilisateur quand elle est connue. */
  const appelerPage = (payload) => appeler(langue ? { ...payload, locale: langue } : payload);

  useEffect(() => {
    appelerPage({ method: 'charger' });
  }, [langue]);

  const locale = langueDe(donnees ?? { locale: langue });
  if (erreur || chargement || !donnees || !donnees.vue) {
    return <EtatEcran chargement={!erreur} erreur={erreur} locale={locale} />;
  }
  const { vue } = donnees;

  const changerRegle = (code, champ, valeur) =>
    setModifs((precedent) => ({ ...precedent, [code]: { ...precedent[code], [champ]: valeur } }));
  const enregistrerRegles = () => {
    const regles = modifs;
    setModifs({});
    appelerPage({ method: 'enregistrerRegles', regles });
  };
  const champAjout = (champ, valeur) => setAjour((precedent) => ({ ...precedent, [champ]: valeur }));
  const ajouterCorrespondance = () => {
    setAjour(AJOUT_VIDE);
    appelerPage({ method: 'ajouterCorrespondance', ...ajout });
  };
  const ajouterApprobateur = () => {
    const nom = approbateur.trim();
    setApprobateur('');
    appelerPage({ method: 'ajouterApprobateur', approbateur: nom });
  };
  const creerGel = (gel) => appelerPage({ method: 'ajouterGel', ...gel });
  const supprimerGel = (id) => appelerPage({ method: 'supprimerGel', id });

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
          onGenererCode={() => appelerPage({ method: 'genererCode' })}
          onRepli={(politique) => appelerPage({ method: 'repli', politique })}
        />
        <SectionCorrespondance
          vue={vue}
          locale={locale}
          ajout={ajout}
          onChamp={champAjout}
          onAjouter={ajouterCorrespondance}
        />
        <SectionGels
          gels={vue.gels}
          libelles={vue.libelles.gels}
          locale={locale}
          onCreer={creerGel}
          onSupprimer={supprimerGel}
        />
        <SectionDemo locale={locale} onCharger={() => appelerPage({ method: 'chargerDemo' })} />
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
