# Backlog d'audit — 103 manques, et les 10 meilleurs

Relevé du 2026-11-11, établi après le premier déploiement réel et la première
démonstration de bout en bout : ce qui manque pour la soumission Codegeist du
22 décembre 2026. Trois audits croisés (exigences du cahier des charges,
ingénierie, intégration), doublons retirés.

Priorités : **C** = bloque la soumission ou une exigence M du MVP · **H** =
important pour les juges · **M** = amélioration · **B** = nice-to-have.
Efforts : **S** < 1 h · **M** 1-4 h · **L** 4-16 h · **XL** > 16 h.

## Les 10 meilleurs

| # | Manque | P | E | Pourquoi c'est le meilleur rapport impact/effort |
|---|---|---|---|---|
| 1 | **Aucun écran pour accorder ou refuser une dérogation** | C | M | MC-07 est une exigence M du MVP et l'étape 6 du parcours §7.1 (« le tech lead l'accorde ») est aujourd'hui impossible sans passer par le pont signé. La démo ne peut pas montrer l'histoire complète aux juges. |
| 2 | **Une dérogation demandée depuis Jira ou Rovo ne lève jamais un blocage** | C | M | Bogue fonctionnel silencieux : ces demandes sont enregistrées avec `prId: 0` et `repositoryUuid: ''`, alors que le moteur filtre sur la PR. Le produit promet l'inverse. |
| 3 | **Le Capteur n'a jamais tourné dans Bitbucket** | C | S | Un espace de travail Bitbucket Cloud d'équipe est gratuit (5 utilisateurs). Sans lui, le merge check — le cœur du produit — n'a jamais été exécuté par la plateforme. |
| 4 | **Les six écrans, l'agent Rovo et les cinq outils MCP n'ont jamais été rendus** | C | S | Tout est testé en logique pure, jamais affiché. Un écran blanc ou un agent muet le jour du jury annule la démo. Rovo et MCP sont des bonus explicitement visés. |
| 5 | **Soumission non préparée : fiche Marketplace, formulaire Devpost, captures** | C | L | Sans cela il n'y a pas de soumission du tout (§21, semaine du 16 au 22 décembre). Les captures servent à la fois la fiche, Devpost et la vidéo. |
| 6 | **Portée et paramètres des règles non éditables** | H | M | MC-06 dit « régler niveau, portée **et** mode » : seuls niveau et mode ont des sélecteurs. Le parcours §7.3 (« en bloquant sur ce dépôt ») est donc injouable. Le resolver accepte déjà `portee` et `params`. |
| 7 | **Aucune interface pour créer un gel** | H | M | MC-14 (lot S) et le gel est la deuxième raison de blocage du parcours §7.1. Le moteur, la récurrence et le fuseau sont implémentés et testés ; il ne manque que l'écran. |
| 8 | **Le P95 n'est ni calculé ni affiché** | H | M | §16 exige « 95 % des évaluations en moins de 5 s, **mesurées et affichées dans le journal** ». La durée est stockée par évaluation, la moyenne est affichée, le percentile jamais. |
| 9 | **Une dérogation expirée ne le dit pas** | H | S | §17 cas 5 : « le contrôle échoue **et le dit** ». `describeExpiry` et la chaîne `waiver.expired` existent mais sont du code mort : aucun message ne les utilise. |
| 10 | **Pas de limite de débit sur le pont, table des nonces jamais purgée** | H | M | L'URL du web trigger est publique et sans authentification Forge : la signature protège le contenu, pas le volume. Et chaque requête signe un nonce écrit en base pour toujours. |

## Les 93 autres

### Produit et cahier des charges
11. `explain-block` ne rend qu'une évaluation : le §11 promet « les PR du ticket » | H | M
12. L'encart ticket n'affiche qu'une PR, pas la liste des PR du ticket (MC-10) | B | M
13. Statistiques MC-16 incomplètes : ni « délai de déblocage », ni « dérogations par équipe » | H | M
14. Le journal n'affiche pas les dérogations (le §12 écran 7 les prévoit) | M | S
15. R-10 (équipe propriétaire) injouable : aucune lecture du Teamwork Graph | H | L
16. R-05/R-10 : la source n°2 « Teamwork Graph » du §8 n'est intégrée nulle part | H | L
17. R-03 : la source « sous-tâches » est analysée mais aucun adaptateur ne les lit dans Jira | M | M
18. `request-waiver` dit « approbateurs notifiés » : aucune notification réelle n'est émise | M | M
19. Aucune action en lecture seule « qui peut m'accorder une dérogation ? », alors que l'amorce de conversation le promet | M | S
20. MC-17 (`.merge-context.yml` dans le dépôt) : rien, lot C | B | L
21. Rapport d'observation sans fenêtre configurable ni export (§7.3 parle de 30 jours) | B | M
22. Aucun rapport d'observation programmé (généré et poussé chaque semaine) | B | M
23. Les approbateurs sont globaux, pas par projet | B | M
24. Aucune notification Jira quand une PR est bloquée | M | M
25. Le mode observation n'a pas de bascule en masse (« activer partout, bloquer sur ce dépôt ») | M | M

