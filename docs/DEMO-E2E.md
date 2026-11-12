# Démonstration de bout en bout

> **`npm run demo` joue désormais la démonstration réelle** (vrais tickets du
> projet `MAC`, vrai espace Bitbucket) — voir `docs/PREUVE-REELLE.md`. Ce qui est
> décrit ci-dessous est le scénario **fictif** de la démonstration gratuite,
> toujours jouable via `npm run demo:fictif`.


Objectif : montrer le produit en fonctionnement réel — règles évaluées, message
imposé, dérogation, parcours de l'astreinte pendant un incident, les trois
déclencheurs du contrôle avec rattrapage d'un contexte changé à la fusion, gel
de branche actif, mode observation, lien bloquant et dépendance amont —
**sans navigateur, sans espace de travail Bitbucket et sans rien payer**.
Une commande, vingt vérifications.

## Ce qu'il faut (et ce qu'il ne faut pas)

| Élément | Coût | État |
|---|---|---|
| Site de démonstration Atlassian (`forge site provision`) | gratuit, actif jusqu'au 2027-02-09 | `one-atlas-cndz.atlassian.net` |
| App Jira « Merge avec contexte Cerveau » | gratuit (Forge) | déployée en `development` et `production`, installée |
| App Bitbucket « Capteur » | gratuit (Forge) | déployée ; installation impossible sans espace de travail Bitbucket |
| Base Forge SQL | gratuite dans les quotas | dix tables créées automatiquement (les huit du §14, plus `bridge_nonce` et `waiver_audit`) |
| Navigateur, compte Premium, runner | — | **inutiles** |

## Mise en route (une fois)

```bash
# Adresse du pont et secret partagé, posés au déploiement
forge webtrigger create -f pont-bitbucket -e production -s <site> -p jira
forge variables set MAC_PAIRED_WORKSPACE ws-demo   -e production
forge variables set MAC_SHARED_SECRET <secret>     -e production --encrypt
forge variables set MAC_DEMO_DATA 1                -e production
forge deploy -e production
```

Au premier appel, le Cerveau applique son schéma, enregistre le jumelage (le
secret va dans le coffre Forge, la base ne garde qu'une référence) et charge le
jeu de démonstration : huit tickets `PAY-*`, trois gels (dont un **gel court
réellement actif**, borné aux branches `release/*`), l'incident `INC-52`, la
correspondance dépôt → service et les réglages des règles (dont R-09 en
observation et R-13 bloquante). Rien de tout cela ne dépend du contenu du site.

> Si le site a déjà été amorcé avant cette version, rechargez le jeu depuis
> l'écran de réglages (« Charger le jeu de démonstration ») : le chargement est
> idempotent et installe les nouvelles entrées (gel actif, R-09, R-13, tickets
> PAY-132 et PAY-133).

## La démonstration

```bash
npm install                                   # une fois
MAC_BRIDGE_URL=<adresse du pont> \
MAC_SHARED_SECRET=<secret> npm run demo
```

**Sortie attendue**. Les dix-sept vérifications d'origine ont été réellement
obtenues le 2026-11-12 à 00:18 UTC (latences de 0,2 à 2,9 s, la première inclut
le démarrage à froid). Les trois vérifications des déclencheurs (MC-02) et le
cadrage du parcours de l'astreinte n'ont **pas été rejoués contre le pont
déployé** (pas d'accès au site depuis l'environnement de travail) : les lignes
correspondantes sont la sortie attendue, produite par les mêmes chemins de code
— le script reste rejouable à l'identique et sort `0` si conforme, `1` sinon,
`2` si la configuration manque.

```
Démonstration « Merge avec contexte » — <horodatage>

OK   Le pont répond (<durée>) — stockage ok
OK   PR #42 bloquée — verdict blocked
        │ Bloqué, 2 raisons.
        │ 1) PAY-123 : 2 critère(s) d’acceptation non coché(s).
        │ 2) Incident INC-52 ouvert sur checkout-api.
        │ Détail et dérogation : carte « Merge avec contexte » à droite.
OK   Carte de PR détaillée — 13 règle(s) exposée(s)
OK   Dérogation demandée — dérogation w-42-R-03-…
OK   Dérogation accordée — par tech-lead, 2 h
OK   La dérogation lève la règle visée — 1 blocage(s) restant(s)
OK   Dérogation retirée, la règle rebloque — verdict blocked

— Parcours de l’astreinte (§3, §7.2) : incident INC-52 ouvert sur checkout-api, deux PR visent le service —
OK   Astreinte : la PR sans lien avec l’incident ne part pas (#43, PAY-124) — 1) Incident INC-52 ouvert sur checkout-api.
OK   Astreinte : seul le correctif lié à l’incident passe (#44, PAY-140) — Autorisé, 1 avertissement : Correctif d’incident INC-52 : la fusion reste autorisée.
OK   PR #45 sur release/1.4 bloquée par le gel actif — 1) Gel « Fenêtre release » sur release/1.4 jusqu’au <fin>.
OK   Règle bloquante en observation ne bloque plus (PAY-131) — verdict allowed
OK   L’observation est journalisée, pas affichée — R-09 observée, 2 raison(s) exposée(s)
OK   R-06 bloque PAY-125 (PAY-126 non livré) — 1) PAY-125 est bloqué par PAY-126 (En cours).
OK   R-07 avertit PAY-130 (version 2.3.0 déjà publiée) — Autorisé, 2 avertissements.
OK   R-02 bloque PAY-132 (statut interdit) — 1) PAY-132 est au statut « Suspendu », attendu : …
OK   R-13 bloque PAY-133 (dépendance PAY-134 non livrée) — Dépendance amont non livrée : PAY-134 (En cours).

— Les trois déclencheurs du contrôle (MC-02, §13.2) — PR #47 bloquée par R-06 (PAY-126 non livré) —
OK   Déclencheur push : PR #47 contrôlée et bloquée — verdict blocked
OK   Déclencheur changement d’avis d’un relecteur : contrôle rejoué — verdict blocked
OK   Déclencheur fusion : le contexte changé entre le push et la fusion est rattrapé (§17 cas 4) — push blocked → fusion allowed
OK   Requête non signée refusée — HTTP 401
Démonstration réussie
```

## Remise à zéro

La démo laisse de l'état accumulé (dérogations demandées ou accordées au fil
des passages). Pour repartir d'un jeu propre :

