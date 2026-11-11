# Merge avec contexte

Merge check Bitbucket qui regarde **le travail** et pas seulement le code : il vérifie le
ticket Jira lié, les critères d'acceptation, le calendrier des gels, l'état des services et
les dépendances, puis **bloque ou avertit en expliquant pourquoi et comment débloquer**.

Projet soumis au hackathon **Codegeist 2026** (catégorie *Apps for Software Teams*).
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

Déploiement des apps (poste de développement, CLI Forge authentifié) :

```bash
cd cerveau && forge deploy    # app Jira : pont, règles, pages, agent Rovo, MCP
cd capteur && forge deploy    # app Bitbucket : merge check, carte, réglages
```

Les conventions de contribution (architecture testable, horloges injectées, messages
bilingues, règles de PR) sont dans [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md).

## Pipeline

CI sur runners auto-hébergés, verdict en moins de 5 minutes : `ci` (typecheck + tests +
gardes), `ci-budget` (aucun job déclaré au-delà de 5 min), `couche0` (périmètre déclaré,
motifs interdits). Les PR vertes entrent dans la **file Mergify** et sont mergées seules ;
un conflit de rebase est résolu par l'agent de conflit (`.github/fireworks/`).

## Déploiement

Le déploiement se fait app par app, avec le CLI Forge authentifié sur le site de
démonstration :

```bash
cd cerveau && forge deploy    # app Jira : pont, règles, pages, agent Rovo, MCP
cd capteur && forge deploy    # app Bitbucket : merge check, carte, réglages
```

Le jumelage se fait ensuite en trois étapes : générer un code côté Jira, le
saisir côté Bitbucket, vérifier l'état de la liaison.
