/**
 * Section « journal » de la page console et journal (écran 7, §12).
 *
 * Rend la `VueJournal` du modèle de vue `vmJournal` :
 * - statistiques par verdict et durées — moyenne, **P95** et maximum, ce que le
 *   §16 exige d'afficher (item 8) ;
 * - blocages par règle, par service, et délai de déblocage (§10 MC-16, item 13) ;
 * - dérogations de la fenêtre : qui, quoi, quand, pourquoi, échéance, statut
 *   (§12 écran 7, item 12) ;
 * - évaluations horodatées, avec l'identifiant de corrélation qui les relie aux
 *   lignes de `forge logs` (item 60) ;
 * - rapport d'observation « ce qui aurait été bloqué » (MC-13).
 *
 * La fenêtre se choisit ici (item 21) et le rapport se produit à la demande
 * (item 22) : les deux rappellent `resolverConsole` — ni module de manifeste
 * supplémentaire, ni déclencheur horaire.
 */
import React from 'react';
import { useState } from '@forge/react';
import { Box, Button, Heading, SectionMessage, Select, Stack, Text } from '@forge/react';
import { texte, useResolver } from './commun';

/** Libellés propres à cette section : le dictionnaire des écrans n'a pas ces clés. */
const TEXTES = {
  'journal.p95': { fr: 'P95 des durées (ms)', en: 'P95 duration (ms)' },
  'journal.max': { fr: 'Durée maximale (ms)', en: 'Maximum duration (ms)' },
  'journal.fenetre': { fr: 'Fenêtre du rapport', en: 'Report window' },
  'journal.jours': { fr: 'derniers jours', en: 'last days' },
  'journal.appliquer': { fr: 'Appliquer', en: 'Apply' },
  'journal.blocages': { fr: 'Blocages', en: 'Blocks' },
  'journal.parRegle': { fr: 'Par règle', en: 'By rule' },
  'journal.parService': { fr: 'Par service', en: 'By service' },
  'journal.delai': { fr: 'Délai de déblocage', en: 'Unlock delay' },
  'journal.delaiMediane': { fr: 'Médiane (ms)', en: 'Median (ms)' },
  'journal.delaiMax': { fr: 'Maximum (ms)', en: 'Maximum (ms)' },
  'journal.delaiAttente': { fr: 'PR encore bloquées', en: 'PRs still blocked' },
  'journal.delaiAucun': { fr: 'Aucun déblocage mesuré sur la fenêtre.', en: 'No unlock measured in the window.' },
  'journal.derogations': { fr: 'Dérogations', en: 'Waivers' },
  'journal.demandees': { fr: 'Demandées', en: 'Requested' },
  'journal.accordees': { fr: 'Accordées', en: 'Granted' },
  'journal.refusees': { fr: 'Refusées', en: 'Refused' },
  'journal.enAttente': { fr: 'En attente', en: 'Pending' },
  'journal.expirees': { fr: 'Expirées', en: 'Expired' },
  'journal.echeance': { fr: 'Échéance', en: 'Expires' },
  'journal.derogationAucune': { fr: 'Aucune dérogation sur la fenêtre.', en: 'No waiver in the window.' },
  'journal.correlation': { fr: 'Corrélation', en: 'Correlation' },
  'journal.rapport': { fr: 'Rapport à la demande', en: 'On-demand report' },
  'journal.rapportGenerer': { fr: 'Produire le rapport', en: 'Generate the report' },
  'journal.rapportGenere': { fr: 'Généré le', en: 'Generated on' },
};

/** Rend un libellé de la section, ou celui du dictionnaire commun des écrans. */
function libelle(locale, cle) {
  return TEXTES[cle] ? TEXTES[cle][locale] : texte(locale, cle);
}

