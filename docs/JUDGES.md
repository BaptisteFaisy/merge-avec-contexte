# Instructions for Judges — Merge avec contexte

> Codegeist 2026 · Apps for Software Teams
> **Merge avec contexte** is a Bitbucket merge check that evaluates *context* before merging —
> the linked Jira ticket, acceptance criteria, deployment freezes, open JSM incidents,
> blocking issue links, and released versions — instead of code alone. It blocks or warns
> **and explains why, with a concrete unblock path**.

Because a single Forge app cannot hold both Bitbucket and Jira permissions, the product ships
as **two paired Forge apps** talking over an **HMAC-SHA256-signed web trigger**:

| App | Platform | Role |
|---|---|---|
| **Capteur** (Sensor) | Bitbucket | Merge check, PR side panel card, workspace settings (pairing, fallback policy) |
| **Cerveau** (Brain) | Jira | Rule engine, Forge SQL storage, test console, issue panel, Rovo agent, MCP tools |

Testing is offered at **two levels**: Level A needs only a Jira site (no Bitbucket required);
Level B exercises the real Bitbucket merge check end to end.

---

## Level 0 — One command, no browser, no cost

The fastest way to see the product work for real: a script that signs its
requests with the shared contract and plays the whole scenario against the
deployed app (blocked PR with the §9 message, PR card, waiver requested and
granted, incident with the fix fast-path, unsigned request rejected).

```bash
npm install
MAC_BRIDGE_URL=<web trigger URL> MAC_SHARED_SECRET=<shared secret> npm run demo
```

Real output, measured on the production deployment:

```
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
OK   Correctif lié à l’incident autorisé (516 ms) — Autorisé, 1 avertissement : Correctif d’incident INC-52 : la fusion reste autorisée.
OK   Requête non signée refusée (484 ms) — HTTP 401
Démonstration réussie
```

Setup and the honest limits (no Bitbucket workspace, Premium needed to *block*,
demo dataset dated relatively to load time) are in
[`docs/DEMO-E2E.md`](DEMO-E2E.md).

---

## Already deployed — you can skip the build

Both apps are registered, deployed and the Brain is installed on a demo site:

| | Cerveau (Brain, Jira) | Capteur (Sensor, Bitbucket) |
|---|---|---|
| App ID | `ari:cloud:ecosystem::app/8361630d-9d57-4099-9c2b-5201bb00648d` | `ari:cloud:ecosystem::app/0777c25e-2be7-44fc-aa99-6d82fd3789c1` |
| Environments | `development` 2.2.0, `production` 2.0.0 | `development` 2.1.0, `production` 2.0.0 |
| Installed on | `one-atlas-cndz.atlassian.net` (Jira) | not installed — no Bitbucket workspace yet |

Installation links (Developer Console → *Distribution*) let any site admin install
either app without touching the CLI.

The signed bridge is live and can be smoke-tested without any UI — replace
`<bridge-url>` with the web trigger URL of your own installation
(`forge webtrigger create -f pont-bitbucket -e production -s <site> -p jira`):

```bash
curl -X POST '<bridge-url>' -H 'content-type: application/json' -d '{"route":"health"}'
# {"status":"ok","version":"1.0.0","date":"…","stockage":"ok"}   → HTTP 200

curl -X POST '<bridge-url>' -H 'content-type: application/json' \
     -d '{"route":"evaluate","payload":{"workspaceUuid":"ws"}}'
# {"error":"unauthorized","message":"Signature absente, invalide, périmée ou déjà vue."} → HTTP 401

curl -X POST '<bridge-url>' -H 'content-type: application/json' -d 'not-json'
# {"error":"bad-payload","message":"Corps illisible : JSON attendu."} → HTTP 400
```

Measured on the deployed production app (10 consecutive warm calls): median
**0.57 s**, p95 **0.83 s**, worst 1.10 s; first call after a deploy (cold start
plus the eight SQL migrations) 6.4 s. The 5 s budget of MC-11 is met with room
left for the evaluation itself. Forge SQL migrations report
`{"mode":"runner","appliquees":8}`: the eight tables of §14 exist.

---

## Prerequisites

- Node.js 18+ and the Forge CLI: `npm install -g @forge/cli`
- `forge login` with an Atlassian developer account
- For Level A only, a demo site is enough. Create one with:

```bash
forge site provision
```

  This provisions a demo site with **Jira, Confluence, JSM, Rovo and Studio**
  (note: **Bitbucket is not included** — see Known Limitations below).

