/**
 * Modèles de vue des écrans Jira du Cerveau (§12, écrans 4 à 7).
 *
 * Ce module est **pur** : aucun import Forge, aucune lecture d'heure, aucune
 * requête. Il transforme des données déjà chargées en « ce que l'écran
 * affiche ». Les resolvers (`resolverReglages`, `resolverEncart`,
 * `resolverConsole`) l'appellent ; les composants UI Kit se contentent de
 * rendre le résultat. C'est ce qui rend les quatre écrans testables sans
 * plateforme, conformément à `docs/CONVENTIONS.md` §1.
 *
 * Découpage (règle « moins de 500 lignes par fichier ») : un module par écran,
 * celui-ci ne fait qu'exposer la surface publique.
 *   - `view-model-commun`   libellés bilingues, options de niveau et de mode
 *   - `view-model-reglages` écran 4, réglages du projet
 *   - `view-model-encart`   écran 5, encart sur le ticket
 *   - `view-model-console`  écran 6, console de test
 *   - `view-model-journal`  écran 7, journal et rapport d'observation
 */
export { libelleVerdict, optionsMode, optionsNiveau, raisonsSimples, texte } from './view-model-commun';
export type { CleTexte, Option, VueRaison } from './view-model-commun';

export { vmReglages } from './view-model-reglages';
export type {
  EntreeJumelage,
  EntreeReglages,
  EtatJumelage,
  LigneCorrespondance,
  LigneParam,
  LigneRegle,
  VueJumelage,
  VuePortee,
  VueReglages,
} from './view-model-reglages';

export { vmEncart } from './view-model-encart';
export type { EntreeEncart, PrEvaluee, RegleDerogable, VueDerogation, VueEncart, VuePr } from './view-model-encart';

export { vmConsole } from './view-model-console';
export type { EntreeConsole, VueApercu, VueConsole, VueFormulaire } from './view-model-console';

export { vmJournal } from './view-model-journal';
export type {
  EntreeJournal,
  EvaluationJournalisee,
  Observation,
  VueJournal,
  VueLigneJournal,
  VueRapportObservation,
  VueStatistiques,
} from './view-model-journal';
