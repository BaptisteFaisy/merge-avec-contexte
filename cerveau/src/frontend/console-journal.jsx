/**
 * Écrans 6 et 7 — console de test puis journal (§12), page `jira:projectPage`.
 *
 * La console simule une PR sur un ticket et affiche l'aperçu `{ message, success, verdict }`
 * calculé par `vmConsole` avec `formatEvaluation` : exactement le texte du
 * contrôle réel (recette §18-7). Le journal rend la `VueJournal` de `vmJournal`
 * (évaluations, statistiques, rapport d'observation). Erreur → `SectionMessage`
 * d'avertissement, jamais d'écran blanc.
 */
import { useEffect, useState } from '@forge/react';
import { Box, Stack } from '@forge/react';
import { EtatEcran, langueDe, useResolver } from './composants/commun';
import BlocConsole from './composants/bloc-console';
import SectionJournal from './composants/section-journal';

const SAISIE_VIDE = { ticket: '', brancheCible: '', depot: '' };

/** Saisie du formulaire, initialisée depuis le modèle de vue une fois chargé. */
function useSaisie(formulaire) {
  const [saisie, setSaisie] = useState(null);
  useEffect(() => {
    if (formulaire && !saisie) {
      setSaisie({
        ticket: formulaire.ticket,
        brancheCible: formulaire.brancheCible,
        depot: formulaire.depot,
      });
    }
  }, [formulaire, saisie]);
  const changer = (champ, valeur) => setSaisie((precedent) => ({ ...precedent, [champ]: valeur }));
  return [saisie ?? SAISIE_VIDE, changer, setSaisie];
}

export default function ConsoleJournal() {
  const { chargement, erreur, donnees, appeler } = useResolver('resolverConsole');
  useEffect(() => {
    appeler({ method: 'charger' });
  }, []);
  const locale = langueDe(donnees);
  const pret = !erreur && !chargement && donnees && donnees.console && donnees.journal;
  const [saisie, changer] = useSaisie(pret ? donnees.console.formulaire : null);
  if (!pret) {
    return <EtatEcran chargement={!erreur} erreur={erreur} locale={locale} />;
  }
  const simuler = () =>
    appeler({
      method: 'simuler',
      ticket: saisie.ticket.trim(),
      brancheCible: saisie.brancheCible.trim(),
      depot: saisie.depot.trim(),
    });
  return (
    <Box>
      <Stack>
        <BlocConsole vue={donnees.console} locale={locale} saisie={saisie} onChamp={changer} onSimuler={simuler} />
        <SectionJournal vue={donnees.journal} locale={locale} />
      </Stack>
    </Box>
  );
}
