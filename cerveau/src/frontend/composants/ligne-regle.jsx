/**
 * Une ligne du tableau des treize règles (écran 4, §12).
 *
 * Rend une `LigneRegle` du modèle de vue `vmReglages` : titre, niveau
 * (bloquant / avertissement / information), mode (actif / observation),
 * portée et paramètres. Composant d'affichage : chaque changement remonte
 * par `onChangement(code, champ, valeur)` ; rien n'est écrit ici.
 */
import { Box, Select, Text } from '@forge/react';
import { texte } from './commun';

/** Options d'un `Select` UI Kit 2 à partir des options du modèle de vue. */
function optionsDe(possibles) {
  return possibles.map((option) => ({ label: option.label, value: option.value }));
}

export default function LigneRegle({ ligne, locale, onChangement }) {
  const parametres = ligne.params
    .filter((param) => param.value !== '')
    .map((param) => `${param.name} = ${param.value}`)
    .join(' · ');
  return (
    <Box>
      <Text weight="bold">
        {ligne.code} — {ligne.titre}
      </Text>
      <Text>{texte(locale, 'reglages.portee', { resume: ligne.portee.resume })}</Text>
      {parametres ? <Text>{parametres}</Text> : null}
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
