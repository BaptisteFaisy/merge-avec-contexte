# Video Script — “Merge avec contexte” (Codegeist 2026)

> Target runtime: **under 5 minutes** (script clocks ≈ 4:45).
> Language: English voice-over. Captions recommended.
> Recording: 1080p screen capture; cut between the Bitbucket PR view, the Jira site and
> a terminal running an MCP client. Keep one visible clock/timer off-frame for pacing.

---

## Sequence 1 — The problem (0:00 – 0:30)

**Screen:** a Bitbucket PR page at “Friday 17:00”, then a JSM incident page, then a chat
window. No app chrome yet — real-world footage or staged screens.

**Voice-over (read as-is):**

> “Friday, 5 PM. An incident is open on the checkout service. Meanwhile, a pull request
> targeting that very service shows a green build and two approvals — so someone clicks
> Merge. Nothing in Bitbucket knows about the incident. Nothing knows the ticket still
> has two acceptance criteria unchecked, or that a deployment freeze starts in an hour.
> All of that context lives in Jira and JSM — and the person clicking Merge never sees it.
> This is Merge avec contexte: a merge check that looks at the work, not just the code.”

**Demo action:** show the merge button being clicked, then cut to the incident timeline
where the incident was opened minutes earlier. Hold 2 seconds on the incident page.

---

## Sequence 2 — A blocked PR (0:30 – 1:30)

**Screen:** the Bitbucket PR #42 page (`feature/PAY-123-limit-attempts` → `main`) with the
app installed. Focus: the native merge-check list, then the “Merge avec contexte” side card.

**Voice-over:**

> “Here is PR 42. Its branch names the ticket: PAY-123. When code is pushed, our Bitbucket
> app reads the pull request, extracts the ticket key, and asks our Jira app — over a
> signed web trigger — to evaluate the context. Two rules fail. And instead of a red cross
> with no explanation, the check says exactly this:”

**Demo action:**
1. Trigger the check (push a trivial commit, or click re-run on the check).
2. Zoom on the merge check result showing:

```
Blocked, 2 reasons.
1) PAY-123: 2 acceptance criteria not checked.
2) Freeze “Black Friday” on main until Nov 30, 9:00 AM.
Details and waiver: “Merge avec contexte” card on the right.
```

3. Pan to the right-panel card: each reason expanded, a link to PAY-123, a
   **Request a waiver** button, and the freeze end date.

**Voice-over (continued):**

> “Two acceptance criteria are unchecked on the ticket, and a freeze called Black Friday
> covers the main branch. The card on the right links to the ticket, to the freeze, and
> offers a waiver — every block comes with its unblock path.”

---

## Sequence 3 — Unblocking: criteria and waiver (1:30 – 2:15)

**Screen:** split flow — the Jira ticket PAY-123, back to the PR, then the approver’s view.

**Voice-over:**

> “Léa checks the two acceptance criteria in Jira, and re-runs the check from the pull
> request. The first reason is gone; only the freeze remains. She can’t wait for the
> freeze to lift — so she requests a waiver straight from the card. Her tech lead gets a
> notification, grants it for two hours with a reason. The check re-runs one last time at
> the merge attempt — and it passes. Who waived what, why, and until when: all of it is
> logged.”

**Demo action:**
1. In Jira, tick the two acceptance-criteria checkboxes on PAY-123.
2. In the PR, click re-run on the failed check → message now shows one reason (the freeze).
3. Click **Request a waiver** on the card, fill reason “price fix before opening”, 2 hours.
4. Switch to the approver account: grant the waiver.
5. Click **Merge** → the on-merge check evaluates fresh, turns green, merge completes.
   Flash the log page showing the waiver entry.

---

## Sequence 4 — During an incident (2:15 – 2:50)

**Screen:** JSM incident INC-52 being opened on service `checkout-api`; then two PRs.

**Voice-over:**

> “Now an incident opens on the checkout API. Immediately, every PR whose repository maps
> to that service is blocked — including one that was green an hour ago. Except one: the
> hotfix. Its ticket is linked to the incident, so it passes, marked as an incident fix.
> The rule knows the difference between feeding the fire and putting it out.”

**Demo action:**
1. Open incident INC-52 on `checkout-api` in JSM.
2. Show PR A (unrelated ticket) failing with “open incident INC-52 on checkout-api”.
3. Show PR B (ticket linked to INC-52) passing with the note “incident fix INC-52”.

---

## Sequence 5 — Observation mode (2:50 – 3:30)

**Screen:** Jira settings page for a rule, then the report page.

**Voice-over:**

> “Afraid to break your teams’ flow? Every rule starts in observation mode: it evaluates
> and logs, but shows nothing and blocks nothing. Three weeks later, the report says:
> 212 merges observed, 31 would have been blocked — 24 of them in a single repository.
> That’s how you turn a gut feeling into a decision: enable the rule, at warning level
> everywhere, blocking on that one repository.”

**Demo action:**
1. Show the rule settings: level, scope, mode toggle set to **Observation**.
2. Open the Journal/report page: the “would have been blocked” counters, per repository.
3. Flip the rule to active/warning to show the one-click change.

---

## Sequence 6 — Rovo agent and MCP tools (3:30 – 4:10)

**Screen:** Rovo chat on the Jira site, then a terminal with an MCP client calling
`evaluate-merge`.

**Voice-over:**

> “The same brain answers in natural language. Ask the Rovo agent: ‘Why is the PR for
> PAY-123 blocked?’ — it explains. ‘Can I merge it now?’ — it evaluates live. And because
> these answers come from MCP tools, code agents get them too. Before merging, an agent
> calls evaluate-merge with the ticket key, receives the two blocking reasons — and stops,
> instead of discovering the block after the fact. Humans and agents, same rules, same
> waivers, same log.”

**Demo action:**
1. In Rovo, type “Why is the PR for PAY-123 blocked?” → show the answer citing the freeze.
2. In the terminal, run the MCP client: call `evaluate-merge` with `issueKey=PAY-123`,
   `targetBranch=main` → JSON response with the same two reasons as the PR card.

---

## Sequence 7 — Architecture and close (4:10 – 4:45)

**Screen:** a simple architecture slide (two boxes, one signed arrow), then the repo,
then the title card.

**Voice-over:**

> “Under the hood: one Forge platform constraint — an app can’t hold Bitbucket and Jira
> permissions at once. So we built two paired Forge apps. A Sensor in Bitbucket, a Brain
> in Jira, connected by a web trigger signed with HMAC-SHA-256: timestamp, nonce, replay
> protection. Not a single line of source code leaves Bitbucket — only pull-request
> metadata. Evaluations answer in under five seconds, 95 percent of the time, thanks to
> an event-refreshed cache. Merge avec contexte: the merge check that reads the room —
> for your team, and for your agents.”

**Demo action:**
1. Show the diagram: Bitbucket → Sensor → signed bridge → Brain → rules/cache/SQL →
   verdict → message → PR card.
2. Two-second flash of the repository tree (`capteur/`, `cerveau/`, `shared/`).
3. End card: app name, Codegeist 2026, repository URL.

---

## Production notes

- Total voice-over word count ≈ 620 words — comfortable at 140 wpm within 4:45.
- Sequences 2–4 must show **real** UI (Premium trial workspace), not mockups: judges test
  Level B themselves.
- Keep every on-screen message in English (submission language), even though the product
  localizes messages to the workspace language.
- If a live re-run is slow to record, capture the check result separately and cut — never
  alter message content.
