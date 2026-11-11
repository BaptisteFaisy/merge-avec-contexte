/**
 * Formulaire « demander une dérogation » (écrans 5, §12 et §7.4).
 *
 * Rend la liste des règles dérogables du modèle de vue `vmEncart` : règle,
 * motif, durée en heures. L'envoi remonte par `onEnvoyer({ rule, reason, hours })`
 * et correspond à l'action `request-waiver` du manifeste (MC-07).
 */
import React from 'react';
import { useState } from '@forge/react';
import { Box, Button, Select, Text, TextField } from '@forge/react';
import { texte } from './commun';

export default function FormulaireDerogation({ regles, locale, onEnvoyer, onAnnuler }) {
  const options = regles.map((regle) => ({ label: `${regle.code} — ${regle.titre}`, value: regle.code }));
  const [rule, setRegle] = useState(options.length > 0 ? options[0].value : '');
  const [reason, setMotif] = useState('');
  const [hours, setDuree] = useState('2');
  const heures = Number.parseInt(hours, 10);
  const valide = rule !== '' && reason.trim() !== '' && Number.isFinite(heures) && heures > 0;
  return (
    <Box>
      <Text>{texte(locale, 'encart.regle')}</Text>
      <Select options={options} value={options.find((option) => option.value === rule)} onChange={(e) => setRegle(e.target.value)} />
      <Text>{texte(locale, 'encart.motif')}</Text>
      <TextField value={reason} onChange={(e) => setMotif(e.target.value)} />
      <Text>{texte(locale, 'encart.heures')}</Text>
      <TextField value={hours} onChange={(e) => setDuree(e.target.value)} />
      <Button appearance="primary" isDisabled={!valide} onClick={() => onEnvoyer({ rule, reason: reason.trim(), hours: heures })}>
        {texte(locale, 'encart.envoyer')}
      </Button>
      <Button appearance="subtle" onClick={onAnnuler}>
        {texte(locale, 'commun.annuler')}
      </Button>
    </Box>
  );
}
