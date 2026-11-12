# Architecture de « Merge avec contexte »

## 1. Vue d'ensemble et frontière des deux apps

L'architecture de **Merge avec contexte** découle d'une contrainte de la plateforme Atlassian Forge : une même application Forge ne peut combiner les permissions Bitbucket et Jira Cloud. Le produit sépare donc strictement l'écoute du dépôt et l'intelligence métier en deux applications Forge complémentaires :

- **Le Capteur (Forge Bitbucket)** : s'installe sur l'espace de travail Bitbucket. Il intercepte les événements de PR via le module `bitbucket:mergeCheck`, lit les métadonnées de la PR par l'API REST Bitbucket, délègue l'évaluation au Cerveau par un web trigger signé, puis restitue le verdict au merge check et les explications détaillées dans une carte latérale de PR (`bitbucket:repoPullRequestCard`) et un panneau de l'onglet Overview (`bitbucket:repoPullRequestOverviewPanel`).
- **Le Cerveau (Forge Jira)** : s'installe sur le site Jira Cloud (incluant Jira Service Management, Confluence et Rovo). Il reçoit les requêtes d'évaluation via son point d'entrée `webtrigger`, exécute le moteur de règles, interroge Jira/JSM et le cache local (Forge SQL), applique les dérogations actives, persiste le journal d'évaluation et expose les outils de remédiation via les pages de réglages, l'encart ticket (`jira:issueContext`), l'agent conversationnel Rovo et la passerelle `rovo:mcp`.

```
+-----------------------------------------------------------------------------------+
| BITBUCKET CLOUD                                                                   |
|                                                                                   |
|  [ Développeur ]                                                                  |
|         |                                                                         |
|         v (push / merge attempt / review)                                         |
|  +--------------------+                                                           |
|  | Bitbucket PR Check |                                                           |
|  +---------+----------+                                                           |
|            | 1. trigger(workspace, repo, pr_id)                                  |
|            v                                                                      |
|  +-----------------------------------------------------------------------------+ |
|  | CAPTEUR (App Forge Bitbucket)                                                | |
|  |                                                                             | |
|  |  2. REST Bitbucket : lecture titre, branche, commits, fichiers, reviewers   | |
|  |  3. Extraction clés Jira (ex: PAY-123)                                       | |
|  |  4. Assemblage payload + Signature HMAC-SHA256 (nonce + timestamp)          | |
|  +---------------------------------------+-------------------------------------+ |
+------------------------------------------|----------------------------------------+
                                           | HTTPS POST (Web Trigger, route dans le corps)
                                           | Headers: x-mac-version, x-mac-timestamp,
                                           |          x-mac-nonce, x-mac-signature
                                           v
+-----------------------------------------------------------------------------------+
| JIRA CLOUD / JSM / ROVO                                                           |
|                                                                                   |
|  +-----------------------------------------------------------------------------+ |
|  | CERVEAU (App Forge Jira)                                                    | |
|  |                                                                             | |
|  |  5. Pont signé : validation anti-rejeu (< 5 min), vérification HMAC         | |
|  |  6. Évaluation des règles (R-01 à R-13) :                                   | |
|  |     +--------------------------------------------------------------------+  | |
|  |     | Moteur de règles contextuel                                        |  | |
|  |     |  - Cache local / Jira REST (< 60s) : critères d'acceptation, liens  |  | |
|  |     |  - JSM incidents ouverts sur le service associé                    |  | |
|  |     |  - Calendrier des gels de déploiement en base SQL                  |  | |
|  |     |  - Vérification des dérogations valides en base SQL               |  | |
|  |     +--------------------------------------------------------------------+  | |
|  |  7. Écriture journal & métriques d'exécution (Forge SQL)                     | |
|  |  8. Construction du verdict (autorisé / bloqué) et du message actionnable   | |
|  +---------------------------------------+-------------------------------------+ |
|                                          |                                        |
|  [ Agent Rovo / Outils MCP ]             | Réponse JSON                           |
|  (evaluate-merge, explain-block, ...)    | { success, verdict, reasons, ... }     |
|                                          |                                        |
+------------------------------------------|----------------------------------------+
                                           v
+-----------------------------------------------------------------------------------+
| RESTITUTION CAPTEUR                                                               |
|                                                                                   |
|  - Verdict renvoyé au merge check natif (success: true|false, message résumé)     |
|  - Rendu de la carte latérale de PR (détails, raisons, bouton de dérogation)     |
+-----------------------------------------------------------------------------------+
```

