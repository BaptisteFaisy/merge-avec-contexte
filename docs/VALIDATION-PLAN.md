# Plan de validation technique — première semaine

Les six points du §15 du cahier des charges « à valider par un prototype la première
semaine ». Chacun conditionne une décision d'architecture ; aucun ne doit traîner au-delà
de la semaine 1, sous peine de bloquer le plan jusqu'au 22 décembre (§21).

## Tableau récapitulatif

| # | Point à valider | Pourquoi c'est critique | Critère de succès | Repli si échec | Suivi |
|---|---|---|---|---|---|
| V1 | Durée maximale d'exécution d'un merge check | Borne tout le pont (lecture PR + aller-retour signé + évaluation) | P95 < 5 s, aucune exception de timeout en 100 runs | Viser 5 s ; cache agressif côté Cerveau | [ ] |
| V2 | Appel d'un web trigger depuis une app Bitbucket | C'est le pont lui-même ; sans lui, pas de deux apps | 100/100 requêtes signées aboutissent, réponse < 2 s | Compte de service + jeton d'API Jira saisis par l'administrateur | [ ] |
| V3 | Longueur maximale du message affiché | Conditionne le format du message de blocage (§9) | Message de 2 raisons + pied de page affiché intégralement, sans troncature | 2 raisons au plus dans le message, le reste dans la carte | [ ] |
| V4 | Offre requise pour un contrôle obligatoire | Conditionne la démo du blocage réel (vidéo, niveau B des juges) | Contrôle obligatoire actif sur l'espace de démo, fusion bloquée | Essai Premium sur l'espace de travail de démonstration | [ ] |
| V5 | Global Apps : connexion Bitbucket disponible ? | Supprimerait le pont (une seule app au lieu de deux) | Réponse documentée : disponible / indisponible à la date du test | Garder les deux apps (conception actuelle) | [ ] |
| V6 | Lecture des cases cochées dans une description Jira | Cœur de la règle R-03 (critères d'acceptation) | Cases extraites avec un taux de réussite de 100 % sur 20 tickets variés | Champ personnalisé ou sous-tâches comme source des critères | [ ] |

## Méthode de mesure des 5 secondes (V1)

- Instrumentation : chaque évaluation écrite par le Cerveau dans la table `evaluation`
  porte la colonne `duration_ms`, mesurée **côté Cerveau** (de la réception de la requête
  signée à l'envoi du verdict) ; le Capteur mesure en complément le temps total
  (déclencheur Bitbucket → réponse au merge check) et le journalise.
- Protocole : 100 évaluations réparties sur 3 jours (cache froid inclus : 20 évaluations
  après purge du `issue_cache`), déclenchées via la console de test et via de vraies PR.
- Calcul du percentile 95 : requête SQL Forge sur `evaluation`, par exemple
  `SELECT duration_ms FROM evaluation ORDER BY duration_ms` puis lecture de la valeur au
  rang `ceil(0.95 × n)` ; ou agrégation côté page Journal.
- Seuil : **P95 < 5 000 ms** (exigence MC-11), avec P50 visé < 1 500 ms. Le résultat est
  affiché dans la page Journal (exigence non fonctionnelle « Rapidité », §16).

---

## V1 — Durée maximale d'exécution d'un merge check

- **Objectif** : connaître la borne réelle imposée par Bitbucket au module de merge check
  (la documentation ne la donne pas) et vérifier que notre chaîne complète tient dedans.
- **Protocole** :
  1. Déployer un Capteur minimal (`forge deploy`, `forge install` sur un espace partagé)
     dont la fonction de merge check dort un temps paramétrable (`await sleep(n)`).
  2. Binary search empirique : runs à 5 s, 10 s, 30 s, 50 s, 60 s (le web trigger est borné
     à 55 s ; le merge check peut l'être moins) — 10 runs par palier.
  3. Noter le palier où Bitbucket marque le check en échec / timeout, et le message exact.
  4. En parallèle, mesurer la chaîne réelle (lecture PR + pont + évaluation) sur 100 runs.
- **Critère de succès** : la borne est documentée (valeur + comportement en cas de dépassement)
  et la chaîne réelle tient **P95 < 5 s** avec une marge ≥ 2× sur la borne observée.
- **Repli** : si la chaîne dépasse, cache agressif (évaluation servie entièrement depuis
  `issue_cache` + SQL, zéro appel Jira direct) ; si la borne est < 5 s, évaluation en deux
  temps : verdict rapide sur cache, détail asynchrone dans la carte.
- [ ] Validé le : ____________ — borne observée : ____________

## V2 — Appel d'un web trigger depuis une app Bitbucket

- **Objectif** : prouver que le Capteur peut joindre le Cerveau (fetch backend vers
  `*.webtrigger.atlassian.app`) depuis une app Bitbucket, avec la signature.
- **Protocole** :
  1. Déployer un Cerveau minimal exposant un `webtrigger` qui répond `pong` et vérifie
     l'empreinte HMAC-SHA256 (corps + horodatage + nonce).
  2. Depuis le Capteur : 100 requêtes (50 dans un contexte de merge check, 50 dans un
     contexte de carte de PR / page de réglages), mesurer latence et taux de succès.
  3. Tester les rejets : signature fausse, horodatage > 5 min, nonce rejoué.
- **Critère de succès** : 100/100 succès légitimes, 100 % de rejets illégitimes,
  latence P95 < 2 s dans le contexte merge check.
- **Repli** : compte de service Jira + jeton d'API saisi par l'administrateur dans les
  réglages du Capteur (le pont devient un appel REST Jira classique ; perte : l'absence
  d'identifiants long-lived).
- [ ] Validé le : ____________ — taux de succès : ____________

## V3 — Longueur maximale du message affiché

- **Objectif** : connaître la troncature éventuelle du champ `message` renvoyé par le
  merge check, pour figer le format du §9.
- **Protocole** :
  1. Depuis le Capteur de test, renvoyer des messages de longueurs croissantes
     (100, 250, 500, 1 000, 2 000, 4 000 caractères), avec un marqueur de fin unique.
  2. Ouvrir une PR de test, observer l'affichage dans la liste des merge checks : le
     marqueur de fin est-il visible ? À partir de quelle longueur est-il coupé ?
  3. Vérifier aussi le rendu des sauts de ligne et des guillemets typographiques.
- **Critère de succès** : le message cible (nombre de raisons + 2 lignes de raisons +
  pied « carte à droite », ~250 caractères) s'affiche intégralement ; la limite exacte
  est documentée.
- **Repli** : deux raisons au maximum dans le message (« et 1 autre raison : voir la
  carte »), le détail complet bascule dans la carte de PR.
- [ ] Validé le : ____________ — limite observée : ____________

## V4 — Offre requise pour un contrôle obligatoire

- **Objectif** : confirmer (support Atlassian : offre Premium requise) et obtenir un
  environnement où le blocage réel est démontrable pour la vidéo et les juges.
- **Protocole** :
  1. Sur un espace de travail partagé Standard : activer les merge checks personnalisés,
     constater ce qui est proposé (obligatoire / informatif) pour notre contrôle.
  2. Ouvrir un essai Premium sur l'espace de démonstration ; reconfigurer le contrôle en
     obligatoire sur `main`.
  3. Tenter une fusion avec un check en échec : Bitbucket la refuse-t-il réellement ?
- **Critère de succès** : avec Premium, une fusion est refusée tant que le check échoue ;
  le niveau d'offre minimal est documenté avec captures.
- **Repli** : essai Premium sur l'espace de démonstration pour la vidéo ; hors Premium,
  l'app reste utile en avertissement (message + carte), ce que la documentation juges
  mentionne explicitement.
- [ ] Validé le : ____________ — offre de l'espace de démo : ____________

## V5 — Global Apps : connexion Bitbucket disponible ?

- **Objectif** : savoir si la connexion Bitbucket pour les apps multi-produits (programme
  d'accès anticipé « Global Apps ») est ouverte avant le 22 décembre ; si oui, les deux
  apps peuvent fusionner (le pont disparaît, la conception reste valable).
- **Protocole** :
  1. Vérifier la page de compatibilité multi-apps de la documentation Forge et la page du
     programme Global Apps (état d'accès : fermé / liste d'attente / GA).
  2. Tenter un `forge deploy` d'une app de test combinant un scope Bitbucket et un scope
     Jira ; noter l'erreur exacte du déploiement.
  3. Si un accès anticipé est demandable : déposer la demande immédiatement.
  4. Re-vérifier chaque lundi jusqu'au gel des fonctionnalités.
- **Critère de succès** : réponse binaire documentée (« disponible le JJ/MM, nous
  fusionnons » ou « indisponible, nous gardons les deux apps ») avec la source.
- **Repli** : garder les deux apps et le pont signé — c'est la conception par défaut,
  aucune dépendance au calendrier d'Atlassian.
- [ ] Validé le : ____________ — verdict : ____________

## V6 — Lecture des cases cochées dans une description Jira

- **Objectif** : confirmer que R-03 peut lire les cases à cocher (`* [ ]` / `* [x]` ou
  équivalent ADF) dans la description d'un ticket, source par défaut des critères
  d'acceptation.
- **Protocole** :
  1. Créer 20 tickets de test : descriptions avec cases cochées/non cochées, cases dans
     des panneaux ou tableaux, descriptions vides, descriptions avec listes simples.
  2. Depuis le Cerveau, lire chaque description via l'API Jira et extraire les états des
     cases ; comparer au résultat attendu.
  3. Vérifier aussi la voie « événement » : cocher une case déclenche-t-il bien le trigger
     qui rafraîchit `issue_cache` ?
- **Critère de succès** : 100 % d'extraction correcte sur les 20 tickets ; le refresh par
  événement fonctionne (cache à jour < 60 s après modification).
- **Repli** : source alternative paramétrable de R-03 — champ personnalisé « critères
  d'acceptation » ou sous-tâches dédiées (le paramétrage « où les lire » est déjà prévu
  au catalogue des règles).
- [ ] Validé le : ____________ — taux d'extraction : ____________

---

## Règle de clôture

Un point n'est « validé » que rempli dans ce fichier : date, mesure, décision (poursuivre
ou activer le repli). Toute décision de repli activée est reportée dans
`docs/ARCHITECTURE.md` (section concernée) et dans le journal d'avancement.