### Cas limites du §17
26. Un ticket déplacé de projet casse R-01 : le cache est indexé par clé, pas par identifiant | M | M
27. Le bandeau « pont coupé » des réglages Bitbucket est absent | H | S
28. La carte ne dit pas que l'évaluation est périmée quand un incident est clos | B | S
29. Aucun test « gel qui commence entre le push et la fusion » (cas 4) | M | S
30. Aucun test « PR issue d'un fork » (cas 8) | B | S
31. `surTicketModifie` n'invalide jamais le cache des incidents du service | M | S
32. La longueur maximale du message Bitbucket n'est pas validée (§15 V3) : le repli « deux raisons » existe mais n'est pas activé | H | S

### Bitbucket (le Capteur)
33. `runCheck` jamais exécuté par la plateforme | C | S
34. Activation des « custom merge checks » par l'admin de l'espace : non faite | C | S
35. `capteur/src/bitbucket/api.ts` sans aucun test | H | M
36. La forme réelle d'une réponse Bitbucket (`participants[]`, `diffstat`) n'est validée contre aucun exemple enregistré | H | M
37. Les trois écrans Bitbucket jamais rendus dans un navigateur | C | S
38. `capteur/src/index.ts` exporte trois fois le même gestionnaire : à valider sur une installation réelle que Forge aiguille par clé | H | S
39. Le contrôle *bloquant* exige l'offre Premium : à dire dans la fiche de soumission, pas seulement dans `docs/ETAT.md` | H | S
40. Aucun test d'intégration du réglage « ne pas envoyer les chemins de fichiers » | M | S

### Rovo et MCP
41. L'agent Rovo jamais interrogé sur le site de démo | C | S
42. Aucun client MCP n'a appelé les cinq outils | C | M
43. `rovo:mcp` est en Preview : disponibilité à vérifier sur le site de démo | H | S
44. Le parcours « agent de code » (§7.4) jamais démontré avec un vrai client | H | M
45. La qualité des réponses de l'agent n'est évaluée nulle part | B | L

### Sécurité
46. `secretsCandidats` essaie tous les secrets : une requête sans `workspaceUuid` peut être validée par le secret d'un autre espace | H | M
47. `requestedBy` et `decidedBy` viennent de la charge utile : la traçabilité du §16 repose sur la bonne foi de l'appelant | H | M
48. Aucun contrôle que le décideur d'une dérogation est vraiment un approbateur habilité | H | M
49. Pas de rotation planifiée du secret partagé | M | M
50. Aucun journal d'audit exportable des décisions de dérogation | M | M
51. La route `health` expose l'état du stockage sans authentification | B | S
52. Aucune documentation de la marche à suivre en cas de fuite du secret | M | S

### Fiabilité, performance, observabilité
53. Aucun délai maximal sur les appels Jira : un Jira lent mange le budget de 5 s | H | M
54. Aucune retentative sur les lectures Jira ou SQL | M | M
55. Pas de disjoncteur : un Jira en panne est rappelé à chaque évaluation | M | M
56. `listSince` n'est pas paginé : le journal croît sans borne | M | M
57. Les tickets d'une PR sont chargés sans borne de concurrence | B | S
58. Aucune mesure par étape (Jira, SQL, règles) pour diagnostiquer un dépassement | M | M
59. Aucun compteur ni métrique exposé (évaluations, blocages, replis) | B | L
60. Les logs ne portent pas d'identifiant de corrélation par évaluation | M | S
61. `health` interroge la base à chaque appel, sans cache | B | S
62. La purge des nonces expirés n'existe pas en base (seulement en mémoire) | H | S

