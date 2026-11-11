# Conventions de contribution

Ce dépôt est écrit en grande partie par des agents qui travaillent en parallèle, chacun sur
une PR. Ces règles existent pour que le travail des uns reste compilable et testable une fois
celui des autres mergé. Elles sont vérifiées par la CI : un écart rend la PR rouge.

## 1. Architecture : logique pure d'un côté, adaptateurs fins de l'autre

Une app Forge ne s'exécute que sur la plateforme Atlassian : on ne peut ni la lancer ni la
tester localement. Tout le code qui compte est donc écrit **sans aucun import Forge** et testé
en `vitest` ; les modules qui importent `@forge/*` restent des adaptateurs fins (lire, écrire,
afficher) qui délèguent immédiatement à la logique pure.

```
pur (testé)      shared/src/**        types, règles, messages, pont signé, gels, dérogations
                 cerveau/src/rules/** moteur et règles
adaptateur       cerveau/src/jira/**  lectures Jira REST
                 cerveau/src/ui/**    composants Forge UI (assemblent des données déjà calculées)
                 capteur/src/bitbucket/**  lectures Bitbucket REST
```

Trois conséquences obligatoires :

- **Le temps est injecté.** Aucune fonction ne lit l'heure : elle reçoit `now` (chaîne ISO
  8601) ou un objet `Clock`. Les tests fixent `now`.
- **Les identifiants sont des données.** Une règle ne connaît ni Jira ni Bitbucket : elle
  reçoit un `IssueContext`, un `Freeze`, un `Incident` déjà chargés.
- **Les accès distants passent par une interface.** `IssueReader`, `Store`, `NonceStore`,
  `BridgeClient` : une implémentation réelle (Forge) et une implémentation mémoire (tests).

## 2. Le contrat partagé

`shared/src/` est la seule source de vérité du contrat entre les deux apps. Chaque app en
reçoit une copie générée dans `<app>/src/shared/` (une app Forge est déployée comme un dossier
autonome). **On n'édite jamais une copie** : on modifie `shared/src/`, puis
`npm run shared:sync`, et on déclare les deux copies dans le périmètre de la PR. La CI vérifie
l'absence de dérive (`npm run shared:check`).

`npm run shared:sync` régénère aussi `shared/CONTRACT.sha256` : l'**empreinte du contrat**,
somme SHA-256 de l'arborescence `shared/src/` (chemins + contenus, triés). Elle identifie la
version du contrat avec laquelle chaque app est déployée ; `npm run shared:check` la compare au
contenu courant. `npm install` installe un **hook pre-commit** qui refuse un commit dont les
copies ou l'empreinte dérivent (le réinstaller à la main : `npm run hooks:install`). La CI
rejoue `shared:check` sur la PR, sur l'arbre de la file de merge (`merge_group`) et sur `main`
après fusion.

## 3. Taille : moins de 500 lignes par fichier, moins de 50 par fonction

Vérifié par `tools/check-file-limits.py` et `tools/check-function-limits.mjs`. Au-delà, on
découpe (module, helper, sous-composant) — on n'augmente jamais la limite. Un fichier de
règles, c'est une règle ; un composant d'UI, c'est un écran ou un morceau d'écran.

## 4. TypeScript et tests

