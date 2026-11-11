# Recette — « Merge avec contexte »

Les neuf scénarios de recette du cahier des charges (§18), formalisés
**Étant donné / Quand / Alors**, avec pour chacun son emplacement réel dans le
dépôt et son état.

**État au 2026-11-11 : les neuf scénarios sont écrits, verts en CI, et joués
deux fois** —

1. en tests vitest : `cerveau/test/recette.test.ts` (un `it` par scénario,
   nommé `recette 1` … `recette 9`), sur le jeu de démonstration du §20 avec
   les doublures de `cerveau/test/recette-fixtures.ts` (horloge injectée, aucun
   import Forge, aucun réseau) ;
2. en démonstration réelle contre l'app déployée : `npm run demo`
   (`scripts/demo-e2e.ts`, requêtes signées vers le web trigger de production)
   — procédure et sortie enregistrée dans `docs/DEMO-E2E.md`.

Les tests unitaires des règles, du pont, du stockage et des écrans complètent
la recette ; leurs emplacements figurent dans le tableau MC-01 → MC-17 en fin
de document.

---

## Scénario 1 — Critères d'acceptation non cochés (R-03 bloquant)

- **Étant donné** une PR dont le ticket lié a deux cases de critères
  d'acceptation non cochées, et la règle R-03 configurée en niveau bloquant,
- **Quand** le merge check s'exécute,
- **Alors** le contrôle échoue et le message cite le ticket et le nombre de
  cases non cochées, sans jargon interne.
- **Test** : `cerveau/test/recette.test.ts` — « recette 1 : deux critères non
  cochés et R-03 bloquant ⇒ bloqué, message citant le ticket et le nombre ».
  Unitaires : `cerveau/test/rules-mvp.test.ts` (R-03),
  `shared/test/format.test.ts` (format imposé du §9),
  `cerveau/test/jira-parse.test.ts` (extraction des cases : description, champ,
  sous-tâches).
- **Démo** : étape « PR #42 bloquée — PAY-123 : 2 critère(s) d'acceptation non
  coché(s) ».
- **État** : ✅ recetté (test + démo sur app déployée).

## Scénario 2 — Gel actif sur la branche cible (R-04)

- **Étant donné** un gel actif nommé « Black Friday » couvrant la branche
  `main`,
- **Quand** une PR ciblant `main` est évaluée,
- **Alors** le contrôle échoue et le message donne le nom du gel et sa date de
  fin ; une PR ciblant une autre branche n'est pas affectée.
- **Test** : `cerveau/test/recette.test.ts` — « recette 2 : gel actif sur main
  ⇒ toute PR vers main échoue, message nommant le gel et sa fin ». Unitaires :
  `cerveau/test/rules-mvp.test.ts` (R-04), `shared/test/freezes.test.ts`
  (portée, fenêtre, motifs `release/*`, récurrence).
- **Démo** : non jouée en direct — le jeu de démonstration date le gel à
  +3 jours (`docs/AUDIT.md` n°83) ; la correspondance dépôt → service et le
  gel sont chargés, le scénario est prouvé par le test.
- **État** : ✅ testé ; démonstration en direct à ajouter (audit n°83).

## Scénario 3 — Incident ouvert sur le service (R-05), sauf correctif

- **Étant donné** un incident JSM ouvert sur le service associé au dépôt,
- **Quand** une PR de ce dépôt est évaluée,
- **Alors** le contrôle échoue — **sauf** si le ticket de la PR est lié à
  l'incident : la PR passe alors avec la mention « correctif d'incident »
  (MC-12).
- **Test** : `cerveau/test/recette.test.ts` — « recette 3 : incident ouvert ⇒
  la PR échoue, sauf ticket lié à l'incident (correctif autorisé) ».
  Unitaires : `cerveau/test/rules-mvp.test.ts` (R-05).
- **Démo** : étapes « PR #43 bloquée par l'incident » (INC-52 sur
  `checkout-api`) puis « Correctif lié à l'incident autorisé ».
