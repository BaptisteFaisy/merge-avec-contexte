# Captures d'écran — check-list de travail

> Document de travail **cochable** pour produire, en une passe, l'ensemble des captures de la
> soumission. C'est le détail de `docs/SOUMISSION.md` §D. Les fichiers vont dans `docs/img/`
> (convention de nommage : `docs/img/LISEZ-MOI.md`).
>
> **Qui** : le propriétaire (navigateur authentifié sur le site de démonstration et sur
> l'espace de travail Bitbucket, plus les secrets de production pour la capture 07).
>
> **État global** : **tout est à capturer**. Les captures 01 à 03 dépendent d'un préalable non
> satisfait aujourd'hui (pas d'espace de travail Bitbucket — audit n°3) : ne pas les inventer,
> les marquer « reportées » et faire porter la galerie par les écrans Jira + le terminal.

---

## Étape 0 — Préalables (à faire une seule fois, puis re-cocher « à jour » avant chaque passe)

- [ ] **0-A. Langue des captures.** L'interface de l'app est figée par la configuration
  (locale, défaut `fr` — audit n°97, `cerveau/src/app/config.ts`). Deux options :
    - [ ] **Anglais** (recommandé pour des juges) : poser `locale: 'en'` dans la config et
      redéployer en `development` sur le site de démonstration, puis capturer cet
      environnement.
    - [ ] **Français** (plus simple, en production) : capturer tel quel ; les légendes de la
      galerie Devpost portent alors le contexte en anglais.
- [ ] **0-B. Espace de travail Bitbucket (captures 01–03 uniquement).** Sans lui, elles sont
  impossibles : obtenir un espace partagé (gratuit ≤ 5 utilisateurs), installer le Capteur
  (`forge install -p bitbucket -s bitbucket.org/<espace>`), faire activer les *custom merge
  checks* par un administrateur de l'espace et jumeler les deux apps (code à usage unique).
  Un contrôle **bloquant** nécessite en plus l'offre **Premium** ; sur offre gratuite, le
  contrôle s'exécute et affiche son verdict sans empêcher la fusion — la capture reste
  montrable au niveau « avertissement ».
- [ ] **0-C. Site de démonstration Jira.** Vérifier que `one-atlas-cndz.atlassian.net` répond
  (actif jusqu'au 2027-02-09) et que le Cerveau y est installé (dev et prod).
- [ ] **0-D. Jeu de démonstration rechargé** juste avant la passe (bouton « Charger le jeu de
  démonstration » de la page de réglages du projet). Les dates sont relatives à l'instant du
  chargement : un gel à +3 jours, un incident ouvert depuis 8 h, une dérogation de 90 min —
  recharger pour que la démo reste vraie le jour de la capture.
- [ ] **0-E. Terminal (capture 07).** Disposer de `MAC_BRIDGE_URL` et `MAC_SHARED_SECRET` de
  production ; les exporter dans l'environnement du terminal **sans les afficher** à l'écran
  (la ligne de commande ne doit pas divulguer le secret).

---

## Captures Bitbucket (01–03) — *reportées sans espace de travail*

### 01 · `01-bitbucket-resultat-controle.png` — §12 écran 1
- [ ] **État** : à capturer — impossible sans espace de travail (0-B)
- [ ] **Cadrage exact** : page de PR `feature/PAY-123-limit-attempts` → `main`, liste native
  des merge checks dépliée, le contrôle « Merge avec contexte » visible et en échec, le
  message entier lisible (« Bloqué, 2 raisons. 1) … 2) … »), aucun bandeau/lien tiers à
  l'écran, pas d'onglet de navigateur inutile.
- [ ] **Langue** : anglais (locale de l'espace de travail).
- [ ] **Données avant** : jumelage fait, PAY-123 avec ses deux cases non cochées (côté Jira),
  INC-52 ouvert.
- [ ] **Ranger dans** : `docs/img/01-bitbucket-resultat-controle.png`

### 02 · `02-bitbucket-carte-pr.png` — §12 écran 2
- [ ] **État** : à capturer — impossible sans espace de travail (0-B)
- [ ] **Cadrage exact** : colonne de droite de la même PR, carte « Merge avec contexte »
  ouverte : ticket reconnu `PAY-123`, liste des règles évaluées (13) avec leur niveau et leur
  mode, les raisons du blocage, le lien vers le ticket, le bouton « Demander une dérogation ».
- [ ] **Langue** : anglais.
- [ ] **Données avant** : identiques à 01.
- [ ] **Ranger dans** : `docs/img/02-bitbucket-carte-pr.png`

### 03 · `03-bitbucket-reglages-espace.png` — §12 écran 3
- [ ] **État** : à capturer — impossible sans espace de travail (0-B)
- [ ] **Cadrage exact** : page de réglages de l'espace de travail du Capteur : champ de saisie
  du code de jumelage, état de la liaison **vert**, politique de repli (ouvert/fermé), mention
  de la désactivation possible de l'envoi des chemins de fichiers.
- [ ] **Langue** : anglais.
- [ ] **Données avant** : jumelage effectué (liaison verte).
- [ ] **Ranger dans** : `docs/img/03-bitbucket-reglages-espace.png`

---

## Captures Jira (04–06b) — *faisables dès aujourd'hui*

### 04 · `04-jira-reglages-projet.png` — §12 écran 4
- [ ] **État** : à capturer (faisable)
- [ ] **Cadrage exact** : page « Merge avec contexte » des réglages du projet : les règles
  (13 lignes avec niveau et mode), le ou les gels, la correspondance dépôt → service, les
  approbateurs, la génération du code de jumelage, et le bouton « Charger le jeu de
  démonstration ».
- [ ] **Langue** : selon 0-A.
- [ ] **Données avant** : jeu de démonstration chargé (0-D), au moins un gel et une ligne de
  correspondance présents.
- [ ] **Ranger dans** : `docs/img/04-jira-reglages-projet.png`

### 05 · `05-jira-encart-ticket.png` — §12 écran 5
- [ ] **État** : à capturer (faisable)
- [ ] **Cadrage exact** : page du ticket `PAY-123`, encart « Merge avec contexte » visible :
  la PR connue, la dernière évaluation (bloquée, 2 raisons), les dérogations en cours.
- [ ] **Langue** : selon 0-A.
- [ ] **Données avant** : une dérogation accordée sur PAY-123 peut être montrée en plus (passer
  par la console/le pont), puis l'enlever pour montrer l'état bloqué.
- [ ] **Ranger dans** : `docs/img/05-jira-encart-ticket.png`

### 06 · `06-jira-console-test.png` — §12 écran 6
- [ ] **État** : à capturer (faisable)
- [ ] **Cadrage exact** : page « Merge avec contexte — console et journal » : ticket `PAY-123`,
  branche cible `main`, avoir cliqué « Évaluer », le verdict et le message exact affichés
  (« Bloqué, 2 raisons. 1) PAY-123 : 2 critère(s)… 2) Incident INC-52… »).
