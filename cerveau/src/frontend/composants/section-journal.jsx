/**
 * Section « journal » de la page console et journal (écran 7, §12).
 *
 * Rend la `VueJournal` du modèle de vue `vmJournal` : statistiques par
 * verdict, durée moyenne, évaluations horodatées et rapport d'observation
 * « ce qui aurait été bloqué » (MC-13).
 */
import { Box, Heading, Stack, Text } from '@forge/react';
import { texte } from './commun';

/** Statistiques : une ligne par compteur. */
function BlocStatistiques({ statistiques, locale }) {
  const lignes = [
    ['journal.total', statistiques.total],
    ['journal.allowed', statistiques.allowed],
    ['journal.blocked', statistiques.blocked],
    ['journal.inconclusive', statistiques.inconclusive],
    ['journal.duree', statistiques.averageDurationMs],
  ];
  return (
    <Box>
      <Heading>{texte(locale, 'journal.statistiques')}</Heading>
      <Stack>
        {lignes.map(([cle, valeur]) => (
          <Text key={cle}>
            {texte(locale, cle)} : {valeur}
          </Text>
        ))}
      </Stack>
    </Box>
  );
}

/** Évaluations journalisées, la plus récente en tête. */
function BlocEvaluations({ evaluations, locale }) {
  if (evaluations.length === 0) return <Text>{texte(locale, 'journal.aucune')}</Text>;
  return (
    <Stack>
      {evaluations.map((ligne) => (
        <Box key={`${ligne.depot}-${ligne.prId}-${ligne.evaluatedAt}`}>
          <Text weight="bold">
            {ligne.evaluatedAt} — {ligne.depot} #{ligne.prId} : {ligne.verdictLabel} ({ligne.durationMs} ms)
          </Text>
          <Stack>
            {ligne.reasons.map((raison, index) => (
              <Text key={index}>
                [{raison.level}] {raison.text}
                {raison.action ? ` — ${raison.action}` : ''}
              </Text>
            ))}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

/** Rapport d'observation : ce qui aurait été bloqué, par dépôt. */
function BlocObservation({ rapport, locale }) {
  return (
    <Box>
      <Heading>{texte(locale, 'journal.observation')}</Heading>
      <Text>
        {texte(locale, 'journal.observed')} : {rapport.observed}
      </Text>
      <Text>
        {texte(locale, 'journal.wouldHaveBlocked')} : {rapport.wouldHaveBlocked}
      </Text>
      <Stack>
        {rapport.byRepository.map((depot) => (
          <Text key={depot.depot}>
            {depot.depot} : {depot.bloquees}
          </Text>
        ))}
      </Stack>
    </Box>
  );
}

export default function SectionJournal({ vue, locale }) {
  return (
    <Box>
      <Heading>{texte(locale, 'journal.titre')}</Heading>
      <Stack>
        <BlocStatistiques statistiques={vue.statistiques} locale={locale} />
        <BlocEvaluations evaluations={vue.evaluations} locale={locale} />
        <BlocObservation rapport={vue.rapport} locale={locale} />
      </Stack>
    </Box>
  );
}
