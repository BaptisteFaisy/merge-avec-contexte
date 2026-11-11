# Dossier de soumission — Codegeist 2026

> Backlog d'audit : **item 5** (préparer la soumission) et la partie rédactionnelle des
> items **34** (activation des merge checks personnalisés côté espace de travail) et **39**
> (dire explicitement dans la fiche que le contrôle bloquant exige Bitbucket Premium).
>
> **Mode d'emploi** : tout ce qui est dans un bloc ` ``` ` marqué *(EN — copier)* se colle
> tel quel dans Devpost ou dans la console développeur Marketplace. Les notes en français
> sont des commentaires de travail : **ne pas les copier**.
>
> **Vidéo hors périmètre** : le scénario existe déjà (`docs/VIDEO-SCRIPT.md`), il n'est ni
> réécrit ni inventé ici. Un emplacement réservé est prévu (Devpost, §B.9).
>
> **Captures** : résumé en §D, check-list exploitable dans `docs/CAPTURES.md`, fichiers dans
> `docs/img/` (convention de nommage : `docs/img/LISEZ-MOI.md`).
>
> **Tout a été vérifié contre le dépôt le 2026-11-11** (§0). Le nombre de tests cité est
> celui mesuré (`npx vitest run`), pas celui d'un document plus ancien.

## 0. Repères vérifiés (à re-vérifier si le dépôt change)

| Fait | Valeur vérifiée | Source |
|---|---|---|
| Tests | **496 tests verts, 39 fichiers** (vitest, logique pure, aucun réseau) | `npx vitest run`, 2026-11-11 |
| Recette §18 | 9 scénarios (`recette 1` … `recette 9`), verts et rejoués contre l'app déployée | `cerveau/test/recette.test.ts`, `docs/RECETTE.md`, `docs/DEMO-E2E.md` |
| Règles | 13 règles R-01 … R-13, avec niveau par défaut et paramètres | `shared/src/rules/catalog.ts` |
| Pont signé | 6 routes ; HMAC-SHA256 + horodatage + nonce ; fenêtre de 5 min ; rejeu rejeté | `shared/src/bridge/`, `docs/ARCHITECTURE.md` §2 |
| Latence mesurée (production) | médiane 0,57 s · p95 0,83 s · max 1,10 s ; à froid 6,4 s (8 migrations comprises) | `docs/ETAT.md` |
| Cerveau (Jira) | id `ari:cloud:ecosystem::app/8361630d-9d57-4099-9c2b-5201bb00648d` · dev 2.2.0 · prod 2.0.0 · installé sur `one-atlas-cndz.atlassian.net` | `docs/ETAT.md` |
| Capteur (Bitbucket) | id `ari:cloud:ecosystem::app/0777c25e-2be7-44fc-aa99-6d82fd3789c1` · dev 2.1.0 · prod 2.0.0 · **non installé** (aucun espace de travail disponible) | `docs/ETAT.md` |
| Volume de code | ~12 900 lignes TS/JSX (hors copies générées du contrat) · 48 commits · 40 PR mergées par la file Mergify | `git`, `docs/ETAT.md` |
| Licence | Apache-2.0 | `LICENSE` |
| Échéance | mardi 2026-12-22, 21 h (Paris) — <https://codegeist2026.devpost.com> | cahier des charges |

**Limites assumées, à répéter dans la fiche et sur Devpost** (audit n°39) :
le merge check du Capteur **n'a encore jamais été exécuté par la plateforme Bitbucket**
(aucun espace de travail — n°3) ; les six écrans **n'ont jamais été vérifiés visuellement**
dans un navigateur (n°4) ; l'agent Rovo et les six outils MCP **n'ont jamais été interrogés
depuis un vrai client** (n°41, n°42) ; un contrôle **bloquant** exige l'offre **Premium** de
Bitbucket, et l'activation des merge checks personnalisés côté espace de travail n'a jamais
été faite (n°34).

---

## A. Fiche Marketplace des deux apps

Les deux apps sont **jumelées** : le Capteur (Bitbucket) reçoit le contrôle, le Cerveau
(Jira) décide. Chaque fiche se colle dans la console développeur de l'app correspondante
(onboarding → *Distribution* → *Create listing*).

### A.1 Cerveau (Jira)

**Nom de l'app** — `Merge avec contexte Cerveau`
**Accroche (une phrase)** — *The Jira-side brain of a merge guard that checks the work, not just the code.*

**Description courte (≤ 80 mots)**

```text
Merge avec contexte Cerveau is the Jira-side half of a merge guard that checks the work, not just the code. It evaluates thirteen context rules — linked issue status, acceptance criteria, deployment freezes, open JSM incidents, blocking links, released versions — and answers Bitbucket merge checks over an HMAC-SHA256-signed bridge. It also ships a test console, an issue panel, an evaluation log, a Rovo agent and six MCP tools. No source code is ever read or stored. Pair it with the Capteur app on Bitbucket.
```

