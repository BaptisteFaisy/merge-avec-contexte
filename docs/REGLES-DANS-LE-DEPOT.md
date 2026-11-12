# Règles dans le dépôt (`.merge-context.yml`)

> MC-17, §23 du cahier des charges — audit 20.
> « Un fichier `.merge-context.yml` versionné avec le code, relu comme le reste,
> borné par les règles de l'organisation. »

Un dépôt Bitbucket peut versionner, **à sa racine**, un fichier
`.merge-context.yml` qui durcit les règles de fusion pour ce dépôt. Le fichier
est du code : il passe en revue de code, il suit les branches, il a un
historique. Il n'a aucun pouvoir d'assouplir quoi que ce soit.

## 1. Le bornage : le dépôt durcit, jamais il n'affaiblit

L'espace de travail (l'organisation) fixe les réglages de référence. Le fichier
du dépôt s'y **compose**, il ne les remplace pas :

| Ce que le dépôt demande | Effet |
|---|---|
| Un niveau plus sévère (`information` → `warning` → `blocking`) | **Appliqué** |
| Un niveau plus permissif | **Ignoré et journalisé** |
| Une portée plus étroite (certains dépôts, certaines branches) | **Appliquée**, resserrée sur la portée de l'espace |
| Une portée plus large ou disjointe de celle de l'espace | **Ignorée et journalisée** |
| `mode: observe` (rendre la règle invisible) | **Ignoré et journalisé** |
| `mode: active` sur une règle observée par l'espace | **Appliqué** (durcissement) |
| Un paramètre de règle | **Fusionné** par-dessus celui de l'espace |
| Un code absent des réglages de l'espace | **Ignoré et journalisé** |

Concrètement, la composition **ajoute** un réglage durci, resserré sur le dépôt,
sans toucher au réglage de l'espace : les autres dépôts de l'organisation ne
voient rien changer. Le moteur évalue tous les réglages dont la portée couvre la
PR, et la plus stricte l'emporte.

Une règle sans portée déclarée est resserrée sur **le dépôt qui porte le
fichier** — un dépôt ne durcit jamais les autres.

## 2. Format du fichier

```yaml
# .merge-context.yml — à la racine du dépôt
version: 1
rules:
  - code: R-05              # requis : R-01 … R-13 (catalogue)
    level: blocking         # requis : information | warning | blocking
    mode: active            # optionnel : active | observe (observe est ignoré)
    scope:                  # optionnel : resserre la portée
      repositories:
        - checkout-api      # motifs glob : * ** ?
      branches:
        - main
    params:                 # optionnel : clés du catalogue pour cette règle
      jsmProjects:
        - JSM
      mappingSource: settings
  - code: R-01
    level: warning
```

Les codes et les paramètres disponibles sont ceux du catalogue
(`shared/src/rules/catalog.ts`) : `R-01` à `R-13`, avec pour chacun ses
paramètres (`keyPattern`, `allowedStatuses`, `jsmProjects`, `pathPatterns`…).

### Sous-ensemble YAML accepté

Le fichier est analysé par un **analyseur minimal** du sous-ensemble ci-dessus,
sans dépendance ajoutée :

- commentaires `#` (ligne entière, ou en fin de ligne précédé d'un espace) ;
- tables `cle: valeur` et tables imbriquées par indentation (2 espaces) ;
- listes d'éléments `- valeur` ou `- cle: valeur` ;
- scalaires : texte, nombre entier, `true`/`false` ; guillemets simples ou
  doubles retirés s'ils entourent toute la valeur.

Ne sont **pas** supportés (et n'ont pas lieu d'être ici) : ancres et alias,
documents multiples (`---`), blocs littéraux (`|`, `>`), valeurs sur plusieurs
lignes, tableaux en ligne (`[a, b]`), clés composées.

### Robustesse : le contrôle n'échoue jamais

Le fichier est lu pendant un merge check, dans un budget de quelques secondes.
Il ne doit **jamais** le faire échouer :

| Situation | Effet |
|---|---|
| Fichier absent (404) | aucune règle de dépôt, rien de journalisé d'anormal |
| Fichier vide | aucune règle de dépôt |
| Fichier illisible / mal formé | aucune règle de dépôt, motif journalisé |
| Entrée de règle invalide (code, niveau ou mode inconnu) | cette entrée est écartée et journalisée, les autres sont retenues |
| Lecture Bitbucket en erreur | aucune règle de dépôt |

## 3. Où vit le code

| Rôle | Fichier |
|---|---|
| Type `DepotRule` et composition/bornage (logique pure) | `shared/src/rules/depot.ts` |
| Champ `depotRules` de la charge utile d'évaluation | `shared/src/bridge/payload.ts` |
| Lecture du fichier via l'API Bitbucket (adaptateur fin) | `capteur/src/bitbucket/api.ts` (`lireReglesDepot`) |
| Analyse du fichier (sous-ensemble documenté) | `capteur/src/depot-regles.ts` |
| Composition dans l'entrée d'évaluation | `cerveau/src/bridge/routes.ts` |

La logique de composition est dans le **contrat partagé** : les deux apps en
reçoivent la même copie générée (`npm run shared:sync`), et le même bornage
s'applique quel que soit le côté qui l'invoque.

## 4. Version du contrat et écart de déploiement

Le durcissement venant du dépôt transite par le pont, les deux apps doivent
partir de la **même version du contrat**. L'empreinte du contrat
(`shared/CONTRACT.sha256`, somme SHA-256 de `shared/src/`) est embarquée dans
les deux apps par `npm run shared:sync` (`shared/src/rules/contrat.ts`) et
exposée :

- côté **Cerveau**, dans la réponse de la route publique `health` du pont
  (champ `contrat`) ;
- côté **Capteur**, dans le modèle de vue des réglages de l'espace de travail
  (champ `empreinteContrat`).

Un écart entre les deux empreintes signifie que les apps ne sont pas déployées
avec le même contrat : `npm run shared:sync` puis redéploiement.
