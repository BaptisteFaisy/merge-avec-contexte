# Contribuer à « Merge avec contexte »

Merci de votre intérêt ! Ce dépôt contient deux apps Forge jumelées — le
**Capteur** (Bitbucket) et le **Cerveau** (Jira) — plus un contrat partagé et
une démonstration de bout en bout. Ce guide couvre l'installation, les tests,
le flux de pull request et le déploiement. Les règles de code détaillées
(logique pure contre adaptateurs fins, horloges injectées, messages bilingues,
nommage) sont dans [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) — lisez-le
avant d'écrire votre première ligne.

## Prérequis

- **Node ≥ 22** et npm (le CLI Forge exige Node ^22.23.4).
- Pour déployer : le [CLI Forge](https://developer.atlassian.com/platform/forge/install-and-upgrade-forge-cli/)
  authentifié (`forge login`), un site Jira et/ou un espace de travail
  Bitbucket où installer les apps.
- Pour contribuer au code : rien d'autre. Les tests tournent entièrement en
  local, sans réseau ni compte Atlassian.

## Installation et tests

```bash
git clone https://github.com/BaptisteFaisy/merge-avec-contexte.git
cd merge-avec-contexte
npm install              # une fois, à la racine (outillage + types Forge)
```

| Commande | Effet |
|---|---|
| `npm test` | vitest : 382 tests de logique pure, aucun import Forge, aucun réseau |
| `npm run typecheck` | `tsc --noEmit` sur les trois paquets (strict) |
| `npm run limits` | gardes de taille : < 500 lignes par fichier, < 50 par fonction |
| `npm run shared:check` | vérifie que les copies `*/src/shared/` n'ont pas dérivé |
| `npm run verify` | les quatre à la suite — **à lancer avant chaque PR** |
| `npm run demo` | démonstration de bout en bout contre une app déployée (voir `docs/DEMO-E2E.md`) |

Le contrat vit dans `shared/src/` : on n'édite **jamais** `capteur/src/shared/`
ni `cerveau/src/shared/` à la main. On modifie `shared/src/`, puis
`npm run shared:sync`, et on déclare les deux copies régénérées dans le
périmètre de la PR.

## Où toucher

```
shared/     contrat unique : types, catalogue des 13 règles, messages, pont signé
capteur/    app Forge Bitbucket (merge check, carte de PR, réglages)
cerveau/    app Forge Jira (pont, moteur, stockage, écrans, Rovo/MCP)
scripts/    outillage (synchronisation du contrat, démonstration de bout en bout)
tools/      gardes de qualité (taille des fichiers et des fonctions, manifestes)
docs/       documentation (cahier des charges, architecture, recette, dépannage…)
```

Une règle = un fichier `cerveau/src/rules/r<nn>-<sujet>.ts` ; son test =
`cerveau/test/<sujet>.test.ts`. Les messages visibles par l'utilisateur
passent par `shared/src/message/strings.ts`, en français **et** en anglais.

## Flux de pull request

1. Branchez-vous sur `main` : une branche `<domaine>/<sujet>`
   (ex. `cerveau/regle-r14`, `docs/recette`).
2. Travaillez petit, tests d'abord ; `npm run verify` doit rester vert.
3. Ouvrez la PR avec un bloc `## Scope` **exact** dans le corps : une puce par
   fichier ou dossier modifié, aucune puce inutile (le garde `couche0` refuse
   un périmètre surdimensionné comme un périmètre incomplet) :

   ```markdown
   ## Scope
   - `cerveau/src/rules/r04-gel.ts` — règle R-04 (gel sur la branche cible)
   - `cerveau/test/engine.test.ts` — tests du moteur
   ```

4. Trois checks requis doivent passer : `ci` (typecheck, tests, gardes,
   sanity docs), `ci-budget` (aucun job au-delà de 5 minutes) et `couche0`
   (périmètre déclaré, motifs interdits).
5. Une PR verte entre dans la **file Mergify** et est mergée sans intervention
   humaine (rebase). Ne mergez jamais à la main, ne poussez jamais
   directement sur `main`.
6. Si la PR passe en conflit après le merge d'une autre, l'**agent de
   conflit** (`.github/fireworks/`) rebase et réconcilie automatiquement, puis
   la file reprend ; un `CHANGELOG.md` en conflit est fusionné sans perte par
   union des entrées.

Le garde `couche0` refuse aussi, dans les lignes ajoutées : les pushes forcés
(sans lease), le déclencheur de PR à privilèges (celui qui expose les secrets
aux forks), toute clé d'API en clair et les dates antérieures au 26 octobre
2026. Certains fichiers sont gelés : `.github/ci-budget/`, `.github/couche0/`,
`.github/workflows/ci.yml`, `ci-native.yml`, `couche0.yml`,
`pr-auto-merge.yml` — les modifier exige la mention libre
`SAMVISION_ALLOW_GUARD_BUMP` dans le corps de la PR. `.mergify.yml` est
interdit de modification sans décision explicite du propriétaire.

## Déployer les deux apps

Les apps se déploient depuis leurs dossiers respectifs, avec le CLI Forge
authentifié. L'ordre compte : le Cerveau d'abord (c'est lui qui porte le pont
et les données), le Capteur ensuite.

```bash
cd cerveau && npm install && forge register && forge deploy   # app Jira
cd ../capteur && npm install && forge register && forge deploy # app Bitbucket
```

- `forge register` renseigne l'`app.id` du `manifest.yml` (déjà fait dans ce
  dépôt ; à refaire uniquement pour une installation qui vous est propre).
- Installation : `forge install -p jira -s <votre-site>.atlassian.net` pour le
  Cerveau ; `forge install -p bitbucket -s bitbucket.org/<espace>` pour le
  Capteur.
- Au premier appel, le Cerveau applique ses huit migrations Forge SQL
  (déclencheur horaire `migrations-schema` + rattrapage au premier appel).
- **Jumelage** : l'administrateur Jira génère un code à usage unique (10 min)
  dans la page de réglages du projet, l'administrateur Bitbucket le saisit dans
  les réglages de l'espace de travail ; le secret partagé et l'adresse du pont
  sont échangés à ce moment (diagramme de séquence dans
  `docs/ARCHITECTURE.md` §2.1).
- Pour une démonstration sans navigateur : variables `MAC_PAIRED_WORKSPACE`,
  `MAC_SHARED_SECRET` (chiffrée, `--encrypt`), `MAC_DEMO_DATA`, puis
  `npm run demo` — procédure complète dans `docs/DEMO-E2E.md`.
- Un contrôle de merge **bloquant** exige l'offre Premium Bitbucket ; sur une
  offre gratuite, le contrôle s'exécute et informe sans empêcher la fusion.
- En cas de souci (pont en 500, `stockage: indisponible`, écran vide…) :
  `docs/DEPANNAGE.md`.

## Signaler un problème

Ouvrez une issue avec le contexte minimal : commande exécutée, sortie obtenue,
sortie attendue, et pour tout ce qui touche l'app déployée, l'environnement
(`development` ou `production`) et le site. Les manquements connus sont déjà
classés dans `docs/AUDIT.md` — vérifiez-y avant de signaler.

## Licence

En contribuant, vous acceptez que vos contributions soient licenciées sous
Apache-2.0, comme le reste du dépôt (voir [`LICENSE`](LICENSE)).
