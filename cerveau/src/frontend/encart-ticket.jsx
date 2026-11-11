/**
 * Écran 5 — encart sur le ticket (§12) : PR connues, dernière évaluation avec
 * ses raisons et la marche à suivre, dérogations en cours, demandes à trancher
 * et décisions prises.
 *
 * Une personne de l'annuaire des approbateurs y accorde une dérogation pour une
 * durée bornée (1 à 72 h) ou la refuse (§7.1, étape 6 — MC-07) ; les autres y
 * voient les boutons désactivés et pourquoi.
 *
 * Affiché dans le panneau `jira:issueContext`. Toutes les données viennent du
 * modèle de vue `vmEncart` (`cerveau/src/ui`) via `resolverEncart`.
 */
import React from 'react';
import { useEffect, useState } from '@forge/react';
import { Badge, Box, Button, Heading, SectionMessage, Stack, Text } from '@forge/react';
import { EtatEcran, langueDe, texte, useResolver, useUtilisateur } from './composants/commun';
import FormulaireDerogation, { FormulaireDecision } from './composants/formulaire-derogation';

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

/** PR connues et dérogations en vigueur : qui a décidé, jusqu'à quand, pourquoi. */
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
            {derogation.rule} —{' '}
            {texte(locale, 'encart.derogationAccordee', {
              by: derogation.grantedBy,
              until: derogation.expiresLabel,
              reason: derogation.reason,
            })}
          </Text>
        ))}
      </Stack>
    </Box>
  );
}

/** Demandes en attente : l'approbateur accorde (durée bornée) ou refuse. */
function BlocDemandes({ vue, locale, onDecider }) {
  return (
    <Box>
      <Heading>{texte(locale, 'encart.decider')}</Heading>
      {vue.demandes.length === 0 ? <Text>{texte(locale, 'encart.aucuneDemande')}</Text> : null}
      <Stack>
        {vue.demandes.map((demande) => (
          <Box key={demande.id}>
            <Text weight="bold">
              {demande.rule} — {demande.titre}
            </Text>
            <Text>
              {texte(locale, 'encart.demande', {
                by: demande.requestedBy,
                at: demande.requestedAtLabel,
                reason: demande.reason,
              })}
            </Text>
            <FormulaireDecision
              demande={demande}
              locale={locale}
              peutDecider={vue.peutDecider}
              motif={vue.motif}
              onDecider={onDecider}
            />
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

/** Décisions closes : refus, et accords arrivés à échéance. */
function BlocDecisions({ vue, locale }) {
  if (vue.decisions.length === 0) return null;
  return (
    <Box>
      <Heading>{texte(locale, 'encart.decisions')}</Heading>
      <Stack>
        {vue.decisions.map((decision) => (
          <Text key={decision.id}>
            {decision.rule} —{' '}
            {texte(locale, 'encart.decision', {
              statut: texte(locale, `encart.statut.${decision.statut}`),
              by: decision.decidedBy,
              echeance: decision.expiresLabel
                ? texte(locale, 'encart.jusquAu', { until: decision.expiresLabel })
                : '',
              reason: decision.reason,
            })}
          </Text>
        ))}
      </Stack>
    </Box>
  );
}

/** Annuaire des approbateurs : qui peut décider de ces demandes. */
function BlocDecideurs({ vue, locale }) {
  return (
    <Box>
      <Heading>{texte(locale, 'encart.decideurs')}</Heading>
      {vue.approbateurs.length === 0 ? <Text>{texte(locale, 'encart.aucunDecideur')}</Text> : null}
      <Stack>
        {vue.approbateurs.map((nom) => (
          <Badge key={nom}>{nom}</Badge>
        ))}
      </Stack>
    </Box>
  );
}

/** Issue de la dernière décision : appliquée, ou refusée avec son motif. */
function BlocAvis({ avis, locale }) {
  if (!avis) return null;
  const applique = avis.code === 'accordee' || avis.code === 'refusee';
  return (
    <SectionMessage appearance={applique ? 'success' : 'warning'} title={texte(locale, `encart.avis.${avis.code}`)}>
      <Text>{avis.waiverId}</Text>
    </SectionMessage>
  );
}

export default function EncartTicket() {
  const { chargement, erreur, donnees, appeler } = useResolver('resolverEncart');
  const utilisateur = useUtilisateur();
  const [demande, setDemande] = useState(false);
  useEffect(() => {
    appeler({ method: 'charger', utilisateur });
  }, [utilisateur]);
  const locale = langueDe(donnees);
  if (erreur || chargement || !donnees || !donnees.vue) {
    return <EtatEcran chargement={!erreur} erreur={erreur} locale={locale} />;
  }
  const { vue, avis } = donnees;

  const envoyerDemande = (payload) => {
    setDemande(false);
    appeler({ method: 'demanderDerogation', utilisateur, ...payload });
  };
  const decider = (payload) => appeler({ method: 'deciderDerogation', utilisateur, ...payload });

  return (
    <Box>
      <Stack>
        <BlocAvis avis={avis} locale={locale} />
        <BlocDerniereEvaluation derniere={vue.derniere} locale={locale} />
        <BlocListes vue={vue} locale={locale} />
        <BlocDemandes vue={vue} locale={locale} onDecider={decider} />
        <BlocDecisions vue={vue} locale={locale} />
        <BlocDecideurs vue={vue} locale={locale} />
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
