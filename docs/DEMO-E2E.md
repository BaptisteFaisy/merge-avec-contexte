# Démonstration de bout en bout, gratuite

Objectif : montrer le produit en fonctionnement réel — règles évaluées, message
imposé, dérogation, incident — **sans navigateur, sans espace de travail
Bitbucket et sans rien payer**. Une commande, dix vérifications.

## Ce qu'il faut (et ce qu'il ne faut pas)

| Élément | Coût | État |
|---|---|---|
| Site de démonstration Atlassian (`forge site provision`) | gratuit, actif jusqu'au 2027-02-09 | `one-atlas-cndz.atlassian.net` |
| App Jira « Merge avec contexte Cerveau » | gratuit (Forge) | déployée en `development` et `production`, installée |
| App Bitbucket « Capteur » | gratuit (Forge) | déployée ; installation impossible sans espace de travail Bitbucket |
| Base Forge SQL | gratuite dans les quotas | huit tables créées automatiquement |
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
jeu de démonstration : six tickets `PAY-*`, deux gels, l'incident `INC-52`,
la correspondance dépôt → service et les réglages des règles. Rien de tout cela
ne dépend du contenu du site.

## La démonstration

```bash
npm install                                   # une fois
MAC_BRIDGE_URL=<adresse du pont> \
MAC_SHARED_SECRET=<secret> npm run demo
```

Sortie réelle du 2026-11-11 (app déployée en production) :

```
OK   Dérogations précédentes neutralisées — 6 dérogation(s)
OK   Le pont répond (474 ms) — stockage ok
OK   PR #42 bloquée (666 ms) — verdict blocked
        │ Bloqué, 2 raisons.
        │ 1) PAY-123 : 2 critère(s) d’acceptation non coché(s).
        │ 2) Incident INC-52 ouvert sur checkout-api.
        │ Détail et dérogation : carte « Merge avec contexte » à droite.
OK   Carte de PR détaillée (496 ms) — 13 règle(s) exposée(s)
OK   Dérogation demandée (278 ms) — dérogation w-42-R-03-…
OK   Dérogation accordée (372 ms) — par tech-lead, 2 h
OK   La dérogation lève la règle visée (478 ms) — 1 blocage(s) restant(s)
OK   Dérogation retirée, la règle rebloque (440 ms) — verdict blocked
OK   PR #43 bloquée par l’incident (618 ms) — 1) Incident INC-52 ouvert sur checkout-api.
OK   Correctif lié à l’incident autorisé (516 ms) — Autorisé, 1 avertissement :
     Correctif d’incident INC-52 : la fusion reste autorisée.
OK   Requête non signée refusée (484 ms) — HTTP 401
Démonstration réussie
```

## Ce que chaque étape prouve

| Étape | Exigence |
|---|---|
| Le pont répond | §13.3 : web trigger joignable, base accessible, migrations appliquées |
| PR #42 bloquée, deux raisons | §9 (format imposé, la plus grave d'abord) et MC-03 (R-03 + R-05) |
| Carte de PR détaillée | §12 écran 2, MC-05 (13 règles avec leur niveau et leur mode) |
| Dérogation demandée puis accordée | MC-07 : motif, demandeur, approbateur, échéance |
| La dérogation lève la règle visée | §7.1 : la dérogation couvre une règle, pas la PR entière |
| Dérogation retirée, la règle rebloque | §17 : une dérogation expirée ou retirée ne protège plus |
| PR #43 bloquée par l'incident | §7.2 : rien ne part sur un service en incident |
| Correctif lié à l'incident autorisé | MC-12 : voie rapide des correctifs, avec trace |
| Requête non signée refusée | §13.3 : un web trigger n'a aucune authentification par défaut |

Latence mesurée sur l'app déployée, sur trente appels : médiane **0,5 s**,
P95 **0,8 s**, et un maximum de 2,6 s (appel à froid, juste après un
déploiement). L'objectif MC-11 de 5 s est tenu avec de la marge.

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
- **Le jeu de démonstration est daté relativement à l'instant du chargement** :
  le gel est dans trois jours, l'incident ouvert depuis huit heures, la
  dérogation valable quatre-vingt-dix minutes. La démonstration reste donc
  vraie en décembre, quand les juges l'essaieront.
- Ces trois points sont écrits tels quels dans `docs/ETAT.md` (section « Ce qui
  bloque encore ») : rien n'est masqué.