```bash
npm run demo -- --reset
```

Cette option neutralise (statut `refused`) toutes les dérogations encore en
vigueur sur les neuf PR du jeu, en passant **exclusivement par le pont signé**
(`card` puis `waiver.decide`) : aucune route réservée n'est ajoutée, aucun
affaiblissement de la sécurité. Le *journal* des évaluations, lui, est un
registre d'audit annexe (§14, §10) volontairement non effacé : le « ce qui
aurait été bloqué » de l'observation ne prend son sens que sur l'historique.

## Ce que chaque étape prouve

| Étape | Exigence |
|---|---|
| Le pont répond | §13.3 : web trigger joignable, base accessible, migrations appliquées |
| PR #42 bloquée, deux raisons | §9 (format imposé, la plus grave d'abord) et MC-03 (R-03 + R-05) |
| Carte de PR détaillée | §12 écran 2, MC-05 (13 règles avec leur niveau et leur mode) |
| Dérogation demandée puis accordée | MC-07 : motif, demandeur, approbateur, échéance |
| La dérogation lève la règle visée | §7.1 : la dérogation couvre une règle, pas la PR entière |
| Dérogation retirée, la règle rebloque | §17 : une dérogation expirée ou retirée ne protège plus |
| Astreinte : la PR sans lien avec l'incident ne part pas | §3, §7.2 : pendant un incident, rien ne part sur le service en panne |
| Astreinte : seul le correctif lié à l'incident passe | §7.2, MC-12 : voie rapide du correctif, avec la mention « correctif d'incident » |
| PR #45 bloquée par le gel actif | §18 sc. 2 : gel réellement actif, nom et fin affichés |
| Règle en observation ne bloque plus | §7.3 : une règle bloquante en observation n'arrête rien |
| L'observation est journalisée, pas affichée | §7.3 : la raison reste visible sur la carte, absente du message |
| R-06 (PAY-125 bloqué par PAY-126) | §8 : un ticket non livré bloque la fusion |
| R-07 (version 2.3.0 de PAY-130 publiée) | §8 : une fusion sans effet est signalée |
| R-02 (PAY-132 au statut interdit) | §8 : un statut hors liste bloque la fusion |
| R-13 (PAY-133 dépend de PAY-134) | §8 : une dépendance amont non livrée bloque la fusion |
| Déclencheur push | MC-02 : le contrôle s'exécute au push de code |
| Déclencheur changement d'avis d'un relecteur | MC-02 : le contrôle est rejoué quand un relecteur change d'avis |
| Déclencheur fusion : contexte changé rattrapé | §13.2, §17 cas 4 : la tentative de fusion réévalue à frais — une dérogation accordée après le push (ici) est vue ; un gel qui commence ou un incident qui s'ouvre entre-temps le serait de même |
| Requête non signée refusée | §13.3 : un web trigger n'a aucune authentification par défaut |

## Honnêteté sur les limites

- **Le merge check dans une vraie PR Bitbucket n'est pas joué.** Il faut pour
  cela un espace de travail Bitbucket Cloud (gratuit pour une équipe de cinq),
  puis `forge install -p bitbucket -s bitbucket.org/<espace>`. Cette
  démonstration prouve le moteur, le pont et les écrans côté données ; elle ne
  prouve pas le rendu du contrôle dans l'interface Bitbucket.
- **Un contrôle *bloquant* exige l'offre Premium.** Sur une offre gratuite, le
  contrôle s'exécute et **informe** sans empêcher la fusion (confirmé par la
  documentation Atlassian : l'application du caractère obligatoire, au niveau
  espace de travail, projet ou dépôt, est réservée aux offres payantes). Le
  message et le verdict sont identiques ; seule la contrainte de fusion change.
- **Le « ce qui aurait été bloqué » agrégé** (rapport d'observation) est exposé
  par la console de test (écran 7, §10), pas par une route du pont ; la démo le
  montre autrement, via la carte (raison journalisée en observation) et
  l'absence de blocage.
- **La notification de blocage (commentaire Jira, audit item 18) n'est pas
  prouvée en direct par la démo.** Les tickets du jeu d'exemple n'existent pas
  sur le site de démonstration : le Cerveau tente le commentaire, échoue et le
  journalise, sans aucun effet sur le verdict ni sur la latence (l'envoi ne
  bloque pas la réponse du pont). Les garde-fous — au plus un commentaire par
  ticket et par ensemble de raisons, jamais de commentaire en mode observation
  ni sur un repli, aucune duplication aux relances — sont testés dans
  `cerveau/test/notify.test.ts`.
- **Le jeu de démonstration est daté relativement à l'instant du chargement** :
  le gel long est dans trois jours, le **gel court est centré sur l'instant**,
  l'incident ouvert depuis huit heures, la dérogation valable
  quatre-vingt-dix minutes. La démonstration reste donc vraie en décembre,
  quand les juges l'essaieront.
- Ces points sont écrits tels quels dans `docs/ETAT.md` (section « Ce qui
  bloque encore ») : rien n'est masqué.