- Clone and deploy both apps:

```bash
git clone https://github.com/BaptisteFaisy/merge-avec-contexte.git
cd merge-avec-contexte
cd cerveau && forge deploy      # Jira app
cd ../capteur && forge deploy   # Bitbucket app (Level B only)
```

- Install each app (`forge install`) on the target site / workspace.

---

## Level A — Without Bitbucket (Jira only)

Everything below runs on the **Cerveau** app installed on a Jira site. All seven MVP rules
are demonstrable without any Bitbucket workspace.

### A.1 Load the demo dataset

In the app's project settings page, click **Load demo dataset**. It creates:

- a demo project with ticket `PAY-123` (two unchecked acceptance criteria, one blocking link),
- a `checkout-api` service with an open JSM incident `INC-52`,
- a freeze window named **Black Friday** on `main`,
- a repository → service mapping row.

### A.2 Use the Test Console

The **Test Console** (Jira page shipped with the app) simulates a PR without Bitbucket:
pick an issue key and a target branch, run the evaluation, and get the exact verdict and
the exact message the real merge check would show. Example output for `PAY-123` on `main`:

```
Blocked, 2 reasons.
1) PAY-123: 2 acceptance criteria not checked.
2) Freeze "Black Friday" on main until Nov 30, 9:00 AM.
Details and waiver: "Merge avec contexte" card on the right.
```

Try: check the two acceptance criteria boxes on the ticket, re-run the console — only the
freeze remains. Grant a waiver — the evaluation passes with the waiver recorded.

### A.3 Ask the Rovo agent

Open Rovo on the demo site and chat with the **Merge avec contexte** agent:

- “Why is the PR for PAY-123 blocked?”
- “Can I merge PAY-123 now?”
- “Which freezes are planned this week?”
- “Who can grant me a waiver?”

The last question is answered by `list-approvers`, a **read-only** action: naming the
approvers records nothing and notifies nobody. `request-waiver` is the only action that
writes.

### A.4 Call the 6 MCP tools

The same six actions are exposed over `rovo:mcp` and can be called from any MCP client
(e.g. a code agent). Each tool mirrors what the merge check itself uses:

| Tool | Verb | Inputs | Returns |
|---|---|---|---|
| `evaluate-merge` | GET | `issueKey` (required), `targetBranch`, `repository` | Dry-run evaluation: verdict, reasons, ready-to-show message |
| `explain-block` | GET | `issueKey` | Latest real evaluation for the ticket's PRs |
| `list-freezes` | GET | `days` | Current and upcoming freezes |
| `list-waivers` | GET | `issueKey` | Active waivers |
| `list-approvers` | GET | `issueKey` (optional) | Who can grant a waiver — read-only, nothing recorded |
| `request-waiver` | CREATE | `issueKey`, `ruleCode`, `reason`, `hours` | Request recorded, approvers notified |

Five of the six are `GET`: only `request-waiver` writes. An Automation-triggered agent can
therefore use every read-only tool (Automation never invokes CREATE/UPDATE/DELETE/TRIGGER).

### A.5 The code-agent path (§7.4), exactly

A code agent that is about to merge asks the Brain first: one call, one JSON answer, no side
effect — the agent stops instead of attempting the merge.

Request (MCP tool call):

```json
{
  "tool": "evaluate-merge",
  "arguments": { "issueKey": "PAY-123", "targetBranch": "main", "repository": "paiement-api" }
}
```

Response (real shape, produced by `runEvaluateMerge`, serialisable as-is):

```json
{
  "verdict": "blocked",
  "allowed": false,
  "message": "Blocked, 2 reasons.\n1) PAY-123: 2 acceptance criteria not checked.\n2) Freeze \"Black Friday\" on main until Nov 30, 9:00 AM.\nDetails and waiver: the \"Merge with context\" card on the right.",
  "reasons": [
    { "rule": "R-03", "level": "blocking", "text": "PAY-123: 2 acceptance criteria not checked.", "action": "Tick the criteria that are truly validated on the issue." },
    { "rule": "R-04", "level": "blocking", "text": "Freeze \"Black Friday\" on main until Nov 30, 9:00 AM.", "action": "Wait for the freeze to end, or request a waiver." }
  ],
  "evaluatedAt": "2026-11-11T10:00:00.000Z",
  "durationMs": 8
}
```

