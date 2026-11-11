# Architecture de « Merge avec contexte »

## 1. Vue d'ensemble et frontière des deux apps

L'architecture de **Merge avec contexte** découle d'une contrainte de la plateforme Atlassian Forge : une même application Forge ne peut combiner les permissions Bitbucket et Jira Cloud. Le produit sépare donc strictement l'écoute du dépôt et l'intelligence métier en deux applications Forge complémentaires :

- **Le Capteur (Forge Bitbucket)** : s'installe sur l'espace de travail Bitbucket. Il intercepte les événements de PR via le module `bitbucket:mergeCheck`, lit les métadonnées de la PR par l'API REST Bitbucket, délègue l'évaluation au Cerveau par un web trigger signé, puis restitue le verdict au merge check et les explications détaillées dans une carte latérale de PR (`bitbucket:pullRequestOverviewPanel`).
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
                                           | HTTPS POST (Web Trigger)
                                           | Headers: X-MAC-Signature, X-MAC-Nonce,
                                           |          X-MAC-Timestamp
                                           v
+-----------------------------------------------------------------------------------+
| JIRA CLOUD / JSM / ROVO                                                           |
|                                                                                   |
|  +-----------------------------------------------------------------------------+ |
|  | CERVEAU (App Forge Jira)                                                    | |
|  |                                                                             | |
|  |  5. Pont signé : validation anti-rejeu (< 5 min), vérification HMAC         | |
|  |  6. Évaluation des règles (R-01 à R-07) :                                   | |
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
1. **Génération du code** : depuis la page de réglages Jira, l'administrateur clique sur « Générer un code de jumelage ». Le Cerveau génère un token aléatoire à usage unique chiffré, d'une durée de validité de 10 minutes, associé à l'URL de son web trigger.
2. **Saisie du code** : l'administrateur Bitbucket colle ce code dans la page de configuration de l'espace de travail du Capteur.
3. **Échange de clés** : le Capteur contacte le web trigger avec le code à usage unique. Le Cerveau valide le code, génère un secret partagé fort (256 bits), l'enregistre côté Jira et le renvoie au Capteur via un canal sécurisé. Les deux apps stockent ce secret dans le stockage de secrets sécurisé de Forge (`kvs` / secret store chiffré).

### 2.2 Signature des requêtes d'évaluation
Chaque requête envoyée par le Capteur contient les en-têtes HTTP suivants :
- `X-MAC-Timestamp` : horodatage ISO-8601 UTC de la requête.
- `X-MAC-Nonce` : UUID v4 unique généré à chaque appel.
- `X-MAC-Signature` : empreinte hexadécimale calculée par `HMAC-SHA256(secret, payload_bytes + "." + timestamp + "." + nonce)`.

### 2.3 Vérification et protection anti-rejeu
À la réception sur le Cerveau :
1. **Fenêtre temporelle (5 minutes)** : si `|now - timestamp| > 300 s`, la requête est rejetée immédiatement (HTTP 401).
2. **Anti-rejeu** : le nonce est vérifié contre les nonces récents stockés en mémoire / cache temporaire. Si le nonce a déjà été consommé, la requête est rejetée.
3. **Validation cryptographique** : le Cerveau recalcule l'empreinte HMAC avec le secret partagé stocké. Si la signature ne correspond pas, la requête est rejetée.
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

- **Mise à jour proactive par événements (Forge Triggers)** : le Cerveau écoute les webhooks internes Jira (`jira:issue_updated`, `jira:issue_created`). Dès qu'un ticket change de statut ou que ses critères d'acceptation sont cochés, la table `issue_cache` est rafraîchie en tâche de fond.
- **Cache rafraîchi à 60 secondes** : lors d'une évaluation de merge check, le Cerveau lit en priorité `issue_cache`. Il n'effectue un appel REST direct vers l'API Jira que si l'enregistrement a plus de 60 secondes ou est absent.
- **Données locales en base SQL** : les tables `freeze`, `rule_config`, `waiver` et `repo_service` résident directement dans Forge SQL, garantissant des temps de lecture inférieurs à 50 millisecondes.

---

## 5. Politique de repli (Fallback)