/** Statistiques : une ligne par compteur, durées du §16 comprises (item 8). */
function BlocStatistiques({ statistiques, durees, locale }) {
  const lignes = [
    ['journal.total', statistiques.total],
    ['journal.allowed', statistiques.allowed],
    ['journal.blocked', statistiques.blocked],
    ['journal.inconclusive', statistiques.inconclusive],
    ['journal.duree', statistiques.averageDurationMs],
    ['journal.p95', durees.p95Ms],
    ['journal.max', durees.maxMs],
  ];
  return (
    <Box>
      <Heading>{texte(locale, 'journal.statistiques')}</Heading>
      <Stack>
        {lignes.map(([cle, valeur]) => (
          <Text key={cle}>
            {libelle(locale, cle)} : {valeur}
          </Text>
        ))}
      </Stack>
    </Box>
  );
}

/** Fenêtre du rapport : choix en jours, appliqué au journal (item 21). */
function BlocFenetre({ fenetre, jours, options, locale, onChange, onAppliquer }) {
  return (
    <Box>
      <Text>{libelle(locale, 'journal.fenetre')}</Text>
      <Select
        options={options}
        value={options.find((option) => option.value === jours) ?? { value: jours, label: `${jours} ${libelle(locale, 'journal.jours')}` }}
        onChange={(e) => onChange(e.target.value)}
      />
      <Button onClick={onAppliquer}>{libelle(locale, 'journal.appliquer')}</Button>
      <Text>
        {fenetre.depuis} → {fenetre.jusquA}
      </Text>
    </Box>
  );
}

