/**
 * Une ligne du tableau des treize règles (écran 4, §12).
 *
 * Rend une `LigneRegle` du modèle de vue `vmReglages` : titre, niveau
 * (bloquant / avertissement / information), mode (actif / observation),
 * portée (dépôts et branches, motifs glob) et paramètres propres à la règle,
 * déduits du catalogue. Tout est éditable (items 3 et 6) : chaque changement
 * remonte par `onChangement(code, champ, valeur)` ; rien n'est écrit ici.
 */
import React from 'react';
import { Box, Select, Text, TextField, Toggle } from '@forge/react';
import { texte } from './commun';

/** Options d'un `Select` UI Kit 2 à partir des options du modèle de vue. */
function optionsDe(possibles) {
  return possibles.map((option) => ({ label: option.label, value: option.value }));
}

/** Motifs d'une liste : texte séparé par des virgules. */
function listeDe(valeur) {
  return String(valeur)
    .split(',')
    .map((motif) => motif.trim())
    .filter(Boolean);
}

/** Portée courante : celle saisie dans l'écran, sinon celle enregistrée. */
function porteeCourante(ligne, changement) {
  const saisie = changement && changement.portee ? changement.portee : {};
  return {
    repositories: saisie.repositories ?? ligne.portee.depots,
    branches: saisie.branches ?? ligne.portee.branches,
  };
}

/** Paramètres courants : ceux de l'écran, sinon ceux enregistrés. */
function paramsCourants(ligne, changement) {
  const courants = {};
  ligne.params.forEach((param) => {
    courants[param.name] = param.valeurBrute;
  });
  const saisie = changement && changement.params ? changement.params : {};
  Object.keys(saisie).forEach((nom) => {
    courants[nom] = saisie[nom];
  });
  return courants;
}

/** Valeur d'un paramètre, selon le type que le catalogue lui donne. */
function valeurDeParam(type, saisie) {
  if (type === 'string[]') return listeDe(saisie);
  if (type === 'number') {
    const nombre = Number(saisie);
    return Number.isFinite(nombre) ? nombre : null;
  }
  return saisie;
}

/** Champ de portée : dépôts ou branches. */
function ChampPortee({ libelle, aide, valeur, onChange }) {
  return (
    <Box>
      <Text>{libelle}</Text>
      <TextField defaultValue={valeur.join(', ')} onChange={(e) => onChange(listeDe(e.target.value))} />
      <Text>{aide}</Text>
    </Box>
  );
}

/** Champ de paramètre : un booléen en interrupteur, les autres en texte. */
function ChampParam({ param, valeur, onChange }) {
  if (param.type === 'boolean') {
    return (
      <Box>
        <Toggle defaultChecked={valeur === true} onChange={(e) => onChange(e.target.checked)} label={param.libelle} />
        <Text>{param.note}</Text>
      </Box>
    );
  }
  const affiche = Array.isArray(valeur)
    ? valeur.join(', ')
    : valeur === null || valeur === undefined
      ? ''
      : String(valeur);
  return (
    <Box>
      <Text>{param.libelle}</Text>
      <TextField defaultValue={affiche} onChange={(e) => onChange(valeurDeParam(param.type, e.target.value))} />
      <Text>{param.note}</Text>
    </Box>
  );
}

export default function LigneRegle({ ligne, locale, libelles, changement, onChangement }) {
  const portee = porteeCourante(ligne, changement);
  const params = paramsCourants(ligne, changement);
  const changerPortee = (champ) => (valeur) =>
    onChangement(ligne.code, 'portee', { ...portee, [champ]: valeur });
  const changerParam = (nom) => (valeur) =>
    onChangement(ligne.code, 'params', { ...params, [nom]: valeur });
  return (
    <Box>
      <Text weight="bold">
        {ligne.code} — {ligne.titre}
      </Text>
      <Text>{texte(locale, 'reglages.portee', { resume: ligne.portee.resume })}</Text>
      <ChampPortee
        libelle={libelles.depots}
        aide={libelles.aide}
        valeur={portee.repositories}
        onChange={changerPortee('repositories')}
      />
      <ChampPortee
        libelle={libelles.branches}
        aide={libelles.aide}
        valeur={portee.branches}
        onChange={changerPortee('branches')}
      />
      <Text>{libelles.parametres}</Text>
      {ligne.params.map((param) => (
        <ChampParam
          key={param.name}
          param={param}
          valeur={params[param.name]}
          onChange={changerParam(param.name)}
        />
      ))}
      <Text>{texte(locale, 'reglages.niveau')}</Text>
      <Select
        options={optionsDe(ligne.niveauxPossibles)}
        value={optionsDe(ligne.niveauxPossibles).find((option) => option.value === ligne.niveau)}
        onChange={(e) => onChangement(ligne.code, 'niveau', e.target.value)}
      />
      <Text>{texte(locale, 'reglages.mode')}</Text>
      <Select
        options={optionsDe(ligne.modesPossibles)}
        value={optionsDe(ligne.modesPossibles).find((option) => option.value === ligne.mode)}
        onChange={(e) => onChangement(ligne.code, 'mode', e.target.value)}
      />
    </Box>
  );
}