Si le Cerveau est injoignable (timeout réseau, panne d'infrastructure, web trigger indisponible) :

- **Mode Ouvert (`open` - défaut)** : le contrôle Bitbucket renvoie `success: true` accompagné du message d'avertissement : `« Contexte indisponible, contrôle non concluant »`. Le flux des développeurs n'est pas interrompu pour les dépôts standards.
- **Mode Fermé (`closed`)** : le contrôle Bitbucket renvoie `success: false`. La fusion est strictement bloquée jusqu'au rétablissement de la communication avec le Cerveau. Recommandé pour les dépôts critiques ou soumis à des exigences de conformité réglementaire.
- **Traçabilité** : tout déclenchement de la politique de repli est consigné localement dans le stockage Capteur et transmis au Cerveau dès la reprise du lien.

---

## 6. Modèle de données (Forge SQL - Cerveau)

Le stockage persistant repose sur Forge SQL côté Jira et s'articule autour de 8 tables :

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

Le dépôt adopte une structure modulaire séparant le contrat partagé, les applications Forge et l'outillage :

```
merge-avec-contexte/
├── shared/                   # Contrat unique et logique pure partagée
│   ├── src/
│   │   ├── types.ts          # Définitions TypeScript (verdicts, requêtes, tables)
│   │   ├── rules/            # Logique fonctionnelle des règles R-01 à R-07
│   │   ├── crypto/           # Calcul et vérification HMAC-SHA256, format de signature
│   │   └── message.ts        # Formateur de message Bitbucket conforme au §9
│   └── test/                 # Tests unitaires Vitest de la logique pure
├── capteur/                  # Application Forge Bitbucket
│   ├── manifest.yml          # Modules bitbucket:mergeCheck, carte de PR, réglages
│   ├── src/
│   │   ├── index.ts          # Point d'entrée runCheck et handlers UI
│   │   ├── bitbucket-api.ts  # Adaptateur REST Bitbucket
│   │   ├── bridge-client.ts  # Client d'appel sécurisé vers le web trigger
│   │   └── shared/           # Copie synchronisée depuis shared/
│   └── test/                 # Tests d'intégration et mocks adaptateurs Capteur
├── cerveau/                  # Application Forge Jira
│   ├── manifest.yml          # Modules webtrigger, rovo:agent, rovo:mcp, sql, settings
│   ├── src/
│   │   ├── index.ts          # Handler handleBridge et handlers UI
│   │   ├── engine.ts         # Orchestrateur d'évaluation des règles
│   │   ├── jira-api.ts       # Adaptateur REST Jira et JSM
│   │   ├── db.ts             # Adaptateur d'accès Forge SQL
│   │   ├── mcp/              # Implémentation des 5 outils rovo:mcp
│   │   └── shared/           # Copie synchronisée depuis shared/
│   └── test/                 # Tests moteur d'évaluation, SQL et MCP
├── docs/                     # Documentation d'architecture, juges, recette, vidéo
└── tools/
    └── sync-shared.sh        # Script de recopie stricte de shared/ vers capteur et cerveau
```

---

## 8. Frontière testable : logique pure contre adaptateurs fins

Pour garantir une testabilité maximale et une exécution ultra-rapide en intégration continue (CI < 5 minutes) :

1. **Logique pure (sans import Forge)** :
   - Tous les calculs de règles (`evaluateRule()`), la détection des clés, la construction des messages formatés et le calcul cryptographique HMAC sont implémentés dans `shared/src/` sans dépendance vers `@forge/api`, `@forge/bridge` ou le runtime Atlassian.
   - Cette logique est exécutée directement avec Vitest / Node.js standard en quelques millisecondes.
2. **Adaptateurs fins isolés** :
   - Les appels spécifiques (`kvs`, `sql.query`, `asApp().requestJira`, `asUser().requestBitbucket`) sont confinés dans des classes d'adaptateurs légères (`jira-api.ts`, `bitbucket-api.ts`, `db.ts`).
   - En environnement de test, ces adaptateurs sont remplacés par des doubles de test en mémoire (in-memory test doubles), permettant de tester 100 % des flux de décision sans provisionner d'infrastructure distante.