**Description longue structurée**

```text
THE PROBLEM
Every pre-merge check judges the code: green build, approvals, resolved tasks. None of them knows that the linked Jira issue still has two unchecked acceptance criteria, that a deployment freeze starts in an hour, or that an incident is open on the service the pull request touches. That context lives in Jira and Jira Service Management — and the person clicking Merge never sees it. Teams compensate with oral rules nobody can enforce or trace ("we don't merge on Fridays").

THE SOLUTION
Merge avec contexte Cerveau is the Jira-side app of a two-app merge guard. It evaluates thirteen context rules against every pull request, applies the waivers your team granted, and returns a verdict, the reasons, and the way out. It answers the Bitbucket merge check over a signed bridge, and it exposes the same engine to humans and to agents: a test console inside Jira (evaluate a pull request without a Bitbucket workspace), an issue panel showing the pull requests and the last evaluation of a ticket, an evaluation log, a Rovo agent and six MCP tools. Repository-to-service mapping and team ownership are resolved from the administrator's table first, and completed from the Atlassian Teamwork Graph when the table has no answer.

THE THIRTEEN RULES (default level)
R-01  The pull request is linked to an existing Jira issue — warning
R-02  The issue is in an allowed status — blocking
R-03  Acceptance criteria are met — blocking
R-04  No active freeze on the target branch — blocking
R-05  No open incident on the affected service — blocking
R-06  The issue is not blocked by an open issue — blocking
R-07  The issue target version is not already released — warning
R-08  Quiet hours: no merge into the main branch outside the window — warning
R-09  Security review approved when the issue requires it — blocking
R-10  A member of the service owner team approved — warning
R-11  The pull request references no issue other than its own — information
R-12  Sensitive files: a rollback plan is attached to the issue — warning
R-13  Upstream dependencies are delivered — warning
Every rule has its own level (blocking, warning, information), its own scope (repositories, branches) and its own mode (active, observation, disabled). In observation mode the rule is evaluated and logged but never shown nor enforced, so a team can measure "31 of the last 212 merges would have been blocked" before turning it on.

THE SIGNED BRIDGE
A single Atlassian Forge app cannot hold both Bitbucket and Jira permissions, so the product ships as two paired apps. They talk through a web trigger that has no native authentication: every request therefore carries an HMAC-SHA256 signature over a canonical string (protocol version, millisecond timestamp, UUID nonce, SHA-256 of the body), is rejected if the clock skew exceeds five minutes, and is rejected if the nonce was already seen. The two apps are paired once with a single-use code valid for ten minutes; both sides then hold a 256-bit shared secret in Forge's encrypted secret storage — the database keeps a reference only — and re-pairing rotates the secret and revokes the old one.

WHAT THIS APP NEVER DOES
It never reads, transmits or stores a single line of source code. The bridge carries pull-request metadata only (branch names, title, commit messages, reviewers, changed file paths — and even the paths can be switched off in the workspace settings). No telemetry, no third-party service, no data leaves the Atlassian Cloud site it is installed on.

REQUIREMENTS AND HONEST LIMITATIONS
A Jira Cloud site (Jira Service Management recommended for the incident rule). Pair it with the Capteur app on Bitbucket. Making the check blocking requires the Bitbucket Premium plan: on other plans the check runs, shows the same verdict and the same message, but informs instead of preventing the merge. The apps are built for the Codegeist 2026 hackathon and are published under the Apache-2.0 licence, source included.
```

