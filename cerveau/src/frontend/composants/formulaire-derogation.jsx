/**
 * Formulaires des dérogations de l'encart (écran 5, §12, §7.1 et §7.4).
 *
 * - `FormulaireDerogation` (export par défaut) : **demander** une dérogation —
 *   règle, motif, durée en heures. L'envoi remonte par
 *   `onEnvoyer({ rule, reason, hours })` et correspond à l'action
 *   `request-waiver` du manifeste (MC-07).
 * - `FormulaireDecision` : **trancher** une demande — durée de l'accord, puis
 *   « Accorder » ou « Refuser ». L'envoi remonte par
 *   `onDecider({ waiverId, decision, hours })`, soit la méthode
 *   `deciderDerogation` du resolver de l'encart.
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

/**
 * Décision d'une demande en attente : accord borné de 1 à 72 h, ou refus.
 *
 * Hors de l'annuaire des approbateurs, les deux boutons restent désactivés et
 * le motif s'affiche (§12, écran 5) — l'écran dit pourquoi il ne laisse pas agir.
 */
export function FormulaireDecision({ demande, locale, peutDecider, motif, onDecider }) {
  const [hours, setHeures] = useState(String(demande.heuresDemandees));
  const heures = Number.parseInt(hours, 10);
  const dureeValide = Number.isFinite(heures) && heures >= 1 && heures <= 72;
  return (
    <Box>
      <Text>{texte(locale, 'encart.dureeAccord')}</Text>
      <TextField value={hours} isDisabled={!peutDecider} onChange={(e) => setHeures(e.target.value)} />
      <Button appearance="primary" isDisabled={!peutDecider || !dureeValide} onClick={() => onDecider({ waiverId: demande.id, decision: 'granted', hours: heures })}>
        {texte(locale, 'encart.accorder')}
      </Button>
      <Button appearance="subtle" isDisabled={!peutDecider} onClick={() => onDecider({ waiverId: demande.id, decision: 'refused' })}>
        {texte(locale, 'encart.refuser')}
      </Button>
      {peutDecider || !motif ? null : <Text>{texte(locale, `encart.motif.${motif}`)}</Text>}
    </Box>
  );
}
