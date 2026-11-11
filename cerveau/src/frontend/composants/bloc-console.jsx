/**
 * Console de test (écran 6, §12) : formulaire ticket / branche / dépôt et
 * aperçu immédiat du message exact affiché par Bitbucket (§9, recette §18-7).
 */
import { Box, Button, Heading, Select, Text, TextField } from '@forge/react';
import { texte } from './commun';

export default function BlocConsole({ vue, locale, saisie, onChamp, onSimuler }) {
  const { formulaire, apercu } = vue;
  return (
    <Box>
      <Heading>{texte(locale, 'console.titre')}</Heading>
      <Text>{texte(locale, 'console.ticket')}</Text>
      <TextField value={saisie.ticket} onChange={(e) => onChamp('ticket', e.target.value)} />
      <Text>{texte(locale, 'console.branche')}</Text>
      {formulaire.brancheOptions.length > 0 ? (
        <Select
          options={formulaire.brancheOptions}
          value={formulaire.brancheOptions.find((o) => o.value === saisie.brancheCible)}
          onChange={(e) => onChamp('brancheCible', e.target.value)}
        />
      ) : (
        <TextField value={saisie.brancheCible} onChange={(e) => onChamp('brancheCible', e.target.value)} />
      )}
      <Text>{texte(locale, 'console.depot')}</Text>
      {formulaire.depotOptions.length > 0 ? (
        <Select
          options={formulaire.depotOptions}
          value={formulaire.depotOptions.find((o) => o.value === saisie.depot)}
          onChange={(e) => onChamp('depot', e.target.value)}
        />
      ) : (
        <TextField value={saisie.depot} onChange={(e) => onChamp('depot', e.target.value)} />
      )}
      <Button appearance="primary" isDisabled={!saisie.ticket.trim() || !saisie.depot.trim()} onClick={onSimuler}>
        {texte(locale, 'console.simuler')}
      </Button>
      <Heading>{texte(locale, 'console.apercu')}</Heading>
      {apercu ? (
        <Box>
          <Text weight="bold">
            {apercu.verdictLabel} — {texte(locale, apercu.success ? 'console.succes' : 'console.echec')}
          </Text>
          <Text>{apercu.message}</Text>
        </Box>
      ) : (
        <Text>{texte(locale, 'console.pasApercu')}</Text>
      )}
    </Box>
  );
}
