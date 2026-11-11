/**
 * Écran 5 — encart sur le ticket (§12) : PR connues, dernière évaluation
 * avec ses raisons et la marche à suivre, dérogations en cours et bouton
 * « Demander une dérogation ».
 *
 * Affiché dans le panneau `jira:issueContext`. Toutes les données viennent du
 * modèle de vue `vmEncart` (`cerveau/src/ui`) via `resolverEncart`.
 */
import React from 'react';
import { useEffect, useState } from '@forge/react';
import { Badge, Box, Button, Heading, Stack, Text } from '@forge/react';
import { EtatEcran, langueDe, texte, useResolver } from './composants/commun';
import FormulaireDerogation from './composants/formulaire-derogation';

/** Dernière évaluation mise en avant : verdict, message exact et raisons. */
function BlocDerniereEvaluation({ derniere, locale }) {
  if (!derniere) return null;
  return (
    <Box>
      <Heading>{texte(locale, 'encart.derniere')}</Heading>
      <Text weight="bold">
        {derniere.depot} #{derniere.prId} — {derniere.verdictLabel}
      </Text>
      <Text>{texte(locale, 'encart.message')}</Text>
      <Text>{derniere.message}</Text>
      {derniere.reasons.length > 0 ? (
        <Box>
          <Text weight="bold">{texte(locale, 'encart.raisons')}</Text>
          <Stack>
            {derniere.reasons.map((raison, index) => (
              <Box key={index}>
                <Text>
                  [{raison.level}] {raison.text}
                </Text>
                {raison.action ? <Text>{raison.action}</Text> : null}
              </Box>
            ))}
          </Stack>
        </Box>
      ) : null}
    </Box>
  );
}

/** PR connues et dérogations en vigueur. */
function BlocListes({ vue, locale }) {
  return (
    <Box>
      <Heading>{texte(locale, 'encart.prs')}</Heading>
      {vue.prs.length === 0 ? <Text>{texte(locale, 'encart.aucunePr')}</Text> : null}
      <Stack>
        {vue.prs.map((pr) => (
          <Text key={`${pr.depot}-${pr.prId}`}>
            {pr.depot} #{pr.prId} : <Badge>{pr.verdictLabel}</Badge>
          </Text>
        ))}
      </Stack>
      <Heading>{texte(locale, 'encart.derogations')}</Heading>
      {vue.derogations.length === 0 ? <Text>{texte(locale, 'encart.aucuneDerogation')}</Text> : null}
      <Stack>
        {vue.derogations.map((derogation, index) => (
          <Text key={index}>
            {derogation.rule} — {derogation.reason} ({derogation.grantedBy}, {derogation.expiresLabel})
          </Text>
        ))}
      </Stack>
    </Box>
  );
}

export default function EncartTicket() {
  const { chargement, erreur, donnees, appeler } = useResolver('resolverEncart');
  const [demande, setDemande] = useState(false);
  useEffect(() => {
    appeler({ method: 'charger' });
  }, []);
  const locale = langueDe(donnees);
  if (erreur || chargement || !donnees || !donnees.vue) {
    return <EtatEcran chargement={!erreur} erreur={erreur} locale={locale} />;
  }
  const { vue } = donnees;

  const envoyerDemande = (payload) => {
    setDemande(false);
    appeler({ method: 'demanderDerogation', ...payload });
  };

  return (
    <Box>
      <Stack>
        <BlocDerniereEvaluation derniere={vue.derniere} locale={locale} />
        <BlocListes vue={vue} locale={locale} />
        {demande ? (
          <FormulaireDerogation
            regles={vue.reglesDerogables}
            locale={locale}
            onEnvoyer={envoyerDemande}
            onAnnuler={() => setDemande(false)}
          />
        ) : (
          <Button onClick={() => setDemande(true)}>{texte(locale, 'encart.demander')}</Button>
        )}
      </Stack>
    </Box>
  );
}