**Catégorie** — *Developer Tools* (à confirmer dans la liste de la console) ;
secondaire possible *Service Management* (règle d'incident).
**Langues** — interface et messages : **anglais et français** (chaque message existe dans les
deux langues ; la langue suit la configuration de l'app).
**Prix** — **Gratuit** (Forge, quotas free inclus).
**Niveau de support** — support communautaire, *best effort*, sans SLA : tickets GitHub sur
`https://github.com/BaptisteFaisy/merge-avec-contexte/issues`. Pas de support payant.

### A.2 Capteur (Bitbucket)

**Nom de l'app** — `Merge avec contexte Capteur`
**Accroche (une phrase)** — *The Bitbucket-side merge check that asks "is the work ready?" before it lets a pull request through.*

**Description courte (≤ 80 mots)**

```text
Merge avec contexte Capteur is the Bitbucket-side half of a context-aware merge guard. Its merge check runs on push, on reviewer status change and on the merge attempt: it reads pull-request metadata, extracts Jira issue keys, and asks the paired Cerveau app on Jira — over an HMAC-SHA256-signed web trigger — whether the work is ready. The verdict explains every reason and how to unblock, and a pull-request card adds the detail and one-click waivers. No source code ever leaves Bitbucket.
```

**Description longue structurée**

```text
THE PROBLEM
Bitbucket's merge checks answer one question: is the code good enough? They cannot answer the questions that actually stop bad merges: is the linked ticket really ready, is this the right moment to ship, is the target service healthy, does this ticket wait on another one. That information sits in Jira and Jira Service Management. So the merge goes out, and the team finds out afterwards.

THE SOLUTION
Merge avec contexte Capteur installs a merge check in Bitbucket. On every push, on every reviewer status change and on the merge attempt itself, it reads the pull request (title, branches, commit messages, reviewers, changed paths), extracts the Jira issue keys, and asks the paired Cerveau app — over a signed bridge — to evaluate the thirteen context rules. The verdict comes back in the native merge-check list with a message that names the object, the reason and the action to take, never internal jargon. A card in the pull request's right column adds the detail, a link to the ticket and a "Request a waiver" button; a workspace settings page holds the pairing and the fallback policy.

WHY TWO APPS
A single Forge app cannot hold both Bitbucket and Jira scopes. Capteur therefore holds no durable product data at all: it stores the pairing (encrypted secret, bridge URL) and the fallback policy. The rules, freezes, waivers and log live on the Jira side.

THE SIGNED BRIDGE
The web trigger exposed by the Cerveau app has no native authentication, so every request is signed: HMAC-SHA256 over a canonical string (protocol version, millisecond timestamp, UUID nonce, SHA-256 of the body), compared in constant time, rejected beyond a five-minute clock skew, and rejected if the nonce was already consumed. Pairing happens once with a single-use code valid for ten minutes; both sides keep a 256-bit shared secret in Forge's encrypted secret storage. Re-pairing rotates the secret and revokes the previous one.

WHAT THIS APP NEVER DOES
It never reads, transmits or stores source code. Only pull-request metadata crosses the bridge, and sending the changed file paths can be disabled altogether in the workspace settings. Capteur stores no pull request, no diff and no comment.

REQUIREMENTS AND HONEST LIMITATIONS
A shared Bitbucket Cloud workspace (personal workspaces do not offer custom merge checks). A workspace administrator must enable custom merge checks and choose the target branches. Making the check blocking requires the Bitbucket Premium plan — on other plans the check runs and displays the same verdict and message, but informs instead of preventing the merge. If the paired Jira app is unreachable, the fallback policy chosen in advance applies (open by default: the check passes with "context unavailable"; closed: the check fails).
```

**Catégorie** — *Developer Tools*.
**Langues** — **anglais et français**.
**Prix** — **Gratuit**.
**Niveau de support** — support communautaire, *best effort*, sans SLA (tickets GitHub).

### A.3 Politique de confidentialité (texte rédigé, à coller dans les deux fiches)

```text
DATA WE PROCESS
This app processes metadata only. It never reads, transmits or stores source code, diffs or file contents. Jira side: issue keys, issue status, acceptance-criteria checkboxes, issue links, fix versions and components read from Jira and Jira Service Management; the status and opening date of JSM incidents; the rules, freeze windows, repository-to-service mapping and approvers configured by the administrator; the evaluation results (verdict, reasons, duration, timestamp) and the waivers (requester, approver, reason, expiry). Bitbucket side: pull-request title, source and target branch names, commit messages, reviewer display names and changed file paths — the last one can be disabled in the workspace settings. No source code, no diff, no comment, no attachment.

WHERE IT IS STORED
In the Atlassian Cloud site or workspace where the app is installed, inside the Atlassian Forge platform: rule configuration, freezes, mappings, evaluation log and waivers in Forge SQL (MySQL), the shared pairing secret in Forge's encrypted secret storage, and the pairing metadata and fallback policy in the workspace key-value storage. The data stays in the region of your Atlassian Cloud tenant. No data is sent to us, to any third party or to any other service.

RETENTION
Evaluation records are kept for 180 days. Waiver records are kept without a time limit, because a waiver is a traceability record: it must remain readable after the merge it authorised. Uninstalling the app deletes the stored data.

CONTACT
Questions, requests or complaints: open an issue on https://github.com/BaptisteFaisy/merge-avec-contexte/issues
```

> **Note de travail (FR)** — la durée de 180 jours est la règle du cahier des charges
> (§16) ; **elle n'est pas encore outillée par une purge automatique** (les lignes
> d'évaluation ne sont pas purgées : voir le backlog d'audit, n°56 « le journal croît sans
> borne »). Deux options avant publication : implémenter la purge, ou préciser « au plus
> 180 jours » et assumer que la purge est une évolution prévue. Ne pas publier « 180 jours »
> comme une promesse non tenue.
> **Contact** : l'adresse électronique du propriétaire est à insérer dans la console
> Marketplace (champ « Support »), le dépôt GitHub servant de canal public.

### A.4 Conditions d'utilisation (texte rédigé, à coller dans les deux fiches)

```text
USE OF THE APP
The apps are provided as-is, free of charge, under the Apache-2.0 licence (source code included in the repository). They are hosted entirely on the Atlassian Cloud site or workspace where they are installed; the publisher operates no server and receives no data. Installing and using the apps means accepting the Atlassian Marketplace terms of use (https://www.atlassian.com/legal/marketplace-terms-of-use) and the Atlassian Cloud terms of service (https://www.atlassian.com/legal/atlassian-cloud-agreement), which govern the platform, the data and the billing of the tenant.

SCOPE OF THE GUARANTEE
The publisher provides the apps without any warranty, to the extent permitted by law, and with a best-effort community support, without any service level. The publisher is not responsible for merge decisions, for incidents, or for any loss resulting from the use — or the non-use — of a merge check. The administrator of the site or workspace decides which rules are active, at which level and with which scope.

COMPLIANCE AND REMOVAL
The apps respect the Atlassian platform policies and the data residency of the tenant. Uninstalling an app deletes the data it stores. The publisher may withdraw an app from the Marketplace at any time; in that case the apps remain installed and functional until they are uninstalled.
```

### A.5 Liens de distribution (console développeur)

Les deux apps sont enregistrées dans la console développeur « laddition » et déployées en
`development` et en `production` (`docs/ETAT.md`). Liens à mettre dans la fiche et dans les
instructions aux juges :

- Cerveau (Jira) : <https://developer.atlassian.com/console/myapps/8361630d-9d57-4099-9c2b-5201bb00648d>
- Capteur (Bitbucket) : <https://developer.atlassian.com/console/myapps/0777c25e-2be7-44fc-aa99-6d82fd3789c1>

> **À faire par le propriétaire** : dans chaque page, onglet *Distribution* → créer le lien
> d'installation et le copier dans la fiche Marketplace (« Try it out » / instructions) et
> dans `docs/JUDGES.md`. Les URL ci-dessus sont les pages de console vérifiées ; le lien
> d'installation lui-même se génère dans l'onglet *Distribution* (il n'est pas devinable).

---

## B. Formulaire Devpost

### B.1 Inspiration

```text
Friday, 5 PM. An incident is open on the checkout service. On the same repository, a pull request shows a green build and two approvals, so somebody clicks Merge. Nothing in Bitbucket knows about the incident. Nothing knows that the linked ticket still has two unchecked acceptance criteria, that a deployment freeze starts in an hour, or that the ticket waits on another ticket that is not delivered yet. All of that context lives in Jira and Jira Service Management, and the person clicking Merge never sees it.

Every pre-merge check we knew about judged the code. The context was carried in tribal knowledge — "we don't merge on Fridays", "not during a freeze", "never while the incident is open" — rules nobody could verify, apply or trace. We wanted the same guard-rail for that context as for the build: a check that runs, that blocks or warns, that says why, and that tells you exactly how to unblock.

The second inspiration came from the rise of coding agents. An agent that opens or merges a pull request needs to know the same things a human knows — and needs a tool to ask, not a habit to acquire. So the product was designed with one engine, exposed three ways: the native merge check, a console inside Jira for humans, and a Rovo agent plus six MCP tools for agents. "Can I merge this right now?" is a question an agent should be able to answer by calling a tool, before it tries.
```

### B.2 What it does

```text
Merge avec contexte is a Bitbucket merge check that evaluates the context of a pull request before the merge, not only the code.

The check runs on three triggers: push, reviewer status change, and the merge attempt itself — the last one is what catches an incident opened after the last push. It reads the pull request (title, branches, commit messages, reviewers, changed paths), extracts the Jira issue keys, and asks the paired Jira app to evaluate thirteen context rules:

  R-01 the pull request is linked to an existing Jira issue
  R-02 the issue is in an allowed status
  R-03 acceptance criteria are met
  R-04 no active freeze on the target branch
  R-05 no open incident on the affected service
  R-06 the issue is not blocked by an open issue
  R-07 the issue target version is not already released
  R-08 quiet hours on the main branch
  R-09 security review approved when the issue requires it
  R-10 a member of the service owner team approved
  R-11 the pull request references no other issue
  R-12 a rollback plan is attached for sensitive files
  R-13 upstream dependencies are delivered

Each rule has its own level (blocking, warning, information), its own scope (repositories, branches) and its own mode: active, observation (evaluated and logged, never shown), or disabled. In observation mode a team can measure what would have been blocked before enforcing anything.

The verdict is written for a developer, not for a machine: the number of reasons first, then one line per reason, most severe first, each naming the object (ticket, freeze, incident) and the expected action — no internal jargon. A pull-request card adds the detail, the link to the ticket and a "Request a waiver" button. A waiver is granted by an authorised person, for one rule, with a reason and an expiry; it is logged with who, why and until when, and it stops protecting the pull request once it expires.

The same engine is exposed to humans (a test console inside Jira evaluates a pull request without any Bitbucket workspace) and to agents (a Rovo agent and six MCP tools — evaluate-merge, explain-block, list-freezes, list-waivers, list-approvers, request-waiver).
```

### B.3 How we built it

```text
Two apps, because the platform forces it. A single Atlassian Forge app cannot hold both Bitbucket and Jira scopes: an app is installed on a Bitbucket workspace or on a Jira site, and the two families of scopes cannot be mixed. The product is therefore split in two paired apps — "Capteur" on Bitbucket (merge check, pull-request card, overview panel, workspace settings) and "Cerveau" on Jira (rule engine, storage, test console, issue panel, log, Rovo agent, MCP tools) — talking over a web trigger.

The bridge is the interesting part. A Forge web trigger has no authentication by default, so every request carries an HMAC-SHA256 signature over a canonical string (protocol version, millisecond timestamp, UUID nonce, SHA-256 of the body). The receiving app rejects a request whose clock skew exceeds five minutes, rejects a nonce it has already seen, and compares signatures in constant time. Pairing happens once with a single-use code valid for ten minutes; both sides then hold a 256-bit shared secret in Forge's encrypted secret storage, and the database keeps only a reference to it. Re-pairing rotates the secret and revokes the old one.

The code is a monorepo with one source of truth for the contract (types, rule catalogue, message format, signing, freezes, waivers), copied into the two apps by a script the CI checks. The core is pure logic with no Atlassian import — rules, key extraction, message formatting, HMAC — so it is testable without a platform; the thin adapters (Forge storage, Forge SQL, Jira REST, Bitbucket REST) are the only pieces that touch the platform, and they are injectable. The clock is injected too, which is what made the replay protection testable.

Storage is eight Forge SQL tables (pairing, rule config, freezes, repository-to-service mapping, evaluations, waivers, issue cache, service incidents). A cache per issue and per service, refreshed by Jira events and by a 60-second TTL, keeps the answer inside the five-second budget: measured on the deployed production app, median 0.57 s and p95 0.83 s over ten warm calls, 6.4 s for the first call after a deployment (eight migrations included). Service and team resolution reads the administrator's mapping table first, and the Atlassian Teamwork Graph second, so the incident and team rules work with or without the graph.

Tests: 496 passing tests in 39 files, with the nine acceptance scenarios of the specification written one by one ("recette 1" … "recette 9") and replayed against the deployed app by a signed end-to-end script. CI runs on self-hosted runners with a hard five-minute budget; green pull requests enter a Mergify queue that merges them alone, and a conflict agent resolves rebase conflicts — it has already reconciled a real conflict between two pull requests editing the same section of the README, keeping both intentions, and the queue merged it within the minute.
```

### B.4 Challenges we ran into

```text
The first challenge was structural: the platform constraint that pushed us into two apps also decided the architecture, and we had to design a signed protocol before writing a single rule. The second was that documentation and reality disagree more than we expected when you deploy for real:

  - The `function` section of a manifest is a module declared under `modules:`, not a root section. We had it at the root.
  - A function key is limited to 23 characters; our `resolver-workspace-settings` (27) was refused, and we renamed it `resolver-reglages-ws` (20). Module keys have no such limit.
  - An app tsconfig must not carry `noEmit`: the Forge bundler then emits nothing and fails silently. It must also not carry `jsxImportSource`, and the bundler requires `jsx: react` plus an explicit `import React` in every JSX screen. We found all of this by deploying, not by reading.
  - On a brand-new installation, every route answered `ForgeSQLError` until the hourly migration trigger ticked. We now apply the schema on the first call as well.
  - Default rules were never applied on a fresh installation: with nothing configured, the engine evaluated nothing. The catalogue defaults are now the fallback.
  - The 60-second cache overwrote the demo dataset: two minutes after loading it, the cache re-read Jira, which knows nothing about the demo project, and stored "issue not found" in place of the sample ticket. In demo mode, the sample tickets and incidents are now served locally while everything else still goes to the real Jira.

Two limitations are stated as they are, in the listing and in this submission. Making the check blocking requires the Bitbucket Premium plan — on other plans the check runs and displays the same verdict and message, but informs instead of preventing the merge. And `forge site provision` does not provide Bitbucket, so our own Bitbucket app could not be installed on the demo site: the merge check has not yet been executed by the platform. We compensated with a signed end-to-end script that plays the real scenario against the deployed app — blocked pull request, card, waiver requested, granted, exercised and revoked, incident, incident fix allowed, unsigned request refused — and we say so plainly instead of pretending.
```

### B.5 Accomplishments that we're proud of

```text

- The signed bridge works in production, and we can prove it behaves: an unsigned request to the production web trigger is refused with HTTP 401 and the message "signature missing, invalid, expired or already seen"; a malformed body is refused with HTTP 400; a pairing code that does not exist is refused with HTTP 401 without consuming the offer. Anti-replay is real: the nonce is consumed, the timestamp window is five minutes and the comparison is constant-time.
- The answer comes back fast: median 0.57 s, p95 0.83 s, worst 1.10 s over ten warm calls on the deployed app, against a five-second budget — the remaining time is left to the evaluation itself.
- 496 tests, and the nine acceptance scenarios of the specification are written one by one and run twice: once as pure-logic tests, once against the deployed app by a signed script. Two independent paths, same verdicts, same messages.
- The agent path is not a demo bolted on: the Rovo agent and the six MCP tools call the very same engine as the merge check, and the test suite asserts that they return the same reasons as the pull-request card.
- The pipeline merges itself. Forty pull requests went through the Mergify queue without a human touching a merge button, and the conflict agent really did resolve a rebase conflict on a README section, keeping both intentions, before the queue merged it within the minute.
- The demo dataset is dated relatively to the moment it is loaded, so the demo stays true in December, when the judges will run it, instead of expiring on a hard-coded date.
```

### B.6 What we learned

```text

- The platform's behaviour is not the documentation's behaviour. Every constraint we hit (the 23-character function key, `noEmit`, `jsx: react`, `function` being a module) surfaced only by deploying. We now treat "it deployed and it works" as the only proof.
- Testability is a design decision, not a later refactor. Keeping the engine free of any Atlassian import, injecting the clock, and injecting the ports is what made it possible to assert a replay attack, an expired waiver or a five-minute latency budget in milliseconds, without a platform and without a network.
- A cache is a product decision. The 60-second cache was technically right and yet made the demo lie; from now on the cache answers the question "what does Jira say?" and the demo dataset is served by a reader decorator that delegates everything else to the real Jira.
- Honesty in the listing is worth more than a smooth pitch. Two limitations are written in black and white (blocking requires Premium, the Bitbucket side has not run on the platform yet); we would rather show them than have a judge discover them.
- "Never leave without a clear message" is what makes a guard-rail acceptable to a developer: the count of reasons first, then the object and the action — never internal jargon.
```

### B.7 What's next for the project

```text

- Ship the V1 backlog as a whole: observation mode with a thirty-day report ("31 of the last 212 merges would have been blocked"), the complete freeze calendar (periods, branches, services, recurrence), a fast lane for incident fixes, and rules scoped by file path.
- Go further with the Teamwork Graph: it already completes the administrator's mapping for R-05 and R-10; next it could suggest mappings, follow team rotations and detect ownership changes.
- Let the rules live in the repository (a `.merge-context.yml` reviewed like code, bounded by the workspace rules), so that a team shares one definition of "ready".
- Re-evaluate open pull requests when the context changes, and warn the author before they click Merge.
- Make the waivers learn: a rule waived nine times out of ten is proposed for downgrade; a rule never waived but often triggered is confirmed.
- Same guard-rail for humans and for agents: an agent goes through the same rules, the same waivers and the same log.
- Close the honest gaps: render and verify every screen in a real browser, install the Bitbucket side on a shared workspace and exercise the three triggers, call the MCP tools from a real client, and measure the observation mode live.
```

### B.8 Built with

```text
TypeScript, Node.js 22, Atlassian Forge (Jira Cloud, Jira Service Management, Bitbucket Cloud), UI Kit 2, Forge SQL (MySQL), Forge encrypted secret storage, Rovo agents, Rovo MCP / Model Context Protocol, Atlassian Teamwork Graph (requestGraph), HMAC-SHA256 (node:crypto), Vitest, GitHub Actions (self-hosted runners), Mergify, Apache-2.0.
```

### B.9 Champs annexes

- **Try it out** — voir `docs/JUDGES.md` (EN) et `docs/DEMO-E2E.md` (FR). En une commande, sans navigateur et sans payer : `MAC_BRIDGE_URL=<pont> MAC_SHARED_SECRET=<secret> npm run demo`. Installation manuelle : deux `forge install` (un par app), puis jumelage en trois étapes (code à usage unique côté Jira, saisi côté Bitbucket).
- **Repository URL** — <https://github.com/BaptisteFaisy/merge-avec-contexte>
- **Video** — *emplacement réservé* : lien à coller après l'enregistrement du scénario `docs/VIDEO-SCRIPT.md` (moins de 5 minutes, anglais). Rien n'est inventé ici.
- **Screenshots / gallery** — `docs/CAPTURES.md` (liste des sept captures attendues, fichiers dans `docs/img/`).
- **Hackathon** — Codegeist 2026, catégorie *Apps for Software Teams*. Bonus visés : **Agents Rovo** (agent livré), **MCP** (six outils `rovo:mcp` livrés), **Marketplace** (deux fiches en cours). **Teamwork Graph** : intégré — R-05 (dépôt → service) et R-10 (équipe propriétaire) se résolvent d'abord par la table de correspondance administrée, que le graphe complète (`requestGraph`) — le dire tel quel.

---

## C. Calendrier de soumission

Aucun paiement n'est nécessaire à aucune étape. Repères : Forge et Forge SQL sont gratuits (dans les quotas), le site de démonstration est gratuit et actif jusqu'au 2027-02-09, Devpost est gratuit, un espace de travail Bitbucket à cinq utilisateurs est gratuit.

| # | Quand | Étape | Qui | Paiement |
|---|---|---|---|---|
| 1 | 12 – 17 nov. | **Préalables aux captures** : obtenir un espace de travail Bitbucket partagé (gratuit, ≤ 5 utilisateurs), y installer le Capteur, activer les merge checks personnalisés côté espace (audit n°34), jouer le jumelage par l'interface, vérifier visuellement les six écrans (n°4), interroger l'agent Rovo (n°41) et appeler les six outils MCP depuis un vrai client (n°42) | Propriétaire (+ autres lots d'audit s'ils sont déjà ouverts) | Aucun |
| 2 | 18 – 23 nov. | **Captures d'écran** : prendre les 7 captures de `docs/CAPTURES.md`, les déposer dans `docs/img/`, vérifier qu'aucun secret n'apparaît sur l'image 07 | Propriétaire | Aucun |
| 3 | 24 – 30 nov. | **Devpost** : créer la soumission, coller les champs §B, monter la galerie, renseigner *Try it out* et le dépôt | Propriétaire | Aucun |
| 4 | 1er – 7 déc. | **Vidéo** : enregistrer le scénario `docs/VIDEO-SCRIPT.md` (< 5 min, anglais), l'héberger, garder le lien | Propriétaire | Aucun |
| 5 | 8 – 14 déc. | **Marketplace** : remplir les deux fiches §A dans la console développeur, envoyer les deux fiches en revue (la revue prend du temps : le faire tôt), alimenter l'onglet *Distribution* | Propriétaire | Aucun |
| 6 | 15 déc. | **Gel des fonctionnalités** (§21) — plus de nouvelle fonctionnalité, seulement de la correction | Tous | Aucun |
| 7 | 16 – 18 déc. | **Recette finale** : `npm run verify` (496 tests), `npm run demo` contre la production, recharger le jeu de démonstration, refaire la capture 07, vérifier que le site de démo répond | Propriétaire | Aucun |
| 8 | 19 – 21 déc. | **Finalisation Devpost** : coller le lien vidéo, relire chaque champ, vérifier la galerie, **soumettre en avance** (ne pas attendre le 22) | Propriétaire | Aucun |
| 9 | 22 déc. avant 21 h (Paris) | **Contrôle final** : statut « submitted » sur Devpost, statut des deux fiches Marketplace, capture d'écran du dépôt en secours | Propriétaire | Aucun |

> **Rappel honnêteté** : si l'étape 1 n'a pas pu être faite (pas d'espace de travail
> Bitbucket), les captures 01 à 03 ne sont pas possibles. La galerie se limite alors aux
> écrans Jira et à la sortie du script de démonstration — et le texte de la soumission
> indique déjà que le contrôle n'a pas été exécuté par la plateforme. Ce n'est pas un
> défaut de rédaction, c'est un fait : le dire vaut mieux que de le masquer.

---

## D. Liste des captures d'écran à produire

Détail complet (cadrage, langue, jeu de données, manipulations) : **`docs/CAPTURES.md`**. Les fichiers vont dans `docs/img/` (convention : `docs/img/LISEZ-MOI.md`).

| # | Fichier attendu | Écran (§12) | Où | État |
|---|---|---|---|---|
| 01 | `docs/img/01-bitbucket-resultat-controle.png` | 1 — résultat du contrôle dans la liste native des merge checks | PR Bitbucket | À capturer — **impossible sans espace de travail** (n°3) |
| 02 | `docs/img/02-bitbucket-carte-pr.png` | 2 — carte de PR (colonne de droite) | PR Bitbucket | À capturer — **impossible sans espace de travail** (n°3) |
| 03 | `docs/img/03-bitbucket-reglages-espace.png` | 3 — page de réglages de l'espace de travail | Bitbucket | À capturer — **impossible sans espace de travail** (n°3) |
| 04 | `docs/img/04-jira-reglages-projet.png` | 4 — réglages du projet (règles, gels, correspondance dépôt → service, approbateurs, code de jumelage) | Jira | À capturer — faisable aujourd'hui |
| 05 | `docs/img/05-jira-encart-ticket.png` | 5 — encart sur le ticket `PAY-123` | Jira | À capturer — faisable aujourd'hui |
| 06 | `docs/img/06-jira-console-test.png` | 6 — console de test (ticket + branche cible → évaluation et message exact) | Jira | À capturer — faisable aujourd'hui |
| 06b | `docs/img/06b-jira-journal.png` | 7 — journal (même page que la console) | Jira | À capturer — faisable aujourd'hui |
| 07 | `docs/img/07-terminal-demo-e2e.png` | Sortie de `npm run demo` (onze vérifications) | Terminal | À capturer — faisable aujourd'hui (nécessite l'adresse du pont et le secret) |

Bonus (visés par les bonus Rovo et MCP, pas obligatoires) : `08-jira-agent-rovo.png`, `09-terminal-client-mcp.png`.

---

## E. Réponses prêtes aux questions des juges

### E.1 « Pourquoi deux applications ? »

```text
Because the platform does not allow one app to do both. A Forge app is installed either on a Bitbucket workspace or on a Jira site, and Bitbucket scopes and Jira scopes cannot be mixed in the same deployment — the community and the multi-app compatibility documentation both point that way, and Bitbucket multi-app support is only announced in an undated early-access programme. So we split the product along the natural seam: the Bitbucket app receives the merge check, reads the pull request and shows the result; the Jira app owns the rules, the storage, the waivers and the explanations. The two are joined by a signed web trigger. The design survives a platform change: if Bitbucket multi-app ships, the two apps can become one, and the bridge simply disappears. Judges can also test the whole product on a Jira site alone, thanks to the test console.
```

### E.2 « Comment le secret est-il protégé ? »

```text
In four layers. Pairing happens once, with a single-use code valid for ten minutes: the Jira side generates it, the Bitbucket side enters it, and the code is the proof — no secret exists before that. The two apps then draw a 256-bit shared secret, which is stored in Forge's encrypted secret storage on both sides; the database only keeps a reference (`pairing.secret_ref`), so a database dump does not reveal it. Every request carries an HMAC-SHA256 signature over a canonical string (protocol version, millisecond timestamp, UUID nonce, SHA-256 of the body) and the signature is compared in constant time. A request older or newer than five minutes is refused, and a nonce that was already consumed is refused: replay is impossible. The web trigger URL is itself secret — it is unique per installation and per environment, is never committed, and can be regenerated at any time. Finally, re-pairing rotates the secret and revokes the previous one.
```

### E.3 « Que se passe-t-il si le Cerveau tombe ? »

```text
Nothing merges by accident and nothing blocks by accident either: the fallback policy is chosen in advance, per workspace, in the Bitbucket settings. In the default "open" mode the check passes with the explicit message "context unavailable, check inconclusive" — no developer is blocked by our outage — and every fallback is logged. In "closed" mode the check fails, which is the right choice for a critical branch that must never merge unverified. The bridge client gives up after four seconds, so the Bitbucket side never hangs. What we do not have yet, and say so, is a local log of the fallback on the Bitbucket side and a replay of the missed evaluations once the link is restored (open item in our audit backlog).
```

### E.4 « Combien coûte l'exploitation ? »

```text
Nothing. The apps run on the Atlassian Forge platform, inside the tenant of the customer: no server of ours, no database of ours, no third-party service, no telemetry. Forge and Forge SQL are free within their quotas, the demo site used by the judges is free, and the end-to-end demonstration script runs on the judge's own machine. The only cost our users can possibly incur is on Atlassian's side, and it is optional: the Bitbucket Premium plan if they want the check to be blocking instead of advisory.
```

### E.5 « Pourquoi un contrôle bloquant exige-t-il l'offre Premium, et qu'est-ce que cela change ? »

```text
That is an Atlassian platform rule, not a choice of ours: making a custom merge check mandatory — at workspace, project or repository level — is a paid-plan feature. On the other plans the check still runs on the three triggers, still computes the same verdict and still displays the same message, in the native merge-check list, with the same pull-request card, the same waivers and the same log: it informs instead of preventing. With Premium, the check becomes mandatory on the branches the administrator selects, and the merge button is blocked until the context is satisfied — or until somebody grants a waiver, which is logged with its reason and its expiry. In other words, the value of the product (knowing, explaining, remediating) does not depend on the plan; only the enforcement does. We prefer to say this plainly rather than let a judge discover it on a free workspace.
```

### E.6 « Un agent de code peut-il s'en servir ? »

```text
Yes, and that is a first-class path, not an extra. The six tools — evaluate-merge, explain-block, list-freezes, list-waivers, list-approvers and request-waiver — are exposed through `rovo:mcp` and callable from any MCP client. `evaluate-merge` is a dry run: it returns the rules, the reasons and the possible waivers for an issue key, so an agent knows whether it is allowed to merge before it tries, and stops with the same reasons a human would read. The tools call the very same engine as the merge check — the test suite asserts that they return the same reasons as the pull-request card.
```