- [ ] **Langue** : selon 0-A (la console rend le même message que le vrai contrôle — §18 scénario 7).
- [ ] **Données avant** : jeu chargé (0-D).
- [ ] **Ranger dans** : `docs/img/06-jira-console-test.png`

### 06b · `06b-jira-journal.png` — §12 écran 7 (même page que la console)
- [ ] **État** : à capturer (faisable)
- [ ] **Cadrage exact** : faire défiler la même page jusqu'au journal : lignes d'évaluation
  datées avec verdict et durée, blocages et dérogations visibles.
- [ ] **Langue** : selon 0-A.
- [ ] **Données avant** : avoir lancé au moins deux évaluations sur la console pour peupler le
  journal.
- [ ] **Ranger dans** : `docs/img/06b-jira-journal.png`

---

## Sortie du script de démonstration (07)

### 07 · `07-terminal-demo-e2e.png` — sortie de `npm run demo`
- [ ] **État** : à capturer (faisable — nécessite 0-E)
- [ ] **Cadrage exact** : un terminal propre, police lisible, **secret jamais visible** à
  l'écran ; la sortie complète du script avec les onze `OK` et le « Démonstration réussie »,
  en particulier « Requête non signée refusée — HTTP 401 » (preuve du pont signé).
- [ ] **Langue** : pour une sortie en anglais, `MAC_LOCALE=en` (défaut `fr`) ; la sortie
  française de `docs/DEMO-E2E.md` est la référence de contenu.
- [ ] **Données avant** : jeu de démonstration chargé en production (0-D), pont joignable.
- [ ] **Ranger dans** : `docs/img/07-terminal-demo-e2e.png`

---

## Captures bonus (visées par les bonus Rovo et MCP)

### 08 · `08-jira-agent-rovo.png` — agent Rovo (bonus)
- [ ] **État** : à capturer si possible (bonus) — premier essai en conditions réelles (audit n°41)
- [ ] **Cadrage exact** : conversation Rovo avec l'agent « Merge avec contexte » : question
  « Why is the PR for PAY-123 blocked? », réponse citant les règles et les levées.
- [ ] **Langue** : anglais.
- [ ] **Ranger dans** : `docs/img/08-jira-agent-rovo.png`

### 09 · `09-terminal-client-mcp.png` — appel MCP (bonus)
- [ ] **État** : à capturer si possible (bonus) — premier appel depuis un vrai client (audit n°42)
- [ ] **Cadrage exact** : un client MCP appelant `evaluate-merge` avec « PAY-123 » et « main »,
  et la réponse (règles, raisons, dérogations possibles) alignée sur la carte de PR.
- [ ] **Langue** : anglais.
- [ ] **Ranger dans** : `docs/img/09-terminal-client-mcp.png`

---

## Ordre conseillé de la passe et montage de la galerie

1. Charger le jeu de démonstration (0-D), recharger juste avant la capture.
2. Capturer 04, 05, 06, 06b, puis 07, 08, 09 (écrans qui ne dépendent que du site de démo).
3. Si l'espace de travail Bitbucket est prêt, recharger le jeu et capturer 01, 02, 03.
4. Galerie Devpost : 04 → 05 → 06 → 06b → 07 (ordre de lecture du produit), bonus 08/09 après ;
   01 → 02 → 03 en tête si disponibles.
5. Fiche Marketplace : 04–06 pour le Cerveau, 01–03 pour le Capteur (ou un placeholder
   honnête si elles sont reportées).

## Après la passe

- [ ] Vérifier qu'aucune image ne contient de secret (repasser 07 ligne par ligne).
- [ ] Vérifier la convention de nommage (`docs/img/LISEZ-MOI.md`) et la largeur (≥ 1600 px).
- [ ] Committer les images (PR « docs : captures de soumission ») et référencer les fichiers
  dans Devpost et les deux fiches Marketplace.
- [ ] Si 01–03 sont reportées, le dire dans la fiche (le texte de `docs/SOUMISSION.md` le fait
  déjà) : ne jamais présenter une capture qui n'a pas été prise.