- **État** : ✅ recetté (test + démo sur app déployée).

## Scénario 4 — Dérogation accordée et tracée

- **Étant donné** un contrôle en échec pour lequel une dérogation de 2 heures
  est demandée puis accordée,
- **Quand** le contrôle est réévalué pendant la validité de la dérogation,
- **Alors** il passe, et la trace montre qui a demandé, qui a accordé, le motif
  et l'échéance.
- **Test** : `cerveau/test/recette.test.ts` — « recette 4 : dérogation de 2 h
  accordée ⇒ contrôle passe, trace (qui, pourquoi, jusqu'à quand) lisible ».
  Unitaires : `shared/test/waivers.test.ts` (validité, expiration, trace).
  L'assertion « une dérogation expirée entre l'accord et la fusion fait échouer
  le contrôle et le message le dit » n'est pas encore couverte
  (`docs/AUDIT.md` n°69 et n°9).
- **Démo** : étapes « Dérogation demandée », « Dérogation accordée — par
  tech-lead, 2 h », « La dérogation lève la règle visée », puis « Dérogation
  retirée, la règle rebloque ».
- **État** : ✅ recetté (test + démo) ; expiration annoncée dans le message à
  compléter (audit n°9, n°69).

## Scénario 5 — Cerveau injoignable, politique « ouvert »

- **Étant donné** le Cerveau arrêté ou trop lent,
- **Quand** le merge check s'exécute,
- **Alors** avec la politique « ouvert » le contrôle passe avec le message
  « Contexte indisponible, contrôle non concluant » ; avec « fermé », il
  échoue.
- **Test** : `cerveau/test/recette.test.ts` — « recette 5 : Cerveau
  injoignable ⇒ repli « ouvert » passe avec contexte indisponible, « fermé »
  bloque ». Unitaires : `shared/test/format.test.ts` (« repli et réponse
  Bitbucket »), `capteur/test/check.test.ts` (« politique de repli §13.5 »,
  « ne lève jamais »), `capteur/test/bridge-client.test.ts` (délai de 4 s,
  erreurs normalisées).
- **État** : ✅ testé ; le chemin « Cerveau lent » avec un vrai compte à
  rebours reste à jouer (audit n°70).

## Scénario 6 — Rejet des requêtes non valides sur le pont

- **Étant donné** le web trigger du Cerveau exposé,
- **Quand** il reçoit une requête dont la signature HMAC-SHA256 est fausse,
  dont l'horodatage dépasse la fenêtre de 5 minutes, ou dont le nonce a déjà
  été consommé,
- **Alors** la requête est rejetée en 401 et rien n'est évalué ni écrit.
- **Test** : `cerveau/test/recette.test.ts` — « recette 6 : signature fausse
  puis horodatage ancien ⇒ rejet 401 explicite, sans fuite ». Unitaires :
  `shared/test/bridge-sign.test.ts` (signature), `cerveau/test/bridge-handler.test.ts`
  (fenêtre, anti-rejeu, erreurs).
- **Démo** : étape « Requête non signée refusée — HTTP 401 », contre
  l'app de production.
- **État** : ✅ recetté (test + démo sur app déployée).

## Scénario 7 — Parité console de test / contrôle réel

- **Étant donné** un ticket et une branche cible,
- **Quand** la console de test du Cerveau évalue ce couple,
- **Alors** elle renvoie exactement le même verdict et le même message que le
  contrôle réel.
- **Test** : `cerveau/test/recette.test.ts` — « recette 7 : la console de test
  rend le même message que le contrôle réel » (même `EvaluateService` des deux
  côtés, via `cerveau/src/app/evaluate.ts` et `cerveau/src/app/resolvers-ui.ts`).
- **État** : ✅ testé.

## Scénario 8 — Parité outil MCP / carte de PR

- **Étant donné** une PR évaluée dont la carte affiche ses raisons de blocage,
- **Quand** un client MCP appelle `evaluate-merge` avec la même clé de ticket,
- **Alors** l'outil renvoie les mêmes raisons que la carte.
- **Test** : `cerveau/test/recette.test.ts` — « recette 8 : evaluate-merge
  (MCP/Rovo) rend les mêmes raisons que le contrôle réel ». Unitaires :
  `cerveau/test/rovo-actions.test.ts` (les cinq actions : `evaluate-merge`,
  `explain-block`, `list-freezes`, `list-waivers`, `request-waiver`, et le
  prompt de l'agent).
- **Démo** : étape « Carte de PR détaillée — 13 règle(s) exposée(s) » (route
  `card` du pont, celle qu'utilise la carte du Capteur).
- **État** : ✅ testé ; appel par un vrai client MCP à jouer (audit n°42).

## Scénario 9 — Mode observation

- **Étant donné** une règle réglée en mode observation,
- **Quand** une PR enfreint cette règle,
- **Alors** rien n'apparaît dans le message de la PR et l'évaluation figure au
  journal, exploitable par le rapport « ce qui aurait été bloqué ».
- **Test** : `cerveau/test/recette.test.ts` — « recette 9 : mode observation ⇒
  rien dans le message de la PR, évaluation journalisée ». Unitaires :
  `cerveau/test/engine.test.ts` (« evaluateAll — mode observation »),
  `capteur/test/ui-view-models.test.ts` (aucune raison observée dans la carte).
- **Démo** : non jouée en direct (audit n°82).
- **État** : ✅ testé ; démonstration en direct à ajouter (audit n°82).

---

## Couverture des exigences fonctionnelles MC-01 à MC-17

Emplacements réels sur `main` au 2026-11-11. Les limites connues renvoient à
`docs/AUDIT.md` (numéros d'items).

| N° | Exigence (priorité) | Implémentation | Tests | Limites connues |
|---|---|---|---|---|
| MC-01 | Jumelage par code à usage unique (M) | `shared/src/bridge/pairing.ts` (code 10 min), `cerveau/src/bridge/pairing.ts` (route `pair`), `cerveau/src/app/pairing-repo.ts` + `app/secrets.ts` (coffre, référence en base), `capteur/src/pairing/store.ts` | `shared/test/pairing.test.ts`, `cerveau/test/bridge-pairing.test.ts` | écran de jumelage jamais rendu (audit n°4) |
| MC-02 | Contrôle aux 3 déclencheurs (M) | `capteur/manifest.yml` (triggers), `capteur/src/bitbucket/pr.ts`, `capteur/src/index.ts` (`runCheck`) | `capteur/test/pr-parse.test.ts`, `capteur/test/check.test.ts` | jamais exécuté par la plateforme (n°33) ; 2 triggers non joués (n°85) |
| MC-03 | Règles R-01 à R-13 (M) | `cerveau/src/rules/r01-*.ts` … `r13-*.ts`, `engine.ts`, `shared/src/rules/catalog.ts` | `cerveau/test/rules-mvp.test.ts` (R-01→R-07), `rules-sc.test.ts` (R-08→R-13), `engine.test.ts`, `shared/test/catalog.test.ts` | R-10 sans Teamwork Graph (n°15) |
| MC-04 | Message conforme au §9 (M) | `shared/src/message/format.ts`, `strings.ts` | `shared/test/format.test.ts` + recettes 1, 2, 5 | longueur max Bitbucket non validée (n°32) |
| MC-05 | Carte de PR détaillée (M) | `capteur/src/frontend/pr-card.jsx`, `capteur/src/ui/view-models.ts`, route `card` (`cerveau/src/bridge/routes.ts`) | `capteur/test/ui-view-models.test.ts`, `capteur/test/resolvers.test.ts` + démo | écran jamais rendu (n°4, n°37) |
| MC-06 | Niveau, portée, mode par règle (M) | `cerveau/src/ui/view-model-reglages.ts`, `app/resolvers-ui.ts`, table `rule_config` (`cerveau/src/storage/schema.ts`) | `cerveau/test/ui-view-models.test.ts` (`vmReglages`), `storage-memory.test.ts`, `regles-par-defaut.test.ts` | portée non éditable à l'écran (n°6) |
| MC-07 | Dérogations : demander, accorder, refuser, expirer (M) | `shared/src/waivers/resolve.ts`, `cerveau/src/app/waivers.ts`, routes `waiver.request` / `waiver.decide`, table `waiver` | `shared/test/waivers.test.ts` + recette 4 + démo | aucun écran d'accord/refus (n°1) ; demande Jira/Rovo hors PR (n°2) |
| MC-08 | Journal des évaluations (M) | table `evaluation`, `cerveau/src/ui/view-model-journal.ts` | `cerveau/test/ui-view-models.test.ts` (`vmJournal`), `storage-memory.test.ts`, `storage-schema.test.ts` | dérogations absentes du journal (n°14) |
| MC-09 | Console de test sans Bitbucket (M) | `cerveau/src/ui/view-model-console.ts`, `app/resolvers-ui.ts`, `app/evaluate.ts` | recette 7, `cerveau/test/ui-view-models.test.ts` (`vmConsole`) | — |
| MC-10 | Encart ticket (M) | `cerveau/src/ui/view-model-encart.ts`, `cerveau/src/frontend/encart-ticket.jsx` | `cerveau/test/ui-view-models.test.ts` (`vmEncart`) | une seule PR affichée (n°12) |
| MC-11 | Répondre < 5 s (P95) (M) | `cerveau/src/app/evaluate.ts`, `cerveau/src/cache/` (60 s), migrations `storage/migrate.ts` | `cerveau/test/cache.test.ts`, `engine.test.ts` ; mesures réelles : `docs/ETAT.md` (P95 0,83 s), protocole `docs/VALIDATION-PLAN.md` V1 | P95 ni calculé ni affiché au journal (n°8) |
| MC-12 | Correctifs d'incident autorisés, avec trace (S) | `cerveau/src/rules/r05-incident.ts` | `rules-mvp.test.ts` + recette 3 + démo | — |
| MC-13 | Mode observation + rapport (S) | `cerveau/src/rules/engine.ts`, rapport dans `view-model-journal.ts` | `engine.test.ts` + recette 9 | fenêtre non configurable, pas d'export (n°21) |
| MC-14 | Gels : périodes, branches, services, récurrence (S) | `shared/src/freezes/match.ts`, `cerveau/src/rules/r04-gel.ts`, table `freeze` | `shared/test/freezes.test.ts`, `rules-mvp.test.ts` + recette 2 | aucun écran de création de gel (n°7) |
| MC-15 | Règles R-08 à R-11 (S) | `cerveau/src/rules/r08-heures-calmes.ts`, `r09-securite.ts`, `r10-equipe.ts`, `r11-autres-tickets.ts` (R-12, R-13 livrées au-delà du lot) | `cerveau/test/rules-sc.test.ts` | R-10 injouable sans Teamwork Graph (n°15) |
| MC-16 | Statistiques (S) | `cerveau/src/ui/view-model-journal.ts` (volume par verdict, durée moyenne) | `cerveau/test/ui-view-models.test.ts` | ni délai de déblocage, ni dérogations par équipe (n°13) |
| MC-17 | Fichier de règles dans le dépôt (C) | **non implémenté** (lot C) | — | audit n°20 |

**Règle de suivi** : un scénario est « recetté » quand son test est écrit, vert
en CI, **et** la démonstration correspondante a été jouée contre l'app déployée
(`npm run demo`) ou sur l'espace de démonstration (niveaux de `docs/JUDGES.md`).
Les manques restants sont suivis dans `docs/AUDIT.md` sous les numéros cités.