---

## 2. Le pont signé et le protocole de jumelage

Le web trigger Forge ne proposant aucune authentification native par défaut, les échanges inter-apps sont scellés par une signature cryptographique symétrique.

### 2.1 Jumelage initial (Pairing)

Implémentation : `shared/src/bridge/pairing.ts` (contrat pur),
`cerveau/src/bridge/pairing.ts` (route `pair` du pont),
`cerveau/src/app/pairing-repo.ts` + `cerveau/src/app/secrets.ts` (coffre et
référence en base), `capteur/src/pairing/store.ts` (côté Bitbucket).

1. **Génération du code** : depuis la page de réglages du projet Jira,
   l'administrateur demande un code de jumelage. Le Cerveau crée une offre :
   code à usage unique au format `MAC-XXXX-XXXX` (alphabet sans caractères
   ambigus — ni I, ni L, ni O, ni U), valable **10 minutes**
   (`PAIRING_TTL_MS`), enregistrée en base avec son horodatage.
2. **Saisie du code** : l'administrateur Bitbucket recopie ce code dans la
   page de réglages de l'espace de travail du Capteur, qui appelle la route
   **publique** `pair` du pont avec `{ code, workspaceUuid }`. Aucune signature
   n'est possible à ce stade : le secret partagé n'existe pas encore, le code
   à usage unique est la preuve.