- `strict: true`, imports **sans extension** (`import { x } from './types'`), ESM partout.
- Ces conventions sont contrôlées par `tools/check-style.mjs` (`npm run lint`, joué en CI,
  sur l'AST TypeScript) : imports relatifs sans extension ; `@forge/*` interdit dans la logique
  pure (`shared/`, copies `<app>/src/shared/`, `cerveau/src/rules/`, `cerveau/src/rovo/`,
  `capteur/src/check/`) ; `console.*` uniquement dans `<app>/src/app/logger.ts` ; `Date.now()`
  uniquement dans `<app>/src/app/horloge.ts`, `<app>/src/app/secrets.ts`, les zones
  d'adaptateurs, ou en repli explicite d'une horloge injectée (`x ?? Date.now()`,
  `c ? injecte() : Date.now()`). Le formatage déclaratif des éditeurs vit dans `.editorconfig`.
- Un module = un fichier ; les types publics vivent dans `shared/src/types.ts`.
- Tests dans `<paquet>/test/*.test.ts`, nommés `<sujet>.test.ts`, un comportement par `it`.
- Aucun test ne dépend du réseau, du système de fichiers ou de l'heure réelle.
- Les messages utilisateur existent **en français et en anglais** (la soumission est en
  anglais) : ils passent par `shared/src/message/strings.ts`, jamais en dur dans une règle.
- Aucune donnée de code source ne quitte Bitbucket : seuls des métadonnées de PR circulent
  sur le pont, et l'envoi des chemins de fichiers est désactivable.

## 5. Commandes

```bash
npm install          # une fois, à la racine (installe aussi le hook pre-commit)
npm test             # vitest run
npm run typecheck    # tsc --noEmit
npm run lint         # conventions TypeScript du dépôt (tools/check-style.mjs)
npm run limits       # gardes de taille
npm run manifests    # manifestes Forge : contrôles croisés + vrai schéma
npm run verify       # shared:check + lint + typecheck + test + limits
npm run deploy -- <app> <environnement>   # voir §8
```

Les manifestes Forge sont contrôlés deux fois en CI, sans duplication :
`tools/check-manifests.mjs` (contrôles croisés maison : handlers exportés, ressources, clés de
fonction bornées) et `tools/check-manifest-schema.mjs` (validation contre le **vrai schéma** de
la plateforme, `@forge/manifest/schema.json`, via `ajv` déjà présent dans l'arbre — aucune
dépendance ajoutée). Les gardes outillage se testent elles-mêmes :
`node --test tools/selftests/*.test.mjs` (joué en CI).

## 6. Pull requests

La CI exige trois checks (`ci`, `ci-budget`, `couche0`) ; une PR verte est embarquée par la
file **Mergify** et mergée sans intervention humaine. Ne jamais merger à la main, ne jamais
pousser sur `main`.

Le garde `couche0` impose un bloc `## Scope` exact dans le corps de la PR : une puce par
fichier ou dossier modifié, et **aucune puce inutile** (un périmètre surdimensionné est
refusé). Un motif sans joker désigne un dossier et tout son contenu
(`cerveau/src/rules` couvre `cerveau/src/rules/r01.ts`).

```markdown
## Scope
- `cerveau/src/rules/r04-freeze.ts` — règle R-04 (gel sur la branche cible)
- `cerveau/test/r04-freeze.test.ts` — tests de R-04
```

Modifications interdites sans décision explicite : `.mergify.yml`, `.github/` (les fichiers de
garde exigent la mention libre `SAMVISION_ALLOW_GUARD_BUMP` dans le corps de la PR). Sont
aussi refusés dans les lignes ajoutées : les pushes forcés, le déclencheur de PR à privilèges
(celui qui expose les secrets aux forks), toute clé d'API, et les dates antérieures au
26 octobre 2026 (les citer comme « relevé antérieur, hors de cet arbre »).

## 7. Nommage

| Élément | Convention | Exemple |
|---|---|---|
| Fichier de règle | `r<nn>-<sujet>.ts` | `r05-incident.ts` |
| Test | `<sujet>.test.ts` | `r05-incident.test.ts` |
| Code de règle | `R-01` … `R-13` (majuscules, tiret) | `R-04` |
| Branche | `<domaine>/<sujet>` | `cerveau/regles-mvp`, `capteur/carte-pr` |
| Table SQL | singulier, `snake_case` | `rule_config`, `service_incident` |

## 8. Déploiement : Node, CLI Forge et script

- `engines.node` de `package.json` aligné sur ce qu'exige le CLI Forge :
  `^22.23.4 || ^24.22.1 || >=26.12.1`. Le CLI verrouillé (§ ci-dessous) annonce supporter les
  branches 22.x et 24.x ; hors de ces branches il affiche un avertissement de support.
- La version du CLI Forge utilisée pour déployer est **verrouillée** dans
  `tools/forge-cli.version` : `scripts/deploiement.mjs` refuse toute autre version
  (écart assumé : `FORGE_CLI_VERSION=<version>` dans l'environnement). Le CLI n'est pas dans le
  PATH : il est cherché dans l'ordre via `FORGE_BIN`, `~/.atlassian/cli/node_modules/.bin/forge`,
  puis `forge` du PATH ; absent, le script échoue proprement.
- `npm run deploy -- <capteur|cerveau> <development|staging|production>` enchaîne :
  `npm run verify` (contrat synchronisé + empreinte, style, typecheck, tests, limites),
  `forge lint`, `forge deploy -e <environnement> --non-interactive`, puis — pour le Cerveau —
  le contrôle `health` du pont (adresse lue dans `MAC_BRIDGE_URL`, route publique : aucun
  secret dans le script ; les secrets d'app restent posés par l'opérateur via
  `forge variables set --encrypt`).
