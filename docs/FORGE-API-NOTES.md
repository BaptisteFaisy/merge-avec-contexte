# Référence des modules et API Forge — « Merge avec contexte »

Ce document consolide les quatre notes de recherche menées sur la référence Atlassian Forge
en une source de vérité unique pour les développeurs et les juges du projet.

---

## 1. Ce qui est confirmé (par module)

### 1.1 `bitbucket:mergeCheck`
- **Clé exacte** : `bitbucket:mergeCheck`
- **Propriétés obligatoires** : `key` (regex `^[a-zA-Z0-9_-]+$`), `name` (string ou objet i18n),
  `triggers` (tableau non vide), et `function` (si pas de `endpoint` Forge Remote).
- **Triggers reconnus** : `on-code-pushed` (nouveaux commits sur la source),
  `on-reviewer-status-changed` (Approved / Changes Requested), `on-merge` (tentative de fusion).
- **Payload d'invocation** : `{ workspace: { uuid }, repository: { uuid }, pullrequest: { id }, trigger: { type }, mergeProperties?: { commitMessage, commitMessageTruncated, mergeStrategy, closeSourceBranch } }`. Note : `mergeProperties` n'est présent que pour `on-merge`.
- **Réponse attendue** : `{ success: boolean, message?: string }`.
  Toute exception levée par la fonction vaut échec du contrôle (merge bloqué si Required).
  Le résultat est persisté par la plateforme Forge ; l'utilisateur peut relancer un échec.
- **Scopes** : `read:pullrequest:bitbucket` obligatoire pour s'abonner aux triggers et lire la PR.

### 1.2 `bitbucket:repoPullRequestCard`
- **Clé exacte** : `bitbucket:repoPullRequestCard` (carte latérale droite sur la vue PR).
- **Propriétés obligatoires** : `key`, `title` (string ou i18n). Si UI Kit moderne : `resource`
  (clé de ressource statique), `render: native` et `resolver: { function: <key> }`.
- **Payload d'invocation (resolver)** : `context.extension` contient `type`, `location`,
  `repository: { uuid }` (avec accolades `{}`), `pullRequest: { id }`.
  Pour les API Forge n'acceptant pas les accolades (KVS), utiliser `unwrapUuid` / `wrapUuid`.
- **Réponse attendue** : retour libre du resolver transmis à l'UI via `invoke` / UI Kit.
- **Scopes** : aucun déclaré par le module ; `read:pullrequest:bitbucket` pour relire la PR.