### Tests
63. Aucun test n'exerce `cerveau/src/index.ts` : le branchement manifeste → code n'est vérifié que statiquement | H | M
64. Aucun test n'exerce `capteur/src/index.ts` | H | M
65. Aucun test de contrat entre les deux apps : la forme `CardDetail` a déjà dérivé une fois et cassé la carte | H | M
66. Les adaptateurs Forge (`api.ts`, `reader.ts`, `sql-store.ts`, `forge-storage.ts`) n'ont aucun filet | H | L
67. La couverture de tests n'est pas mesurée en CI | M | S
68. Aucun test de charge ni de tenue des 5 s sur un volume réaliste | M | M
69. Le scénario 4 de la recette n'asserte pas l'expiration de la dérogation | M | S
70. Aucun test du chemin « Cerveau lent » (délai dépassé côté Capteur) avec un vrai compte à rebours | M | S

### Dépôt, CI, outillage
71. Pas de fichier LICENSE sur un dépôt public soumis à un hackathon | C | S
72. Pas de CHANGELOG | B | S
73. Pas de topics GitHub | B | S
74. Pas de CONTRIBUTING.md alors que le dépôt est public | B | M
75. Aucun lint ni formatage automatique du TypeScript (`forge lint` ne valide que le manifeste) | M | M
76. La CI ne vérifie pas les copies `src/shared/` sur l'arbre **fusionné**, seulement sur la PR | M | M
77. Aucun contrôle de schéma du manifeste en CI via `@forge/manifest` (possible sans authentification) | M | M
78. Pas de script `npm run deploy` enchaînant lint, deploy, install, vérification | M | S
79. Rien ne garantit que les deux apps sont déployées avec la même version du contrat | M | M
80. Le CLI Forge exige Node ^22.23.4 alors que le dépôt annonce `>=22` | B | S
81. Aucun verrouillage de la version du CLI Forge utilisée pour déployer | B | S

### Démonstration
82. Le mode observation (§7.3) n'est pas joué par la démonstration | H | M
83. Le gel n'est jamais actif pendant la démo (daté à +3 jours) : le scénario 2 n'est pas montré en direct | H | M
84. R-06 (lien bloquant) et R-07 (version publiée) ne sont pas joués | M | S
85. Les déclencheurs `on-reviewer-status-changed` et `on-merge` ne sont pas joués (MC-02) | M | S
86. L'état s'accumule sur le site de démo : pas de script de réinitialisation | M | S
87. Aucune capture d'écran des six écrans | H | M
88. Le parcours de l'astreinte (§3) n'est pas démontré en tant que tel | B | S
89. Le jeu de démonstration n'a pas de ticket en statut interdit (R-02) ni de version publiée (R-07) jouables en direct | M | S

### Documentation
90. `docs/RECETTE.md` est périmée : elle affirme qu'aucun test n'existe et référence des fichiers inexistants | H | S
91. `docs/ARCHITECTURE.md` ne décrit ni `app/`, ni `seed/`, ni le mode démonstration, ni l'amorçage par variables | M | S
92. `docs/FORGE-API-NOTES.md` ne mentionne pas les contraintes découvertes au déploiement (clé de fonction ≤ 23 caractères, `noEmit` interdit, `jsx: react` imposé) | H | S
93. Pas de diagramme de séquence du jumelage | B | S
94. Pas de guide de dépannage (pont en 500, migrations en échec, app non installée) | M | M
95. Aucun document ne dit comment régénérer l'adresse du pont et le secret après une réinstallation | B | S
96. Pas de guide de contribution pour un développeur externe | B | M

### UX, accessibilité, i18n
97. La langue est figée par la configuration, pas par la langue de l'utilisateur (§16) | M | M
98. Aucun état vide expliqué sur la console de test quand aucune donnée n'est chargée | M | S
99. Aucune confirmation avant les actions qui changent l'état (réinitialiser le repli, neutraliser une dérogation) | M | S
100. Accessibilité des écrans UI Kit non vérifiée (navigation clavier, lecteur d'écran, contrastes) | M | M
101. Aucun onboarding dans l'app (tour guidé au premier lancement) | B | L
102. Les messages d'erreur des resolvers ne distinguent pas « non jumelé » de « Cerveau injoignable » | M | S
103. Aucun suivi d'usage (quelle règle bloque le plus) exposé à l'administrateur | B | L
