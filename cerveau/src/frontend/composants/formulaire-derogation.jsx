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
 *
 * Accessibilité (item 100) : chaque champ porte un `id` et un `<Label labelFor>`
 * associé — le libellé visible est relié au contrôle. Confirmation (item 99) :
 * l'envoi d'une demande et chaque décision passent par un rappel de la
 * conséquence avant d'être appliqués.
 */
import React from 'react';
import { useState } from '@forge/react';
import { Box, Button, Label, Select, Stack, Text, TextField } from '@forge/react';
import { Confirmation, texte } from './commun';

export default function FormulaireDerogation({ regles, locale, onEnvoyer, onAnnuler }) {
  const options = regles.map((regle) => ({ label: `${regle.code} — ${regle.titre}`, value: regle.code }));
  const [rule, setRegle] = useState(options.length > 0 ? options[0].value : '');
  const [reason, setMotif] = useState('');
  const [hours, setDuree] = useState('2');
  const [confirmer, setConfirmer] = useState(false);
  const heures = Number.parseInt(hours, 10);
  const valide = rule !== '' && reason.trim() !== '' && Number.isFinite(heures) && heures > 0;
  if (confirmer) {
    return (
      <Confirmation
        locale={locale}
        consequence={texte(locale, 'confirm.demander.consequence')}
        confirmerLabel={texte(locale, 'encart.envoyer')}
        onConfirmer={() => onEnvoyer({ rule, reason: reason.trim(), hours: heures })}
        onAnnuler={() => setConfirmer(false)}
      />
    );
  }
  return (
    <Box>
      <Stack>
        <Label labelFor="derogation-regle">{texte(locale, 'encart.regle')}</Label>
        <Select
          id="derogation-regle"
          name="rule"
          options={options}
          value={options.find((option) => option.value === rule)}
          onChange={(e) => setRegle(e.target.value)}
        />
        <Label labelFor="derogation-motif">{texte(locale, 'encart.motif')}</Label>
        <TextField id="derogation-motif" name="reason" value={reason} onChange={(e) => setMotif(e.target.value)} />
        <Label labelFor="derogation-heures">{texte(locale, 'encart.heures')}</Label>
        <TextField id="derogation-heures" name="hours" value={hours} onChange={(e) => setDuree(e.target.value)} />
        <Button appearance="primary" isDisabled={!valide} onClick={() => setConfirmer(true)}>
          {texte(locale, 'encart.envoyer')}
        </Button>
        <Button appearance="subtle" onClick={onAnnuler}>
          {texte(locale, 'commun.annuler')}
        </Button>
      </Stack>
    </Box>
  );
}

/**
 * Décision d'une demande en attente : accord borné de 1 à 72 h, ou refus.
 *
 * Hors de l'annuaire des approbateurs, les deux boutons restent désactivés et
 * le motif s'affiche (§12, écran 5) — l'écran dit pourquoi il ne laisse pas agir.
 * Chaque décision demande une confirmation qui rappelle sa conséquence (item 99).
 */
export function FormulaireDecision({ demande, locale, peutDecider, motif, onDecider }) {
  const [hours, setHeures] = useState(String(demande.heuresDemandees));
  const [attente, setAttente] = useState(null);
  const heures = Number.parseInt(hours, 10);
  const dureeValide = Number.isFinite(heures) && heures >= 1 && heures <= 72;
  const champId = `decision-duree-${demande.id}`;
  if (attente) {
    return (
      <Confirmation
        locale={locale}
        consequence={texte(locale, attente === 'granted' ? 'confirm.accorder.consequence' : 'confirm.refuser.consequence')}
        confirmerLabel={texte(locale, attente === 'granted' ? 'encart.accorder' : 'encart.refuser')}
        onConfirmer={() =>
          onDecider(
            attente === 'granted'
              ? { waiverId: demande.id, decision: 'granted', hours: heures }
              : { waiverId: demande.id, decision: 'refused' },
          )
        }
        onAnnuler={() => setAttente(null)}
      />
    );
  }
  return (
    <Box>
      <Stack>
        <Label labelFor={champId}>{texte(locale, 'encart.dureeAccord')}</Label>
        <TextField id={champId} name="hours" value={hours} isDisabled={!peutDecider} onChange={(e) => setHeures(e.target.value)} />
        <Button
          appearance="primary"
          isDisabled={!peutDecider || !dureeValide}
          onClick={() => setAttente('granted')}
        >
          {texte(locale, 'encart.accorder')}
        </Button>
        <Button appearance="subtle" isDisabled={!peutDecider} onClick={() => setAttente('refused')}>
          {texte(locale, 'encart.refuser')}
        </Button>
        {peutDecider || !motif ? null : <Text>{texte(locale, `encart.motif.${motif}`)}</Text>}
      </Stack>
    </Box>
  );
}