### 1.3 `bitbucket:repoPullRequestOverviewPanel`
- **Clé exacte** : `bitbucket:repoPullRequestOverviewPanel` (panneau dépliable dans l'onglet Overview).
- **Propriétés obligatoires** : `key`, `title` (string ou i18n). Pour UI Kit : `resource`, `render: native`, `resolver`.
- **Payload d'invocation (resolver)** : identique à `repoPullRequestCard` (`repository.uuid`, `pullRequest.id`, `location`).
- **Réponse attendue** : retour libre du resolver destiné au composant UI.
- **Scopes** : `read:pullrequest:bitbucket`.

### 1.4 `bitbucket:workspaceSettingsMenuPage`
- **Clé exacte** : `bitbucket:workspaceSettingsMenuPage` (entrée de menu réglages du workspace).
- **Propriétés obligatoires** : `key`, `title` (string ou i18n). Pour UI Kit : `resource`, `render: native`, `resolver`.
- **URL documentée** : `/{workspaceSlug}/workspace/settings/forge/{forgeAppId}/{forgeEnvironmentKey}/{forgeAppModuleKey}`.
- **Payload d'invocation (resolver)** : `{ type, workspace: { uuid }, location }`.
- **Réponse attendue** : retour libre du resolver pour les écrans de configuration.
- **Scopes** : `read:workspace:bitbucket`, `read:repository:bitbucket`.

### 1.5 `webtrigger`
- **Clé exacte** : `webtrigger` (invoque une fonction sur requête HTTP entrante).
- **Propriétés obligatoires** : `key`, `function` (si pas de endpoint).
  Options recommandées : `urlFormat: v2` (domaine d'installation `*.webtrigger.atlassian.app`),
  `response: { type: dynamic }` (ou `static` avec `outputs`).
- **Payload d'invocation** : `payload: WebTriggerRequest` avec `body: string`,
  `headers: Record<string, string[]>`, `method: string`, `path: string`, `userPath: string`,
  `queryParameters: Record<string, string[]>`.
- **Réponse attendue** : `WebTriggerResponse` avec `statusCode: number` (obligatoire),
  `headers?: Record<string, string[]>`, `body?: string`, `statusText?: string`. Si incompatible : HTTP 500.
- **Authentification & limites** : aucune authentification native Forge ; `asUser()` est
  strictement indisponible (aucun utilisateur Atlassian associé). Authentification obligatoire
  par le code (HMAC-SHA256, horodatage, nonce anti-rejeu). Temps d'exécution max : 55 secondes.
- **Scopes** : aucun scope OAuth requis par le module en lui-même.

### 1.6 `jira:projectSettingsPage`
- **Clé exacte** : `jira:projectSettingsPage` (barre latérale des réglages de projet Jira et JSM).
- **Propriétés obligatoires** : `key`, `title`. Pour UI Kit : `resource`, `render: native`, `resolver`.
- **URL** : `/jira/software/projects/{projectKey}/settings/apps/{appId}/{envId}`.
- **Payload d'invocation** : `project: { id, key, type }`, `location` via `useProductContext`.
- **Réponse attendue** : retour libre du resolver vers le composant UI.
- **Scopes** : le module lui-même n'en documente aucun ; ils dépendent des appels REST
  effectués (`read:jira-work` pour lire, `manage:jira-project` / `manage:jira-configuration`
  pour écrire les réglages).

### 1.7 `jira:issueContext`
- **Clé exacte** : `jira:issueContext` (panneau repliable sous les champs, barre latérale droite de la nouvelle vue ticket Jira).
- **Propriétés obligatoires** : `key`, `title`, `label` (texte du bouton d'ouverture). Pour UI Kit : `resource`, `render: native`, `resolver`.
- **Propriétés optionnelles** : `status: { type: 'badge'|'lozenge'|'icon', value: { label, type? } }`, `dynamicProperties: { function: <key> }`.
- **Payload d'invocation** : `useProductContext` expose `issue: { id, key, type, typeId }`, `project: { id, key, type }`, `location`.
- **Événements front-end** : `events.on('JIRA_ISSUE_CHANGED', cb)` via `@forge/bridge`.
- **Réponse attendue** : retour libre du resolver ; si dynamicProperties : `{ status: { type, value } }`.
- **Scopes** : `read:jira-work` pour relire le ticket depuis le resolver.

### 1.8 `jira:projectPage`
- **Clé exacte** : `jira:projectPage` (onglet horizontal de projet Jira / navigation gauche JSM).
- **Propriétés obligatoires** : `key`, `title`. Pour UI Kit : `resource`, `render: native`, `resolver`.
- **Payload d'invocation** : `project: { id, key, type }`, `board: { id, type }` (Jira Software), `location`.
- **Réponse attendue** : retour libre du resolver pour la console et le journal.
- **Scopes** : `read:jira-work`.

### 1.9 `action`
- **Clé exacte** : `action` (déclaré à la racine de `modules:`, pas sous `rovo:`).
- **Propriétés obligatoires** : `key` (< 64 caractères si exposé en MCP), `name` (≤ 30 caractères),
  `actionVerb` (`GET`, `CREATE`, `UPDATE`, `DELETE`, `TRIGGER`), `description`,
  `function` (ou `endpoint`), `inputs: { <nom>: { title, type, required, description } }`.
- **Restrictions** : un agent déclenché par une règle Automation n'invoquera jamais une action dont l'actionVerb est CREATE, UPDATE, DELETE ou TRIGGER. Taille max de payload : 5 Mo.
- **Payload d'invocation** : `(payload, context)` où payload contient les inputs validés et context fournit `cloudId`, `moduleKey`, `accountId`, et le contexte Jira (`jira.issueKey`, etc.).
- **Réponse attendue** : chaîne de caractères ou objet JSON libre (interprété par le LLM).
- **Scopes** : `read:jira-work`, `read:chat:rovo` (pour les agents créés par les clients).

### 1.10 `rovo:agent`
- **Clé exacte** : `rovo:agent` (agent IA conversationnel intégré).
- **Propriétés obligatoires** : `key`, `name` (≤ 30 caractères), `prompt` (texte brut ou `resource:<key>;<chemin>`).
- **Propriétés optionnelles** : `description`, `icon`, `conversationStarters` (liste de chaînes),
  `actions` (liste de clés de modules `action`), `skills`, `followUpPrompt`.
- **Contrainte** : pas de clé `tools` sur ce module (les outils s'appellent `actions`). Accès restreint aux données du site où l'app est installée. Examen de sécurité opéré par Atlassian.
- **Scopes** : `read:chat:rovo` si réutilisé, scopes des actions invoquées.

### 1.11 `rovo:mcp`
- **Clé exacte** : `rovo:mcp` (serveur Model Context Protocol exposant les actions, Preview).
- **Contrainte cardinale** : au plus **un seul** module `rovo:mcp` par application.
- **Propriétés obligatoires** : `key`, `name` (≤ 30 caractères), `tools` (liste de clés de modules `action`, max 50, chacune < 64 caractères).
- **Endpoint exposé** : `https://mcp.atlassian.com/forge/<appId>` (authentification OAuth 2.1).
  L'exposition externe tiers est désactivée par défaut (activation par l'administrateur de site).
- **Scopes** : scopes des actions exposées.

### 1.12 `trigger`
- **Clé exacte** : `trigger` (réaction asynchrone aux événements Atlassian).
- **Propriétés obligatoires** : `key`, `events` (liste d'événements), `function` (ou `endpoint`).
- **Filtres optionnels** : `filter: { ignoreSelf: boolean, appIsLicensed: boolean, expression: string, onError: enum }`.
- **Latence plateforme** : l'acheminement des événements peut prendre jusqu'à **3 minutes** (file asynchrone Atlassian).
- **Scopes** : `read:jira-work` pour `avi:jira:created:issue` / `avi:jira:updated:issue`.

### 1.13 `scheduledTrigger`
- **Clé exacte** : `scheduledTrigger` (déclencheur périodique sans contexte utilisateur).
- **Propriétés obligatoires** : `key`, `function`, `interval` (`fiveMinute`, `hour`, `day`, `week`).
- **Limites** : max 5 par app. Timeout par défaut 55 s (extensible à 900 s via `timeoutSeconds` sur la fonction).
  Exécution distribuée par installation dans la fenêtre d'intervalle.
- **Scopes** : aucun contexte utilisateur (`asUser` impossible).

### 1.14 `sql`
- **Clé exacte** : `sql` (active Forge SQL, base MySQL/TiDB hébergée par installation).
- **Contrainte cardinale** : au plus **un seul** module `sql` par application.
- **Propriétés obligatoires** : `key`, `engine: mysql` (seule valeur supportée).
- **Effet sur le cycle de vie** : l'ajout du module déclenche une montée en version majeure et
  le consentement des administrateurs des installations existantes. Non supporté sur Atlassian
  Government Cloud.
- **Scopes** : aucun scope OAuth additionnel (accès base géré par la plateforme Forge).

---

## 2. Extraits de manifeste minimaux et fonctionnels

### 2.1 Capteur (`capteur/manifest.yml`)

Structure reprise du dépôt ; les valeurs sont celles du manifeste réel.

```yaml
app:
  id: ari:cloud:ecosystem::app/<uuid-renseigne-par-forge-register>
  runtime:
    name: nodejs22.x
modules:
  bitbucket:mergeCheck:
    - key: merge-avec-contexte-check
      name: Merge avec contexte
      description: Verifie le ticket lie, les gels et les incidents avant la fusion.
      function: merge-check
      triggers: [on-code-pushed, on-reviewer-status-changed, on-merge]
  bitbucket:repoPullRequestCard:
    - key: pr-context-card
      title: Merge avec contexte
      resource: pr-card
      render: native
      resolver: { function: resolver-pr-card }
  bitbucket:repoPullRequestOverviewPanel:
    - key: pr-context-panel
      title: Merge avec contexte
      resource: pr-panel
      render: native
      resolver: { function: resolver-pr-panel }
  bitbucket:workspaceSettingsMenuPage:
    - key: workspace-settings
      title: Merge avec contexte
      resource: workspace-settings
      render: native
      resolver: { function: resolver-workspace-settings }
resources:
  - { key: pr-card, path: src/frontend/pr-card.jsx }
  - { key: pr-panel, path: src/frontend/pr-panel.jsx }
  - { key: workspace-settings, path: src/frontend/workspace-settings.jsx }
function:
  - { key: merge-check, handler: index.runCheck }
  - { key: resolver-pr-card, handler: index.resolverPrCard }
  - { key: resolver-pr-panel, handler: index.resolverPrPanel }
  - { key: resolver-workspace-settings, handler: index.resolverWorkspaceSettings }
permissions:
  scopes:
    - read:pullrequest:bitbucket   # requis par bitbucket:mergeCheck
    - read:repository:bitbucket
    - storage:app                  # requis par le KVS (secret de jumelage)
  external:
    fetch:
      backend:
        - '*.webtrigger.atlassian.app'   # sortie vers le pont du Cerveau
```

### 2.2 Cerveau (`cerveau/manifest.yml`)

```yaml
app:
  id: ari:cloud:ecosystem::app/<uuid-renseigne-par-forge-register>
  runtime:
    name: nodejs22.x
modules:
  webtrigger:                       # le pont signe, seule entree du Capteur
    - key: pont-bitbucket
      function: gererPont
      urlFormat: v2
      response: { type: dynamic }
  jira:projectSettingsPage:
    - key: reglages-projet
      title: Merge avec contexte
      resource: reglages-projet
      render: native
      resolver: { function: resolver-reglages }
  jira:issueContext:                # title est obligatoire : voir Ecarts n.1
    - key: encart-ticket
      label: Merge avec contexte
      resource: encart-ticket
      render: native
      resolver: { function: resolver-encart }
  jira:projectPage:
    - key: console-journal
      title: Merge avec contexte — console et journal
      resource: console-journal
      render: native
      resolver: { function: resolver-console }
  action:                           # une entree par action ; 5 dans le depot
    - key: evaluate-merge
      name: Evaluer une fusion      # name <= 30 caracteres
      function: evaluateMerge
      actionVerb: GET               # GET | CREATE | UPDATE | DELETE | TRIGGER
      description: Evaluation a blanc des regles de contexte pour un ticket.
      inputs:
        issueKey: { title: Cle du ticket, type: string, required: true }
        targetBranch: { title: Branche cible, type: string, required: false }
  rovo:agent:
    - key: agent-merge-contexte
      name: Merge avec contexte
      prompt: |
        Tu reponds aux questions sur les fusions et leur contexte : ticket lie,
        criteres d'acceptation, gels, incidents. Tu t'appuies toujours sur les
        actions fournies, jamais sur une supposition.
      conversationStarters:
        - Pourquoi la PR de PAY-123 est-elle bloquee ?
      actions: [evaluate-merge]     # cles de modules action (pas de tools ici)
  rovo:mcp:                         # un seul module par app
    - key: cerebro-mcp
      name: Merge avec contexte
      tools: [evaluate-merge]       # cles d'actions, 50 au plus
  trigger:
    - key: ticket-modifie
      function: surTicketModifie
      events: [avi:jira:created:issue, avi:jira:updated:issue]
      filter: { ignoreSelf: true }
  scheduledTrigger:
    - key: migrations-schema
      function: migrerSchema
      interval: hour                # fiveMinute | hour | day | week
  sql:
    - key: main
      engine: mysql
resources:
  - { key: reglages-projet, path: src/frontend/reglages-projet.jsx }
  - { key: encart-ticket, path: src/frontend/encart-ticket.jsx }
  - { key: console-journal, path: src/frontend/console-journal.jsx }
function:
  - { key: gererPont, handler: index.gererPont }
  - { key: resolver-reglages, handler: index.resolverReglages }
  - { key: resolver-encart, handler: index.resolverEncart }
  - { key: resolver-console, handler: index.resolverConsole }
  - { key: evaluateMerge, handler: index.evaluateMerge }
  - { key: surTicketModifie, handler: index.surTicketModifie }
  - { key: migrerSchema, handler: index.migrerSchema }
permissions:
  scopes:
    - read:jira-work
    - write:jira-work
    - manage:jira-configuration
    - read:chat:rovo                # actions utilisables par des agents clients
    - storage:app
  external:
    fetch:
      backend:
        - '*.atlassian.net'         # voir Ecarts n.6
```

---

## 3. Runtime

### 3.1 `asApp()` vs `asUser()`
- `api.asApp()` : exécute l'appel avec l'identité et les scopes de l'application (« app bot »). Indispensable dans le merge check et dans les web triggers.
- `api.asUser()` : exécute l'appel au nom de l'utilisateur connecté. Disponible uniquement dans les contextes avec session utilisateur (UI Kit / Custom UI).
- **Règle absolue** : `asUser()` est **strictement interdit** dans un `webtrigger` (aucun utilisateur Atlassian associé à l'appel entrant, exception immédiate).

### 3.2 Appels API : `requestJira` et `requestBitbucket`
```javascript
import api, { route, routeFromAbsolute } from '@forge/api';

// Jira (ex: lecture d'un ticket)
const resJira = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}`);

// Bitbucket (attention critique : workspaceId UUID, PAS le slug du workspace)
// L'extension context fournit repository.uuid ({...}) mais workspaceId doit venir de useProductContext
const resBb = await api.asApp().requestBitbucket(
  route`/2.0/repositories/${workspaceUuid}/${repoSlug}/pullrequests/${prId}`
);

// Pagination via liens absolus href
const nextRes = await api.asApp().requestBitbucket(routeFromAbsolute(firstPage.next));
```
Le template tag `route` est obligatoire : il encode les paramètres et bloque les injections de chemin (`../`).

### 3.3 Adresse publique du pont : `webTrigger.getUrl`
Il n'existe pas de `Forge.getURL()`. L'API officielle de `@forge/api` est :
```javascript
import { webTrigger } from '@forge/api';
const urlPont = await webTrigger.getUrl('pont-bitbucket');
```
L'URL retournée est stable pour une installation et un environnement donnés (`https://<installId>.webtrigger.atlassian.app/public/<token>`).

### 3.4 Contexte UI et communication bridge
- Dans le frontend UI Kit : hook `useProductContext()` de `@forge/react` (fournit `cloudId`, `workspaceId`, `extension`, `moduleKey`).
- Appel frontend vers backend : `invoke` de `@forge/bridge`.
```javascript
import { invoke } from '@forge/bridge';
const data = await invoke('evaluateMerge', { issueKey: 'PAY-123' });
```
- Côté backend (resolver) : `@forge/resolver` avec `resolver.define(key, handler)` et export de `resolver.getDefinitions()`.

---

## 4. Forge SQL

- **Module** : `sql` avec `engine: mysql` (compatible TiDB/ANSI SQL, base dédiée par installation).
- **Client** : `@forge/sql`.
  - DML (requêtes préparées anti-injection obligatoires via `?`) :
    ```javascript
    import sql, { UpdateQueryResponse } from '@forge/sql';
    const result = await sql.prepare<City>(`SELECT * FROM cities WHERE name = ?`)
      .bindParams('Paris').execute();
    ```
    *Attention* : il n'existe **aucun** tagged template `sql\`...\`` documenté par Atlassian.
  - DDL (schéma et tables) : exécuté via `migrationRunner` dans un déclencheur hors requête :
    ```javascript
    import { migrationRunner } from '@forge/sql';
    const migrations = migrationRunner
      .enqueue('v001_initial', `CREATE TABLE IF NOT EXISTS regles (...)`);
    await migrations.run();
    ```
- **Bonnes pratiques DDL** : idempotent (`CREATE TABLE IF NOT EXISTS`), **bannir `AUTO_INCREMENT`** (provoque des points chauds TiDB ; préférer `AUTO_RANDOM(S,R)` ou des UUID en `BINARY(16)`), pas de clés étrangères (les JOIN fonctionnent, pas les cascades DELETE).
- **Limites d'hébergement** :
  - Stockage : 1 Gio (production), 256 Mio (staging), 128 Mio (dev).
  - Plafonds : max 200 tables, 150 RPS en DML, 25 RPM en DDL, 6 Mio max par ligne.
  - Timeouts par connexion : SELECT 5 s, INSERT/UPDATE/DELETE 10 s, DDL 20 s.
  - Temps CPU cumulé : 62,5 secondes par minute pour l'ensemble des requêtes.

---

## 5. UI Kit 2

- **Paquet principal** : `@forge/react` (UI Kit moderne / UI Kit 2, rendu natif sans iframe).
- **Déclaration manifeste** : `render: native` et association via `resource: <key>` vers une entrée `resources:`.
- **Ressources** : chemin relatif vers le point d'entrée UI (ex. `src/frontend/index.jsx`). UI Kit n'accepte que des images comme ressources annexes (pas de HTML arbitraire).
- **Architecture Resolver** : `@forge/resolver` expose les fonctions serveur appelées par `invoke()` depuis les composants JSX.
- **Composants disponibles** (extraits représentatifs de `@forge/react`) :
  - *Primitives & mise en page* : `Box`, `Stack`, `Inline`, `Bleed`, `XCSS`.
  - *Saisie & boutons* : `Button`, `ButtonGroup`, `Form`, `TextField`, `TextArea`, `Select`, `Checkbox`, `RadioGroup`, `Toggle`, `DatePicker`.
  - *Restitution & alertes* : `Text`, `Heading`, `Code`, `CodeBlock`, `Badge`, `Lozenge`, `SectionMessage`, `Spinner`, `ProgressBar`, `EmptyState`, `DynamicTable`.
  - *Navigation & modales* : `Tabs`, `Modal`, `Popup`, `Link`.

---

## 6. Limites et inconnues (à valider par prototype — §15)

Points de la recherche restant **non confirmés** ou identifiés comme risques techniques :
1. **`resourceSlug`** : non documenté pour `bitbucket:mergeCheck` (hypothèse infirmée, ne pas utiliser).
2. **`index` comme propriété de module** : inexistant (c'est le fichier du handler `index.handler`).
3. **Payload de réponse des modules UI Bitbucket** (`repoPullRequestCard`, `repoPullRequestOverviewPanel`, `workspaceSettingsMenuPage`) : non documenté ; le resolver alimente directement l'arbre React UI Kit.
4. **Disponibilité des Global Apps pour Bitbucket** : annoncée en accès anticipé sans date ferme ; en attendant, la séparation stricte en deux applications jumelées via le pont signé reste la seule architecture viable.
5. **Contrôle de merge obligatoire** : requiert un plan **Bitbucket Premium** (sur Free/Standard, le merge check s'exécute et informe mais ne peut bloquer la fusion).
6. **`forge site provision`** : génère un environnement Jira, Confluence, JSM et Rovo, mais **n'inclut pas Bitbucket**. La recette du merge check exige un workspace Bitbucket réel.
7. **Longueur maximale du message de merge check** : non documentée par Atlassian ; par sécurité, formater un message court (≤ 2 motifs, ≤ 255 caractères) et renvoyer vers la carte de PR pour le détail.
8. **Durée maximale d'exécution d'un merge check Bitbucket** : non précisée dans la doc officielle (le web trigger est borné à 55 s). Viser un retour sous 5 secondes grâce aux caches locaux pour ne pas dégrader l'expérience utilisateur.

---

## 7. Écarts constatés avec les manifestes du dépôt

Les manifestes `capteur/manifest.yml` et `cerveau/manifest.yml` restent la référence : rien
ci-dessous ne les contredit, ce sont des points à arbitrer ou à corriger côté code.

1. **`jira:issueContext` sans `title`** : le dépôt ne déclare que `label: Merge avec contexte`.
   La référence officielle marque **`title` et `label` comme obligatoires** tous les deux
   (`title` s'affiche à côté du `label`). Le manifeste du dépôt devrait donc porter un `title`
   (chaîne ou objet i18n). À corriger avant le premier `forge deploy`.
2. **Propriété `resource` (singulier)** : plusieurs notes brutes de recherche écrivaient
   `resources:` comme propriété d'un module UI. La référence officielle confirme le singulier
   **`resource: <clé>`**, qui pointe vers une entrée de la liste racine `resources:`. Les
   manifestes du dépôt utilisent déjà la bonne forme ; les notes brutes étaient fautives.
3. **`@forge/storage` plutôt que `@forge/kvs`** : les trois `package.json` déclarent
   `@forge/storage: ^2.0.3`. Or le module `storage` historique ne reçoit plus d'évolutions
   depuis mars 2025 et la documentation renvoie les nouvelles applications vers `@forge/kvs`
   (avec `WhereConditions.beginsWith` à la place de `startsWith`). Le scope `storage:app`, lui,
   reste le bon dans les deux cas. À trancher avant d'écrire le premier accès clé/valeur.
4. **`react` absent des dépendances** : UI Kit attend `react@18` **et** `@forge/react` installés
   au niveau de l'application. Les écrans du Capteur font déjà
   `import { useEffect, useState } from 'react'`, mais aucun des deux `package.json` d'app ne
   déclare `react` (seulement `@forge/react: ^12.5.0`). `react` n'est présent qu'en dépendance
   transitive (18.3.1) dans le verrou racine, et `@forge/react` n'est pas installé à la racine.
   À déclarer explicitement avant le premier `forge deploy`.
5. **Points d'entrée UI Kit** : la référence attend un fichier d'entrée qui appelle
   `ForgeReconciler.render(<App />)`. Les six `src/frontend/*.jsx` du dépôt exportent un
   composant par défaut (`export default function …`) sans cet appel — les trois écrans du
   Capteur sont déjà implémentés, les trois du Cerveau sont encore des socles vides. Soit chaque
   ressource appelle `ForgeReconciler.render`, soit on passe par la propriété `entry` d'une
   ressource unique (points d'entrée multiples, Jira et Confluence seulement). À trancher par le
   lot UI : en l'état, le rendu natif n'est pas conforme à la convention documentée.
6. **Egress `*.atlassian.net` du Cerveau** : `requestJira` et `requestBitbucket` sont du trafic
   interne Atlassian et ne demandent aucune déclaration d'egress. L'entrée `'*.atlassian.net'`
   du Cerveau est donc probablement superflue (et un joker n'inclut pas le domaine parent).
   Celle du Capteur (`'*.webtrigger.atlassian.app'`) est en revanche bien nécessaire : c'est un
   appel sortant vers le pont.
7. **`actionVerb: CREATE` sur `request-waiver`** : conforme à la doc, mais les agents Rovo
   déclenchés par une règle Automation n'invoquent jamais une action `CREATE`, `UPDATE`,
   `DELETE` ou `TRIGGER`. La demande de dérogation ne sera donc pas automatisable depuis une
   règle d'automatisation — comportement attendu, à expliciter pour les juges.
8. **Migration de schéma par `scheduledTrigger`** : la référence recommande un consommateur
   d'événements asynchrones (`consumer` + `timeoutSeconds: 900`) pour rester sous la limite de
   25 DDL/min ; le dépôt a choisi le déclencheur horaire (timeout standard 55 s), qui reste
   documenté comme valide et dont Forge rejoue les DDL en échec chaque heure. Choix assumé, à
   surveiller si le schéma grossit.
9. **`docs/ARCHITECTURE.md` cite `bitbucket:pullRequestOverviewPanel`** : cette clé n'existe
   pas dans la référence Bitbucket ; la clé confirmée est
   **`bitbucket:repoPullRequestOverviewPanel`**, celle qu'utilise le manifeste du Capteur.
   Fichier hors du périmètre de cette PR, à corriger séparément.
10. **`forge site provision` et « Studio »** : la documentation du site de démonstration
    énumère Jira, Confluence, Jira Service Management et Rovo — « Studio » n'y figure pas. Le
    cahier des charges et `docs/JUDGES.md` le mentionnent : à confirmer sur un site réel.

## 8. Sources

https://developer.atlassian.com/platform/forge/manifest-reference/modules/bitbucket-merge-check/
https://developer.atlassian.com/platform/forge/manifest-reference/modules/bitbucket-repository-pull-request-card/
https://developer.atlassian.com/platform/forge/manifest-reference/modules/bitbucket-repository-pull-request-overview-panel/
https://developer.atlassian.com/platform/forge/manifest-reference/modules/bitbucket-workspace-settings-menu-page/
https://developer.atlassian.com/platform/forge/manifest-reference/modules/index-bitbucket/
https://developer.atlassian.com/platform/forge/events-reference/bitbucket/
https://developer.atlassian.com/platform/forge/apis-reference/fetch-api-product.requestbitbucket/
https://developer.atlassian.com/cloud/bitbucket/rest/intro/
https://developer.atlassian.com/platform/forge/manifest-reference/modules/web-trigger/
https://developer.atlassian.com/platform/forge/runtime-reference/web-trigger/
https://developer.atlassian.com/platform/forge/runtime-reference/web-trigger-api/
https://developer.atlassian.com/platform/forge/limits-invocation/
https://developer.atlassian.com/platform/forge/limits-web-trigger/
https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-agent/
https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-action/
https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-mcp/
https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-project-settings-page/
https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-issue-context/
https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-issue-panel/
https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-project-page/
https://developer.atlassian.com/platform/forge/manifest-reference/modules/trigger/
https://developer.atlassian.com/platform/forge/events-reference/jira/
https://developer.atlassian.com/platform/forge/manifest-reference/modules/scheduled-trigger/
https://developer.atlassian.com/platform/forge/manifest-reference/modules/sql/
https://developer.atlassian.com/platform/forge/storage-reference/sql/
https://developer.atlassian.com/platform/forge/storage-reference/sql-api/
https://developer.atlassian.com/platform/forge/storage-reference/sql-api-schema/
https://developer.atlassian.com/platform/forge/storage-reference/sql-query-policy/
https://developer.atlassian.com/platform/forge/storage-reference/kvs/
https://developer.atlassian.com/platform/forge/apis-reference/fetch-api-product.requestjira/
https://developer.atlassian.com/platform/forge/apis-reference/fetch-api-product.requestgraph/
https://developer.atlassian.com/platform/forge/ui-kit/overview/
https://developer.atlassian.com/platform/forge/ui-kit/components/
https://developer.atlassian.com/platform/forge/ui-kit/hooks/use-product-context/
https://developer.atlassian.com/platform/forge/apis-reference/ui-api-bridge/bridge/
https://developer.atlassian.com/platform/forge/apis-reference/ui-api-bridge/invoke/
https://developer.atlassian.com/platform/forge/runtime-reference/forge-resolver/
https://developer.atlassian.com/platform/forge/manifest-reference/permissions/
https://developer.atlassian.com/platform/forge/manifest-reference/scopes-forge/
https://developer.atlassian.com/platform/forge/manifest-reference/scopes-product-bitbucket/
https://developer.atlassian.com/platform/forge/manifest-reference/scopes-product-jira/
https://developer.atlassian.com/platform/forge/manifest-reference/scopes-product-jsm/
https://developer.atlassian.com/platform/forge/runtime-egress-permissions/
https://developer.atlassian.com/platform/forge/provision-a-demo-development-site/