/** Blocages : par règle, par service, et délai de déblocage (item 13). */
function BlocBlocages({ blocages, locale }) {
  const delai = blocages.deblocage;
  return (
    <Box>
      <Heading>{libelle(locale, 'journal.blocages')}</Heading>
      <Stack>
        <Text weight="bold">{libelle(locale, 'journal.parRegle')}</Text>
        {blocages.parRegle.map((ligne) => (
          <Text key={ligne.regle}>
            {ligne.regle} — {ligne.titre} : {ligne.bloquees}
          </Text>
        ))}
        <Text weight="bold">{libelle(locale, 'journal.parService')}</Text>
        {blocages.parService.map((ligne) => (
          <Text key={ligne.service}>
            {ligne.service} : {ligne.bloquees} · {libelle(locale, 'journal.derogations')} {ligne.derogations} ·{' '}
            {libelle(locale, 'journal.delaiMediane')} {ligne.delaiMedianMs}
          </Text>
        ))}
        <Text weight="bold">{libelle(locale, 'journal.delai')}</Text>
        {delai.prs.length === 0 ? (
          <Text>{libelle(locale, 'journal.delaiAucun')}</Text>
        ) : (
          <Stack>
            <Text>
              {libelle(locale, 'journal.delaiMediane')} : {delai.medianMs} · {libelle(locale, 'journal.delaiMax')} : {delai.maxMs} ·{' '}
              {libelle(locale, 'journal.delaiAttente')} : {delai.enAttente}
            </Text>
            {delai.prs.map((pr) => (
              <Text key={`${pr.depot}-${pr.prId}`}>
                {pr.depot} #{pr.prId} : {pr.delaiMs} ms ({pr.bloqueeLe} → {pr.autoriseeLe})
              </Text>
            ))}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}

/** Dérogations de la fenêtre : comptages puis une ligne par demande (item 12). */
function BlocDerogations({ derogations, locale }) {
  return (
    <Box>
      <Heading>{libelle(locale, 'journal.derogations')}</Heading>
      <Stack>
        <Text>
          {libelle(locale, 'journal.demandees')} : {derogations.demandees} · {libelle(locale, 'journal.accordees')} : {derogations.accordees} ·{' '}
          {libelle(locale, 'journal.refusees')} : {derogations.refusees} · {libelle(locale, 'journal.enAttente')} : {derogations.enAttente} ·{' '}
          {libelle(locale, 'journal.expirees')} : {derogations.expirees}
        </Text>
        {derogations.entrees.length === 0 ? (
          <Text>{libelle(locale, 'journal.derogationAucune')}</Text>
        ) : (
          derogations.entrees.map((entree) => (
            <Box key={entree.id}>
              <Text weight="bold">
                {entree.statutLabel} — {entree.regle} {entree.regleTitre}
              </Text>
              <Text>
                {entree.qui} · {entree.quand} · {entree.pourquoi}
              </Text>
              <Text>
                {libelle(locale, 'journal.echeance')} : {entree.echeance}
                {entree.decideur ? ` · ${entree.decideur}` : ''}
                {entree.service ? ` · ${entree.service}` : ''} · {entree.depot} #{entree.prId}
              </Text>
            </Box>
          ))
        )}
      </Stack>
    </Box>
  );
}

/** Évaluations journalisées, la plus récente en tête, avec leur corrélation (item 60). */
function BlocEvaluations({ evaluations, locale }) {
  if (evaluations.length === 0) return <Text>{texte(locale, 'journal.aucune')}</Text>;
  return (
    <Stack>
      {evaluations.map((ligne) => (
        <Box key={`${ligne.depot}-${ligne.prId}-${ligne.evaluatedAt}`}>
          <Text weight="bold">
            {ligne.evaluatedAt} — {ligne.depot} #{ligne.prId} : {ligne.verdictLabel} ({ligne.durationMs} ms)
          </Text>
          {ligne.correlationId ? (
            <Text>
              {libelle(locale, 'journal.correlation')} : {ligne.correlationId}
            </Text>
          ) : null}
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

/** Rapport produit à la demande (item 22) : son texte, ligne à ligne. */
function BlocRapport({ rapport, locale, onGenerer }) {
  return (
    <Box>
      <Heading>{libelle(locale, 'journal.rapport')}</Heading>
      <Button onClick={onGenerer}>{libelle(locale, 'journal.rapportGenerer')}</Button>
      {rapport ? (
        <Stack>
          <Text>
            {libelle(locale, 'journal.rapportGenere')} {rapport.genereLe} · {rapport.fenetreJours} {libelle(locale, 'journal.jours')}
          </Text>
          {rapport.texte.split('\n').map((ligne) => (
            <Text key={ligne}>{ligne}</Text>
          ))}
        </Stack>
      ) : null}
    </Box>
  );
}

export default function SectionJournal({ vue, locale }) {
  const { appeler, erreur } = useResolver('resolverConsole');
  const [rafraichi, setRafraichi] = useState(null);
  const [rapport, setRapport] = useState(null);
  const courante = rafraichi ?? vue;
  const [jours, setJours] = useState(String(courante.fenetre.jours));
  const options = courante.fenetre.joursDisponibles.map((nombre) => ({
    value: String(nombre),
    label: `${nombre} ${libelle(locale, 'journal.jours')}`,
  }));
  const rafraichir = async (method) => {
    const reponse = await appeler({ method, fenetre: jours });
    if (!reponse) return;
    if (reponse.journal) setRafraichi(reponse.journal);
    setRapport(reponse.rapport ?? null);
  };
  return (
    <Box>
      <Heading>{texte(locale, 'journal.titre')}</Heading>
      <Stack>
        <BlocFenetre
          fenetre={courante.fenetre}
          jours={jours}
          options={options}
          locale={locale}
          onChange={setJours}
          onAppliquer={() => rafraichir('journal')}
        />
        {erreur ? <SectionMessage appearance="warning" title={texte(locale, 'commun.erreur')}>{erreur}</SectionMessage> : null}
        <BlocStatistiques statistiques={courante.statistiques} durees={courante.durees} locale={locale} />
        <BlocBlocages blocages={courante.blocages} locale={locale} />
        <BlocDerogations derogations={courante.derogations} locale={locale} />
        <BlocEvaluations evaluations={courante.evaluations} locale={locale} />
        <BlocObservation rapport={courante.rapport} locale={locale} />
        <BlocRapport rapport={rapport} locale={locale} onGenerer={() => rafraichir('rapport')} />
      </Stack>
    </Box>
  );
}