3. **Échange de clés** : le Cerveau valide le code (inconnu, expiré ou déjà
   utilisé ⇒ refus explicite ; un code faux ne consomme pas l'offre), tire un
   secret partagé de **256 bits** (32 octets aléatoires, base64), l'écrit dans
   son **coffre** (secret chiffré Forge Storage), ne garde en base qu'une
   **référence** (`pairing.secret_ref` — le secret n'est jamais en base), puis
   répond `{ secret, bridgeUrl, siteUrl, pairedAt }`. L'adresse du pont vient
   de `webTrigger.getUrl('pont-bitbucket')` (`cerveau/src/app/pont-url.ts`) :
   le Capteur ne peut pas la deviner.
4. **Stockage côté Capteur** : le secret va dans le stockage de secrets chiffré
   de Forge (`setSecret`), l'adresse du pont, le site et la date de jumelage
   dans le KVS ordinaire (clés `mac:secret:…`, `mac:pairing:…`,
   `mac:fallback:…` par espace de travail).

```
Admin Jira      CERVEAU (app Forge Jira)         CAPTEUR (app Forge Bitbucket)  Admin Bitbucket
    |                     |                                |                         |
    | réglages projet :   |                                |                         |
    | « Générer un code » |                                |                         |
    |-------------------->| offre : code MAC-XXXX-XXXX,    |                         |
    |<--------------------| TTL 10 min, usage unique,      |                         |
    |                     | déposée en base                |                         |
    |                     |                                |                         |
    |      le code est recopié à la main (< 10 min)        |                         |
    |--------------------------------------------------------------------->---------|
    |                     |                                |  réglages de l'espace : |
    |                     |                                |<------- saisie du code -|
    |                     |  POST route publique `pair`    |                         |
    |                     |<-------------------------------| { code, workspaceUuid } |
    |                     | code validé (ni expiré, ni     |                         |
    |                     | déjà utilisé)                  |                         |
    |                     | secret 256 bits tiré au hasard |                         |
    |                     | COFFRE : setSecret(réf, secret)|                         |
    |                     | BASE   : secret_ref = réf      |                         |
    |                     |  200 { secret, bridgeUrl,      |                         |
    |                     |        siteUrl, pairedAt }     |                         |
    |                     |------------------------------->| COFFRE : setSecret(…)   |
    |                     |                                | KVS : pont, site, date  |
    |                     |                                |                         |
    |                     |  requêtes suivantes : HMAC-SHA256 signé (en-têtes        |
    |                     |<===============================| x-mac-*) : evaluate,    |
    |                     |                                | card, waiver.request…   |
    |                     |                                |                         |
    | re-jumelage : nouveau code => nouveau secret ; l'ancien ne signe plus (rotation)|
```

Une variante sans navigateur existe pour le déploiement automatisé et la
démonstration : l'amorçage par variables d'environnement (§8.2).

### 2.2 Signature des requêtes d'évaluation
Chaque requête envoyée par le Capteur porte quatre en-têtes
(`shared/src/bridge/sign.ts`) :
- `x-mac-version` : version du schéma de signature ;
- `x-mac-timestamp` : horodatage en **millisecondes depuis l'epoch** ;
- `x-mac-nonce` : UUID v4 unique généré à chaque appel ;
- `x-mac-signature` : empreinte hexadécimale
  `HMAC-SHA256(secret, chaîne canonique)`, où la chaîne canonique est la
  concaténation — séparée par des sauts de ligne — de la version, de
  l'horodatage, du nonce et de l'empreinte **SHA-256 hexadécimale du corps**
  (le corps est haché, pas signé tel quel). La comparaison des empreintes est à
  temps constant.

### 2.3 Vérification et protection anti-rejeu
À la réception sur le Cerveau (`shared/src/bridge/verify.ts`) :
1. **Fenêtre temporelle (5 minutes)** : si l'écart entre l'horodatage et
   l'heure du Cerveau dépasse `MAX_SKEW_MS` (300 s), la requête est rejetée
   immédiatement (HTTP 401).
2. **Anti-rejeu** : le nonce est vérifié contre les nonces déjà vus
   (`NonceStore`, mémoire purgée des nonces expirés — aucune table SQL, voir
   `docs/AUDIT.md` n°62). Si le nonce a déjà été consommé, la requête est
   rejetée.
3. **Validation cryptographique** : le Cerveau recalcule l'empreinte HMAC avec
   le secret partagé lu dans le coffre via sa référence en base. Si la
   signature ne correspond pas, la requête est rejetée.
4. **Sobriété des données** : aucun code source n'est transmis par le pont. Seules transitent des métadonnées structurelles (clés de tickets, nom de branche, identifiant du dépôt, liste des chemins modifiés). L'administrateur peut en outre désactiver l'envoi des chemins de fichiers.

### 2.4 Rotation du secret
Une nouvelle procédure de jumelage générée depuis Jira remplace instantanément le secret actif et révoque l'ancien secret, sans interruption de service pour les requêtes ultérieures.

---

## 3. Déroulé d'un contrôle en 6 étapes

Conformément à la spécification (§13.2) :

1. **Invocation du merge check** : Bitbucket appelle le Capteur lors de l'un des trois déclencheurs configurés :
   - `on-code-pushed` : à chaque nouveau commit poussé sur la PR ;
   - `on-reviewer-status-changed` : lorsqu'un relecteur approuve ou demande des modifications ;
   - `on-merge` : au moment exact où l'utilisateur clique sur le bouton « Merge » (déclencheur ultime anti-incident).
2. **Lecture des métadonnées de PR** : le Capteur appelle l'API REST Bitbucket pour collecter la branche source, la branche cible, le titre, les messages de commit, la liste des relecteurs et les fichiers impactés.
3. **Extraction des clés de tickets** : recherche d'identifiants de clés Jira valides (regex `[A-Z][A-Z0-9]+-\d+`) par ordre de priorité :
   - dans le nom de la branche source (ex: `feature/PAY-123-limite`) ;
   - dans le titre de la PR ;
   - dans les messages des commits de la branche.
   Si plusieurs tickets sont trouvés, tous sont transmis.
4. **Envoi au Cerveau par le pont signé** : émission de la requête POST signée vers le web trigger avec les clés extraites, le dépôt, la branche cible, les fichiers et le type de déclencheur.
5. **Évaluation contextuelle par le Cerveau** :
   - Vérification du statut Jira et des critères d'acceptation du ou des tickets.
   - Contrôle du calendrier des gels de déploiement pour la branche cible.
   - Résolution du service lié au dépôt et interrogation des incidents JSM ouverts.
   - Consultation des dérogations actives pour la PR et les règles en infraction.
   - Enregistrement de l'évaluation dans la table `evaluation`.
6. **Verdict et restitution** : le Cerveau retourne le statut global (`PASSED`, `BLOCKED`, `WARNED`), les motifs d'échec et les actions de déblocage. Le Capteur répond au merge check avec un booléen `success` et le message formaté, puis met à jour les données de la carte de PR.

---

## 4. Performance et tenue des 5 secondes

Bitbucket impose une réactivité stricte lors des merge checks interactifs. Le Cerveau est calibré pour répondre en moins de 5 secondes dans 95 % des cas (percentile P95) :

- **Mise à jour proactive par événements (Forge Triggers)** : le Cerveau écoute les événements Jira `avi:jira:created:issue` et `avi:jira:updated:issue` (trigger `ticket-modifie` du manifeste). Dès qu'un ticket change, son entrée d'`issue_cache` est invalidée ; la prochaine évaluation relit Jira.
- **Cache rafraîchi à 60 secondes** : lors d'une évaluation de merge check, le Cerveau lit en priorité `issue_cache`. Il n'effectue un appel REST direct vers l'API Jira que si l'enregistrement a plus de 60 secondes ou est absent.
- **Données locales en base SQL** : les tables `freeze`, `rule_config`, `waiver` et `repo_service` résident directement dans Forge SQL, garantissant des temps de lecture inférieurs à 50 millisecondes.

---

## 5. Politique de repli (Fallback)

Si le Cerveau est injoignable (timeout réseau, panne d'infrastructure, web trigger indisponible) :

- **Mode Ouvert (`open` - défaut)** : le contrôle Bitbucket renvoie `success: true` accompagné du message d'avertissement : `« Contexte indisponible, contrôle non concluant »`. Le flux des développeurs n'est pas interrompu pour les dépôts standards.
- **Mode Fermé (`closed`)** : le contrôle Bitbucket renvoie `success: false`. La fusion est strictement bloquée jusqu'au rétablissement de la communication avec le Cerveau. Recommandé pour les dépôts critiques ou soumis à des exigences de conformité réglementaire.
- **Traçabilité** : le repli est immédiat et visible — `fallbackEvaluation` (`shared/src/policy/fallback.ts`) produit un verdict et le message « Contexte indisponible, contrôle non concluant » au format du §9, et la politique est lue dans le stockage du Capteur (`capteur/src/pairing/store.ts`, clé `mac:fallback:…`). Il n'y a en revanche **ni journalisation locale du repli ni rejeu vers le Cerveau à la reprise du lien** (manque connu : `docs/AUDIT.md` n°27 pour le bandeau « pont coupé »).

---

## 6. Modèle de données (Forge SQL - Cerveau)

Le stockage persistant repose sur Forge SQL côté Jira : les huit tables du §14,
plus deux tables techniques ajoutées à l'usage (`bridge_nonce` pour l'anti-rejeu
du pont, `waiver_audit` pour la traçabilité des décisions de dérogation) :

1. `pairing` : état du jumelage entre l'espace de travail Bitbucket et le site Jira.
   - Colonnes : `id` (PK, string), `workspace_uuid` (string), `secret_ref` (string), `paired_at` (timestamp), `paired_by` (string).
2. `rule_config` : configuration et paramétrage des règles par projet ou globalement.
   - Colonnes : `project_id` (string), `rule_code` (string), `level` (`BLOCKING` | `WARNING` | `INFO`), `mode` (`ACTIVE` | `OBSERVATION` | `DISABLED`), `scope_json` (text), `params_json` (text).
3. `freeze` : périodes de gel de déploiement planifiées ou récurrentes.
   - Colonnes : `id` (PK, string), `name` (string), `starts_at` (timestamp), `ends_at` (timestamp), `branches` (string), `services` (string), `recurrence` (string, nullable), `created_by` (string).
4. `repo_service` : cartographie entre les dépôts Bitbucket et les services JSM ou composants Jira.
   - Colonnes : `workspace_uuid` (string), `repo_uuid` (string), `service` (string), `jira_component` (string).
5. `evaluation` : journal immuable des évaluations effectuées.
   - Colonnes : `id` (PK, string), `workspace_uuid` (string), `repo_uuid` (string), `pr_id` (string), `issue_keys` (string), `trigger` (string), `verdict` (string), `reasons_json` (text), `evaluated_at` (timestamp), `duration_ms` (integer).
6. `waiver` : dérogations accordées sur des règles données.
   - Colonnes : `id` (PK, string), `pr_id` (string), `repo_uuid` (string), `rule_code` (string), `requested_by` (string), `granted_by` (string), `reason` (text), `expires_at` (timestamp), `status` (`ACTIVE` | `EXPIRED` | `REVOKED`).
7. `issue_cache` : cache des métadonnées Jira pour l'évaluation rapide.
   - Colonnes : `issue_id` (PK, string), `status` (string), `criteria_json` (text), `blockers_json` (text), `fix_version` (string, nullable), `updated_at` (timestamp).
8. `service_incident` : état des incidents actifs déclarés sur les services.
   - Colonnes : `service` (string), `incident_key` (string), `opened_at` (timestamp), `resolved_at` (timestamp, nullable).

---

## 7. Organisation du dépôt (Monorepo)

Le dépôt adopte une structure modulaire séparant le contrat partagé, les deux
applications Forge, l'outillage et la documentation. Arbre réel au 2026-11-11
(les copies `*/src/shared/` sont **générées** par `npm run shared:sync` — ne
jamais les éditer à la main) :

```
merge-avec-contexte/
├── shared/                     # Contrat unique, seule source de vérité (logique pure)
│   ├── src/
│   │   ├── types.ts            # Types du domaine (verdicts, requêtes, tables)
│   │   ├── rules/catalog.ts    # Catalogue des 13 règles (défauts, niveaux, modes)
│   │   ├── bridge/             # Pont signé : sign.ts, verify.ts, payload.ts, pairing.ts
│   │   ├── message/            # format.ts (format imposé §9), strings.ts (bilingue)
│   │   ├── freezes/match.ts    # Portée et fenêtre des gels (ponctuels, récurrents)
│   │   ├── issues/extract-keys.ts  # Extraction des clés Jira (branche, titre, commits)
│   │   ├── match/glob.ts       # Motifs glob (branches, chemins)
│   │   ├── policy/fallback.ts  # Politique de repli + délai du pont (4 s)
│   │   ├── time/moment.ts      # Fenêtres horaires (heures calmes, gels)
│   │   └── waivers/resolve.ts  # Validité et trace des dérogations
│   └── test/                   # 7 fichiers de tests (vitest)
├── capteur/                    # App Forge Bitbucket (aucune donnée durable produit)
│   ├── manifest.yml            # mergeCheck, carte de PR, panneau, réglages espace
│   ├── src/
│   │   ├── index.ts            # runCheck + les 3 resolvers d'écran
│   │   ├── app/resolvers.ts    # Logique des resolvers (aucun import Forge)
│   │   ├── bitbucket/          # api.ts, pr.ts, types.ts (adaptateurs REST)
│   │   ├── bridge/client.ts    # Client du pont signé (délai 4 s, erreurs normalisées)
│   │   ├── check/run.ts        # Réponse au merge check, politique de repli
│   │   ├── frontend/           # pr-card.jsx, pr-panel.jsx, workspace-settings.jsx
│   │   ├── pairing/store.ts    # KVS + secret chiffré côté Capteur
│   │   ├── policy/settings.ts  # Réglages de l'espace de travail
│   │   ├── ui/view-models.ts   # Modèles de vue des écrans
│   │   └── shared/             # Copie générée de shared/src
│   └── test/                   # 5 fichiers de tests
├── cerveau/                    # App Forge Jira (toutes les données durables)
│   ├── manifest.yml            # webtrigger, pages, encart, 5 actions, Rovo, MCP,
│   │                           # trigger, scheduledTrigger, sql
│   ├── src/
│   │   ├── index.ts            # Les 11 handlers du manifeste
│   │   ├── app/                # Composition, amorçage, adaptateurs (§8)
│   │   ├── bridge/             # Pont signé : handler.ts, routes.ts (6 routes),
│   │   │                       # pairing.ts, errors.ts, evaluate-input.ts, deps.ts
│   │   ├── cache/              # issue-cache.ts, service-cache.ts (60 s), ports.ts
│   │   ├── frontend/           # 3 écrans .jsx + composants/ (UI Kit 2)
│   │   ├── jira/               # reader.ts, queries.ts, parse.ts (adaptateurs REST)
│   │   ├── rovo/               # 5 actions (evaluate-merge, explain-block,
│   │   │                       # list-freezes, list-waivers, request-waiver)
│   │   │                       # + agent-prompt.ts, deps.ts
│   │   ├── rules/              # engine.ts + r01-*.ts … r13-*.ts, defaults.ts,
│   │   │                       # registry.ts, input.ts
│   │   ├── seed/               # Jeu de démonstration : dataset.ts, loader.ts (§8.3)
│   │   ├── storage/            # 8 tables §14 + 2 techniques : schema.ts, migrate.ts,
│   │   │                       # memory-store.ts, ports.ts
│   │   ├── ui/                 # view-model-{reglages,encart,console,journal}.ts
│   │   └── shared/             # Copie générée de shared/src
│   └── test/                   # 19 fichiers de tests + recette-fixtures.ts
├── scripts/
│   ├── shared-sync.mjs         # sync/check du contrat vers les deux apps
│   └── demo-e2e.ts             # Démonstration de bout en bout signée (§8.5)
├── tools/
│   ├── check-file-limits.py    # Garde : < 500 lignes par fichier de code
│   ├── check-function-limits.mjs   # Garde : < 50 lignes par fonction (AST)
│   └── check-manifests.mjs     # Cohérence des manifestes Forge
└── docs/                       # Cahier des charges, architecture, recette,
                                # dépannage, juges, vidéo, validations, audit
```

---

## 8. Assemblage, amorçage et mode démonstration

### 8.1 La racine de composition — `cerveau/src/app/`

Une app Forge ne s'exécute que sur la plateforme Atlassian : le dossier
`cerveau/src/app/` est la **racine d'assemblage** qui branche tous les modules
derrière leurs ports, sans jamais importer Forge dans la logique métier.
`cerveau/src/index.ts` (les onze handlers du manifeste) ne fait que déléguer à
cet assemblage ; le Capteur a son équivalent plus simple dans
`capteur/src/app/resolvers.ts`.

| Groupe | Fichiers | Rôle |
|---|---|---|
| Assemblage | `compose.ts` | `assemblerCerveau()` / `cerveauProduction()` : un seul endroit où store, coffre, cache, moteur, pont, Rovo et écrans sont branchés ; tout est injectable (`OptionsAssemblage`), ce qui rend le câblage testable (`cerveau/test/composition.test.ts`) |
| Configuration | `config.ts` | `AppConfig` : `siteUrl`, `projectId`, `bridgeUrl`, `locale`, `adminAccountId`, approbateurs ; politique de repli lue en base (défaut `open`) |
| Environnement | `env.ts` | Lecture des variables `MAC_PAIRED_WORKSPACE`, `MAC_SHARED_SECRET`, `MAC_SITE_URL`, `MAC_DEMO_DATA` (§8.2) |
| Amorçage | `bootstrap.ts` | Installation neuve sans navigateur : jumelage d'office et/ou chargement du jeu de démonstration, idempotents (§8.2) |
| Infrastructure injectée | `horloge.ts`, `logger.ts` | Horloges (`() => string` pour le pont, objet `Clock` pour Rovo) et journal applicatif commun aux deux ports |
| Coffre | `secrets.ts`, `forge-storage.ts` | `SecretVault` : le secret du pont n'est **jamais en base**, seulement dans le stockage de secrets chiffré Forge (`setSecret`) ; la base garde une référence (`pairing.secret_ref`). `forge-storage.ts` branche l'adaptateur `@forge/storage` en un seul endroit |
| Choix du stockage | `store-factory.ts` | Forge SQL en production ; repli mémoire si `@forge/sql` est indisponible (tests hors plateforme) |
| Adaptateurs de ports | `pairing-repo.ts`, `context-repo.ts`, `rovo-adaptateurs.ts`, `cache-adaptateurs.ts`, `waivers.ts`, `reglages.ts` | Traduisent le stockage (`storage/ports.ts`) vers les ports attendus par le pont (`bridge/deps.ts`), les actions Rovo (`rovo/deps.ts`) et le cache (`cache/ports.ts`) ; `context-repo.ts` fournit aussi les règles par défaut du catalogue quand rien n'est réglé |
| Services | `evaluate.ts`, `resolvers-ui.ts`, `pont-url.ts` | Cœur d'évaluation (cache 60 s → règles → journal, ne lève jamais) ; logique des trois resolvers d'écran Jira ; adresse du pont lue à l'exécution par `webTrigger.getUrl('pont-bitbucket')` (ou `MAC_BRIDGE_URL`) |
| Démonstration | `demo-reader.ts` | Lecteur Jira mixte activé par `MAC_DEMO_DATA` (§8.4) |

### 8.2 Amorçage par variables d'environnement (`bootstrap.ts` + `env.ts`)

Pour qu'un déploiement automatisé ou une démonstration n'ait pas besoin d'un
navigateur, deux opérations facultatives sont déclenchées par des variables
posées avec `forge variables set` :

- **jumelage d'office** : `MAC_PAIRED_WORKSPACE` + `MAC_SHARED_SECRET` (posée
  **chiffrée**, `--encrypt`) enregistrent un jumelage — le secret va dans le
  coffre, la base ne garde que sa référence, comme dans le jumelage par code ;
- **jeu de démonstration** : `MAC_DEMO_DATA=1` charge le jeu du §20 au
  démarrage.

Les deux sont **idempotents** : un redémarrage ne recrée rien et ne remplace
pas un jumelage déjà établi par l'interface. `MAC_SITE_URL` surcharge le site
Jira de la configuration. Tests : `cerveau/test/bootstrap.test.ts`.

### 8.3 Jeu de démonstration — `cerveau/src/seed/`

- `dataset.ts` : jeu de données **figé** du §20 — instant de référence
  `DEMO_NOW`, tickets `PAY-*` (critères non cochés, ticket bloqué par un
  autre, version publiée…), gel « Black Friday », incident ouvert `INC-52` sur
  `checkout-api`, correspondance dépôt → service, dérogation accordée et
  dérogation expirée, réglages des règles. Aucun réseau, aucune base : c'est
  aussi le support des tests de recette §18 (`cerveau/test/recette-fixtures.ts`).
- `loader.ts` : écrit le jeu dans le stockage (tickets dans `issue_cache`,
  gels, incidents, correspondances, dérogations, réglages). Chaque écriture est
  un upsert **idempotent** ; les dates sont relatives à l'instant du chargement
  (le gel reste à venir, l'incident reste ouvert). Déclenché depuis le bouton
  « Charger le jeu de démonstration » de la page de réglages, ou par
  l'amorçage (§8.2). Tests : `cerveau/test/demo-dataset.test.ts`,
  `cerveau/test/seed-loader.test.ts`.

### 8.4 Mode démonstration (`MAC_DEMO_DATA`) — `app/demo-reader.ts`

Le site fourni par `forge site provision` ne contient ni le projet `PAY`, ni
les tickets du jeu, ni d'incident JSM. Quand `MAC_DEMO_DATA` est posée, la
racine de composition (`compose.ts`) intercale un **lecteur de démonstration**
devant le lecteur Jira réel : les clés et les services connus du jeu sont
servis depuis le seed, et **tout le reste est délégué à Jira pour de vrai** —
un vrai ticket du site reste lisible, la démo ne ment pas sur les données
réelles. En production normale (variable absente), ce module n'est jamais
branché. Test : `cerveau/test/demo-reader.test.ts`.

### 8.5 Démonstration de bout en bout — `scripts/demo-e2e.ts`

`npm run demo` joue le parcours complet **contre l'app déployée**, sans
navigateur ni espace de travail Bitbucket : le script signe ses requêtes avec
le contrat partagé (`shared/src/bridge/sign.ts`) et les envoie au web trigger
de production, qui évalue réellement les règles. Variables : `MAC_BRIDGE_URL`
et `MAC_SHARED_SECRET` (requises), `MAC_WORKSPACE` (défaut `ws-demo`) et
`MAC_LOCALE` (défaut `fr`). Onze vérifications : santé du pont, PR bloquée avec
le message imposé du §9, carte détaillée, dérogation demandée / accordée /
exercée / retirée, incident, correctif lié autorisé, requête non signée
refusée. Procédure et sortie enregistrée : `docs/DEMO-E2E.md` ; parties pures
testées dans `scripts/test/demo-e2e.test.ts`.

---

## 9. Frontière testable : logique pure contre adaptateurs fins

Pour garantir une testabilité maximale et une exécution ultra-rapide en intégration continue (CI < 5 minutes) :

1. **Logique pure (sans import Forge)** :
   - Tous les calculs de règles (`evaluateRule()`), la détection des clés, la construction des messages formatés et le calcul cryptographique HMAC sont implémentés dans `shared/src/` sans dépendance vers `@forge/api`, `@forge/bridge` ou le runtime Atlassian.
   - Cette logique est exécutée directement avec Vitest / Node.js standard en quelques millisecondes.
2. **Adaptateurs fins isolés** :
   - Les appels spécifiques (`@forge/storage`, `@forge/sql`, `asApp().requestJira`, `asApp().requestBitbucket`) sont confinés dans des adaptateurs légers (`cerveau/src/jira/reader.ts`, `capteur/src/bitbucket/api.ts`, `cerveau/src/storage/sql-store.ts`, `cerveau/src/app/forge-storage.ts`).
   - En environnement de test, ces adaptateurs sont remplacés par des doubles de test en mémoire (in-memory test doubles), permettant de tester 100 % des flux de décision sans provisionner d'infrastructure distante.
