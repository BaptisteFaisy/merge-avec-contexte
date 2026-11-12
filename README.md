# Merge avec contexte

Merge check Bitbucket qui regarde **le travail** et pas seulement le code : il vérifie le
ticket Jira lié, les critères d'acceptation, le calendrier des gels, l'état des services et
les dépendances, puis **bloque ou avertit en expliquant pourquoi et comment débloquer**.

Projet soumis au hackathon **Codegeist 2026** (catégorie *Apps for Software Teams*).

**Site du projet** : https://baptistefaisy.github.io/merge-avec-contexte/ — publié
depuis `site/` par GitHub Pages à chaque merge sur `main` (bilingue FR/EN).
Cahier des charges : [`docs/CAHIER-DES-CHARGES.md`](docs/CAHIER-DES-CHARGES.md).

## Pourquoi

Les contrôles avant fusion portent sur le code (build vert, approbations). Aucun ne sait dire
qu'il reste deux critères d'acceptation non cochés, qu'un gel commence dans une heure, ou qu'un
incident est ouvert sur le service visé. Ces informations vivent dans Jira et JSM ; celui qui
clique sur « Merge » ne les a pas sous les yeux.

## Deux apps Forge jumelées

Une app Forge ne peut pas appeler à la fois Bitbucket et Jira (familles de scopes séparées).
Le produit est donc coupé en deux, reliées par un **web trigger signé** :

| | Capteur (`capteur/`) | Cerveau (`cerveau/`) |
|---|---|---|
| Produit | Bitbucket | Jira |
| Rôle | recevoir le merge check, lire la PR, afficher le résultat | évaluer les règles, stocker, expliquer, déroger |
| Modules | merge check, carte de PR, réglages de l'espace de travail | web trigger, réglages projet, encart ticket, console de test, journal, agent Rovo, actions/MCP |
| Données durables | aucune | règles, gels, dérogations, journal |

## Disposition du dépôt

```
shared/     contrat unique : types, catalogue de règles, messages, pont signé, gels, dérogations
capteur/    app Forge Bitbucket (le contrat est recopié dans capteur/src/shared/)
cerveau/    app Forge Jira       (le contrat est recopié dans cerveau/src/shared/)
scripts/    outillage (synchronisation du contrat)
tools/      gardes de qualité (taille des fichiers et des fonctions)
docs/       cahier des charges, architecture, juges, vidéo, validations, recette
```

`shared/` est la **seule source de vérité** du contrat : on ne modifie jamais
`capteur/src/shared/` ni `cerveau/src/shared/` à la main, on modifie `shared/` puis on lance
`npm run shared:sync` (la CI vérifie la synchronisation avec `npm run shared:check`).

## Travailler dans le dépôt

```bash
npm install              # une fois, à la racine (outillage + types Forge)
npm test                 # vitest, logique pure (aucun import Forge)
npm run typecheck        # tsc --noEmit sur les trois paquets
npm run limits           # gardes : < 500 lignes par fichier, < 50 lignes par fonction
npm run verify           # les quatre à la suite
```

Déploiement des deux apps (poste de développement, CLI Forge authentifié) :

```bash
cd cerveau && forge register && forge deploy   # app Jira : pont, règles, pages, Rovo, MCP
cd capteur && forge register && forge deploy   # app Bitbucket : merge check, carte, réglages
```

Puis jumeler les deux installations : l'administrateur Jira génère un code à
usage unique (10 min) dans les réglages du projet, l'administrateur Bitbucket le
saisit dans les réglages de l'espace de travail, et l'état de la liaison
s'affiche des deux côtés.

Les conventions de contribution (architecture testable, horloges injectées, messages
bilingues, règles de PR) sont dans [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) ;
le guide pas à pas pour contribuer (installation, tests, flux de PR, déploiement)
dans [`CONTRIBUTING.md`](CONTRIBUTING.md). L'historique des changements est dans
[`CHANGELOG.md`](CHANGELOG.md), la licence dans [`LICENSE`](LICENSE) (Apache-2.0).
L'état d'avancement et ce qu'il reste à faire sur une vraie instance Atlassian sont
dans [`docs/ETAT.md`](docs/ETAT.md) ; le dépannage (pont en 500, jumelage, écrans
vides, réinstallation) dans [`docs/DEPANNAGE.md`](docs/DEPANNAGE.md).

## Limite à connaître : le blocage exige Bitbucket Premium

Un merge check **bloquant** (qui empêche réellement la fusion) exige l'offre
**Premium** de Bitbucket Cloud. Sur une offre gratuite, le contrôle s'exécute,
affiche son verdict et son message au format imposé, mais **informe sans
empêcher** la fusion. Le produit reste pleinement utile en avertissement ;
cette limite de la plateforme doit figurer dans la fiche de soumission
(`docs/ETAT.md`, `docs/DEPANNAGE.md` §7).

## Topics GitHub proposés

Les topics se posent sur la page du dépôt (About → ⚙ → Topics), par le
propriétaire uniquement. Liste proposée :

```
atlassian  atlassian-forge  forge  bitbucket  jira  jira-service-management
merge-check  pull-request  code-review  devops  rovo  mcp
model-context-protocol  typescript  vitest  codegeist  codegeist-2026  hackathon
```

## Pipeline

CI sur runners auto-hébergés, verdict en moins de 5 minutes : `ci` (typecheck + tests +
gardes), `ci-budget` (aucun job déclaré au-delà de 5 min), `couche0` (périmètre déclaré,
motifs interdits). Les PR vertes entrent dans la **file Mergify** et sont mergées seules ;
un conflit de rebase est résolu par l'agent de conflit (`.github/fireworks/`).
