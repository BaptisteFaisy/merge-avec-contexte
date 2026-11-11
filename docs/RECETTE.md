# Recette — « Merge avec contexte »

Les 9 scénarios de recette du cahier des charges (§18), formalisés **Étant donné / Quand /
Alors**, avec pour chacun le fichier de test attendu dans le dépôt et son état.
Convention : les tests de logique pure vivent dans `shared/test/` (vitest, aucun import
Forge), les tests du moteur/stockage dans `cerveau/test/`, les tests des adaptateurs et de
l'UI Bitbucket dans `capteur/test/`. Aucun fichier de test n'existe encore sur `main` :
tout est **à écrire**. Le statut passe à « écrit » quand le fichier est committé et vert
en CI.

---

## Scénario 1 — Critères d'acceptation non cochés (R-03 bloquant)

- **Étant donné** une PR dont le ticket lié a deux cases de critères d'acceptation non
  cochées, et la règle R-03 configurée en niveau bloquant sur la portée concernée,
- **Quand** le merge check s'exécute (push ou tentative de fusion),
- **Alors** le contrôle échoue et le message cite le ticket et le nombre de cases non
  cochées (« PAY-123 : 2 critères d'acceptation non cochés »), sans jargon interne.
- **Fichier de test attendu** : `shared/test/rules/r03-criteria.test.ts` (logique pure :
  extraction des cases depuis `criteria_json`, niveau bloquant) et
  `shared/test/message.test.ts` (format du message §9).
- **État** : à écrire.

## Scénario 2 — Gel actif sur la branche cible (R-04)

- **Étant donné** un gel actif nommé « Black Friday » couvrant la branche `main`,
- **Quand** une PR ciblant `main` est évaluée,
- **Alors** le contrôle échoue et le message donne le nom du gel et sa date de fin ;
  une PR ciblant une autre branche n'est pas affectée.
- **Fichier de test attendu** : `shared/test/rules/r04-freeze.test.ts` (correspondance
  branche/période, y compris motifs type `release/*` et gel commençant entre push et
  fusion).
- **État** : à écrire.

## Scénario 3 — Incident ouvert sur le service (R-05), sauf correctif

- **Étant donné** un incident JSM ouvert sur le service associé au dépôt (table
  `repo_service` renseignée),
- **Quand** une PR de ce dépôt est évaluée,
- **Alors** le contrôle échoue — **sauf** si le ticket de la PR est lié à l'incident :
  la PR passe alors avec la mention « correctif d'incident INC-52 » (MC-12) ; sans
  correspondance dépôt → service, la règle ne bloque pas et le dit explicitement.
- **Fichier de test attendu** : `shared/test/rules/r05-incident.test.ts` (blocage,
  exception correctif lié, cas service inconnu).
- **État** : à écrire.

## Scénario 4 — Dérogation accordée et tracée

- **Étant donné** un contrôle en échec pour lequel une dérogation de 2 heures est demandée
  puis accordée par une personne habilitée,
- **Quand** le contrôle est réévalué pendant la validité de la dérogation,
- **Alors** il passe, et le journal montre qui a demandé, qui a accordé, le motif et
  l'échéance ; une dérogation expirée entre l'accord et la fusion fait échouer le contrôle
  et le message le dit.
- **Fichier de test attendu** : `cerveau/test/waivers.test.ts` (cycle de vie demander /
  accorder / refuser / expirer, effet sur le verdict, écriture en tables `waiver` et
  `evaluation`).
- **État** : à écrire.

## Scénario 5 — Cerveau injoignable, politique « ouvert »

- **Étant donné** le Cerveau arrêté (ou trop lent) et la politique de repli réglée sur
  « ouvert »,
- **Quand** le merge check s'exécute,
- **Alors** le contrôle passe avec le message « Contexte indisponible, contrôle non
  concluant », et le repli est journalisé ; avec la politique « fermé », le contrôle
  échoue.
- **Fichier de test attendu** : `capteur/test/fallback.test.ts` (timeout/erreur du pont →
  verdict selon la politique, message conforme, journalisation du repli côté Capteur).
- **État** : à écrire.

## Scénario 6 — Rejet des requêtes non valides sur le pont

- **Étant donné** le web trigger du Cerveau exposé,
- **Quand** il reçoit une requête dont la signature HMAC-SHA256 est fausse, dont
  l'horodatage dépasse la fenêtre de 5 minutes, ou dont le nonce a déjà été consommé,
- **Alors** la requête est rejetée (statut d'erreur d'authentification) et rien n'est
  évalué ni écrit.
- **Fichier de test attendu** : `shared/test/crypto/signature.test.ts` (calcul/vérification
  de l'empreinte sur corps + horodatage + nonce) et `cerveau/test/bridge-auth.test.ts`
  (fenêtre temporelle, anti-rejeu, rejet 401).
- **État** : à écrire.

## Scénario 7 — Parité console de test / contrôle réel

- **Étant donné** un ticket donné et une branche cible,
- **Quand** la console de test du Cerveau évalue ce couple,
- **Alors** elle renvoie exactement le même verdict et le même message que le contrôle
  réel pour la même PR (mêmes règles, mêmes raisons, même formatage).
- **Fichier de test attendu** : `cerveau/test/console-parity.test.ts` (même moteur
  d'évaluation appelé par les deux chemins, comparaison caractère par caractère du
  message).
- **État** : à écrire.

## Scénario 8 — Parité outil MCP / carte de PR

- **Étant donné** une PR évaluée dont la carte affiche ses raisons de blocage,
- **Quand** un client MCP appelle `evaluate-merge` avec la même clé de ticket et la même
  branche cible,
- **Alors** l'outil renvoie les mêmes raisons que la carte de la PR (mêmes codes de
  règles, mêmes libellés, mêmes levées possibles).
- **Fichier de test attendu** : `cerveau/test/mcp-tools.test.ts` (les 5 outils :
  `evaluate-merge`, `explain-block`, `list-freezes`, `list-waivers`, `request-waiver` ;
  assertion de parité avec la sortie du moteur pour la carte).
- **État** : à écrire.

## Scénario 9 — Mode observation

- **Étant donné** une règle réglée en mode observation,
- **Quand** une PR enfreint cette règle et que le merge check s'exécute,
- **Alors** rien n'apparaît dans la PR (ni message ni carte ne mentionne la règle) et
  l'évaluation figure au journal, exploitable par le rapport « ce qui aurait été bloqué ».
- **Fichier de test attendu** : `cerveau/test/observation-mode.test.ts` (verdict neutre
  renvoyé, écriture en `evaluation` avec le mode, agrégat du rapport) et
  `capteur/test/pr-card.test.ts` (aucune raison observée dans le message ni la carte).
- **État** : à écrire.

---

## Couverture des exigences fonctionnelles MC-01 à MC-17

| N° | Exigence (priorité) | Implémentation | Test |
|---|---|---|---|
| MC-01 | Jumelage Bitbucket ↔ Jira par code à usage unique (M) | `cerveau/src/pairing.ts` + `capteur/src/pairing.ts` (code 10 min, secret partagé, rotation) | `cerveau/test/pairing.test.ts`, `capteur/test/pairing.test.ts` |
| MC-02 | Contrôle aux 3 déclencheurs : push, avis relecteur, fusion (M) | `capteur/manifest.yml` (triggers du module merge check) + `capteur/src/index.ts` | `capteur/test/triggers.test.ts` |
| MC-03 | Évaluer les règles R-01 à R-07 (M) | `shared/src/rules/` (logique pure) + `cerveau/src/engine.ts` (orchestration, cache, SQL) | `shared/test/rules/r01…r07-*.test.ts`, `cerveau/test/engine.test.ts` |
| MC-04 | Message conforme au §9 (M) | `shared/src/message.ts` | `shared/test/message.test.ts` (+ scénarios 1, 2, 5) |
| MC-05 | Carte de PR détaillée (M) | `capteur/src/` (module carte de PR) + rendu depuis le détail renvoyé | `capteur/test/pr-card.test.ts` (+ scénario 9) |
| MC-06 | Niveau, portée, mode par règle (M) | `cerveau/src/settings/` + table `rule_config` | `cerveau/test/rule-config.test.ts` |
| MC-07 | Dérogations : demander, accorder, refuser, expirer (M) | `cerveau/src/waivers.ts` + table `waiver` | `cerveau/test/waivers.test.ts` (scénario 4) |
| MC-08 | Journal des évaluations et dérogations (M) | `cerveau/src/db.ts` (tables `evaluation`, `waiver`) + page Journal | `cerveau/test/journal.test.ts` |
| MC-09 | Console de test sans Bitbucket (M) | `cerveau/src/console/` (page de test, même moteur) | `cerveau/test/console-parity.test.ts` (scénario 7) |
| MC-10 | Encart ticket : état des PR vis-à-vis des règles (M) | `cerveau/src/issue-context/` | `cerveau/test/issue-context.test.ts` |
| MC-11 | Répondre < 5 s dans 95 % des cas (M) | `cerveau/src/engine.ts` + `issue_cache` + triggers d'événements Jira | `cerveau/test/perf-p95.test.ts` (jeu de `duration_ms` → P95) ; mesure réelle : `docs/VALIDATION-PLAN.md` |
| MC-12 | Laisser passer les correctifs d'incident, avec trace (S) | `shared/src/rules/r05` (exception lien incident) | `shared/test/rules/r05-incident.test.ts` (scénario 3) |
| MC-13 | Mode observation + rapport « aurait été bloqué » (S) | `cerveau/src/observation/` (mode par règle, agrégats 30 jours) | `cerveau/test/observation-mode.test.ts` (scénario 9) |
| MC-14 | Calendrier des gels : périodes, branches, services, récurrence (S) | `cerveau/src/freezes/` + table `freeze` | `shared/test/rules/r04-freeze.test.ts`, `cerveau/test/freezes.test.ts` |
| MC-15 | Règles R-08 à R-11 (S) | `shared/src/rules/` (heures calmes, sécurité, Teamwork Graph, clés multiples) | `shared/test/rules/r08…r11-*.test.ts` |
| MC-16 | Statistiques : blocages, dérogations par équipe, délai de déblocage (S) | `cerveau/src/stats/` (agrégats sur `evaluation` et `waiver`) | `cerveau/test/stats.test.ts` |
| MC-17 | Fichier de règles dans le dépôt, borné par l'espace de travail (C) | `capteur/src/` (lecture du fichier de règles versionné) + bornage par `rule_config` côté Cerveau | `cerveau/test/repo-rules-bounds.test.ts` |

**Règle de suivi** : un scénario est « recetté » quand son test est écrit, vert en CI, et
que la démonstration manuelle correspondante a été jouée sur l'espace de démonstration
(niveau A ou B de `docs/JUDGES.md`). Priorité de rédaction : scénarios 6 → 1 → 2 → 5 → 3
→ 4 → 7 → 8 → 9 (le pont d'abord, c'est le risque n°1 du §22).