The agent's decision rule is the `allowed` flag: `false` → stop and report `message` and
`reasons`; `true` → merge. A rejected input (missing `issueKey`) also answers
`allowed: false`, with `verdict: "inconclusive"` — never an exception, so an agent can never
merge “in doubt”.

This journey is replayed at action level by `cerveau/test/rovo-actions.test.ts`
(`describe('parcours agent de code (§7.4)')`): input → JSON round-trip → decision, and the
test asserts that no waiver was recorded on the way.

---

## Level B — With Bitbucket (full end-to-end)

Requires a **shared** Bitbucket Cloud workspace (personal workspaces do not support custom
merge checks — see Known Limitations).

### B.1 Install the Sensor app

1. `cd capteur && forge install` and choose **Bitbucket** → your shared workspace.
2. In Bitbucket, a workspace admin enables **custom merge checks**
   (Workspace settings → Merge checks), then selects, per check, the target branches and
   whether it is **mandatory**. Mandatory checks require the workspace's **Premium** plan.

### B.2 Pair the two apps (3 steps)

1. **Jira**: in the Cerveau project settings, click **Generate pairing code**
   (single-use, valid 10 minutes).
2. **Bitbucket**: open the Capteur workspace settings page and paste the code.
3. The Sensor calls the Brain's web trigger with the code; both sides store a shared
   secret and the trigger URL. Done — the link status turns green.

(Re-pairing rotates the secret and invalidates the old one.)

### B.3 Open a test PR

1. Create a branch named `feature/PAY-123-limit-attempts` with any commit, open a PR
   targeting `main`.
2. The merge check runs on **push**, on **reviewer status change**, and again on the
   **merge attempt** itself.
3. You should see the check fail with the two-reason message, and the
   **“Merge avec contexte” card** in the PR's right panel listing each reason, a link to
   the ticket, and a **Request a waiver** button.
4. Check the acceptance criteria on `PAY-123`, re-run the check from the PR
   (individual re-run is supported), request a waiver from the card, grant it as the
   approver — the final merge-attempt check passes and the waiver is logged.

---

## Acceptance scenarios (§18) and expected results

| # | Given / When | Then (expected) |
|---|---|---|
| 1 | A PR whose ticket has 2 unchecked acceptance-criteria boxes, rule R-03 set to blocking | Check fails; message names the ticket and the number of unchecked boxes |
| 2 | An active freeze on `main` | Every PR targeting `main` fails with the freeze name and end date |
| 3 | An open incident on the repository's service | The PR fails — unless its ticket is linked to the incident (incident fixes pass, with a note) |
| 4 | A 2-hour waiver is granted | The check passes; the log shows who, why, and until when |
| 5 | The Brain is stopped and the fallback policy is **open** | The check passes with the message “context unavailable” |
| 6 | A web-trigger request with a bad signature or an old timestamp | The request is rejected |
| 7 | The Test Console is run for a given ticket | It returns the same message as the real check |
| 8 | `evaluate-merge` is called from an MCP client | It returns the same reasons as the PR card |
| 9 | A rule is in observation mode | Nothing appears in the PR; the evaluation still appears in the log |

---

## Known limitations (§15)

- **Mandatory merge checks require the Bitbucket Premium plan.** On lower plans the check
  informs but cannot block. (A Premium trial on the demo workspace covers the blocking demo.)
- **Personal Bitbucket workspaces do not offer custom merge checks.** Use a shared workspace.
- **`forge site provision` does not include Bitbucket** — the demo site covers Jira,
  Confluence, JSM, Rovo and Studio. Level B needs a real shared Bitbucket workspace.
- A single Forge app cannot mix Bitbucket and Jira scopes today (Bitbucket multi-app
  support is only announced in the “Global Apps” early-access program, undated) — hence
  the two-app architecture and the signed bridge.
- Without a repository → service mapping, incident rule R-05 does not block and says so
  explicitly (“service unknown for this repository, rule not evaluated”). The mapping reads
  **two sources, in this order** (§8): the table held in the Brain's settings, then the
  **Teamwork Graph** relations (service ↔ repository ↔ component ↔ team) through Forge's
  `requestGraph`. The same graph supplies R-10's owner team when the settings do not name
  one — so R-10 becomes playable without typing a single account id. The graph schema is
  young: on an unexpected shape the reader returns nothing and the product falls back to the
  settings table; it never fails an evaluation.
