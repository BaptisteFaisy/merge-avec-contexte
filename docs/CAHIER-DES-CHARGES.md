# Merge avec contexte — cahier des charges

> Codegeist 2026 · catégorie **Apps for Software Teams**
> Bonus visés : Agents Rovo, MCP, Teamwork Graph, Marketplace
> Version 1 du 11 novembre 2026 · soumission avant le mardi 22 décembre 2026, 21 h (Paris)

## 1. L'idée en une phrase

Un merge check Bitbucket qui regarde le travail et pas seulement le code : il vérifie le ticket lié, le calendrier et l'état des services, puis bloque ou avertit en expliquant pourquoi et comment débloquer.

## 2. Le problème

Les contrôles avant fusion portent presque tous sur le code : build vert, nombre d'approbations, tâches résolues. Aucun ne sait répondre à ces questions :

- Le ticket lié est-il vraiment prêt ? Deux critères d'acceptation ne sont pas cochés.
- Est-ce le bon moment ? Un gel de déploiement commence dans une heure.
- Le service visé est-il sain ? Un incident est ouvert dessus depuis ce matin.
- Ce ticket dépend-il d'un autre, pas encore livré ?

Ces informations vivent dans Jira et JSM. Le développeur qui clique sur « Merge » ne les a pas sous les yeux, et la fusion part.

Les équipes compensent par des règles orales (« on ne merge pas le vendredi »), que personne ne peut vérifier ni tracer.

## 3. Utilisateurs

| Qui | Moment | Attente |
|---|---|---|
| Développeur | En ouvrant puis en fusionnant sa PR | Savoir tôt ce qui bloquera, et comment le lever |
| Relecteur | Pendant la revue | Voir le contexte du ticket sans quitter la PR |
| Responsable de release, tech lead | Réglage des règles, dérogations | Des règles applicables, des exceptions tracées |
| Astreinte | Pendant un incident | Que rien ne parte sur le service en panne, sauf le correctif |
| Agent de code | Avant d'ouvrir ou de fusionner une PR | Savoir s'il a le droit de fusionner, par un outil |

## 4. Vocabulaire du produit

- **Règle** : une condition sur le contexte (« pas d'incident ouvert sur le service »). Elle a un niveau : bloquant, avertissement ou information.
- **Évaluation** : le résultat des règles pour une PR à un instant donné.
- **Gel** : une période pendant laquelle certaines branches ou certains services ne reçoivent pas de fusion.
- **Dérogation** : une exception accordée à une PR, pour une règle, par une personne habilitée, avec motif et durée.
- **Mode observation** : la règle est évaluée et journalisée, mais rien n'est montré ni bloqué.
- **Capteur** : l'app côté Bitbucket. **Cerveau** : l'app côté Jira.

## 5. La contrainte qui structure tout

**Une app Forge ne peut pas appeler à la fois Bitbucket et Jira.** Une app Bitbucket s'installe sur un espace de travail, une app Jira sur un site. Un fil de la communauté d'avril 2024 rapporte que le déploiement refuse de mélanger les deux familles de scopes, et la page actuelle de compatibilité multi-apps ne cite que Jira et Confluence. Bitbucket y est annoncé dans le programme d'accès anticipé « Global Apps », sans date. C'est le premier point à reconfirmer (§ 15).

Le produit est donc fait de **deux apps Forge jumelées** :

| | Capteur (Bitbucket) | Cerveau (Jira) |
|---|---|---|
| Rôle | Recevoir le merge check, lire la PR, afficher le résultat | Évaluer les règles, stocker, expliquer, déroger |
| Modules | Merge check, carte de PR, page de réglages de l'espace de travail | Page de réglages, encart ticket, agent Rovo, actions, MCP, web trigger, SQL |
| Données | Aucune donnée durable | Règles, gels, dérogations, journal |

Les deux communiquent par un **web trigger signé** exposé par le Cerveau.

Si la connexion Bitbucket des Global Apps devient disponible avant le 22 décembre, les deux apps peuvent fusionner ; la conception ci-dessous reste valable, le pont en moins.

## 6. Périmètre

Priorités : **M** = indispensable pour la soumission, **S** = souhaitable, **C** = après le hackathon.

| Lot | Contenu |
|---|---|
| MVP (22 décembre) | Jumelage des deux apps, sept règles, niveaux par règle, message explicatif, carte dans la PR, dérogations, journal, console de test sans Bitbucket, agent Rovo et outils MCP |
| V1 | Mode observation avec rapport sur 30 jours, calendrier des gels complet, voie rapide pour les correctifs d'incident, règles par chemin de fichier |
| Vision | Règles déclarées dans le dépôt, règles suggérées par l'historique, évaluation continue des PR ouvertes |

## 7. Parcours détaillés

### 7.1 Une fusion bloquée

1. Léa pousse un commit sur la PR #42, branche `feature/PAY-123-limite-tentatives`.
2. Le merge check s'exécute. Le Capteur lit la PR, en extrait la clé `PAY-123` et interroge le Cerveau.
3. Deux règles échouent. La PR affiche : « Bloqué, 2 raisons. PAY-123 : 2 critères d'acceptation non cochés. Gel "Black Friday" sur main jusqu'au 30/11 à 9 h. »
4. La carte latérale de la PR détaille chaque raison, avec un lien vers le ticket et la marche à suivre.
5. Léa coche les critères après vérification. Elle relance le contrôle : il reste le gel.
6. Elle demande une dérogation depuis la carte. Le tech lead l'accorde pour 2 heures, motif « correctif de prix avant l'ouverture ».
7. Au clic sur « Merge », le contrôle est réévalué une dernière fois : il passe. La dérogation est tracée.

### 7.2 Pendant un incident

Un incident s'ouvre sur `checkout-api`. Toute PR qui cible ce service est bloquée, sauf celles dont le ticket est lié à l'incident : celles-là passent, avec la mention « correctif d'incident INC-52 ».

### 7.3 Avant d'activer une règle

L'administratrice met la règle « critères d'acceptation » en mode observation. Trois semaines plus tard, le rapport indique : 212 fusions observées, 31 auraient été bloquées, dont 24 sur un seul dépôt. Elle active la règle en avertissement partout, en bloquant sur ce dépôt.

### 7.4 Un agent de code

Avant de fusionner, l'agent appelle l'outil `evaluate-merge` avec la clé du ticket. Il reçoit les deux raisons de blocage et s'arrête au lieu de tenter la fusion.

## 8. Catalogue des règles

| Code | Règle | Paramètres | Niveau par défaut | Lot |
|---|---|---|---|---|
| R-01 | La PR est reliée à un ticket Jira existant | Motif de clé, exceptions par branche | Avertissement | M |
| R-02 | Le ticket est dans un statut autorisé | Liste de statuts | Bloquant | M |
| R-03 | Les critères d'acceptation sont validés | Où les lire : cases cochées dans la description, champ, sous-tâches | Bloquant | M |
| R-04 | Aucun gel en cours sur la branche cible | Calendrier des gels | Bloquant | M |
| R-05 | Aucun incident ouvert sur le service touché | Projets JSM, correspondance dépôt → service | Bloquant | M |
| R-06 | Le ticket n'est pas bloqué par un ticket ouvert | Types de liens | Bloquant | M |
| R-07 | La version cible du ticket n'est pas déjà publiée | — | Avertissement | M |
| R-08 | Heures calmes : pas de fusion sur la branche principale hors plage | Jours, heures, fuseau | Avertissement | S |
| R-09 | Revue de sécurité approuvée si le ticket la réclame | Étiquette ou champ | Bloquant | S |
| R-10 | Un membre de l'équipe propriétaire du service a approuvé | Teamwork Graph : équipe → composant | Avertissement | S |
| R-11 | La PR ne référence pas d'autres tickets que le sien | Analyse des messages de commit | Information | S |
| R-12 | Fichiers sensibles : un plan de retour arrière est joint au ticket | Motifs de chemins (`migrations/**`) | Avertissement | C |
| R-13 | Les dépendances amont sont livrées | Liens « dépend de », statut ou version | Avertissement | C |

Pour chaque règle, l'administrateur choisit : niveau, dépôts et branches concernés, mode observation ou actif.

### Relier un dépôt à un service

Les règles R-05 et R-10 ont besoin de savoir quel service un dépôt alimente. Sources, dans l'ordre :

1. Table de correspondance tenue dans les réglages du Cerveau (dépôt → service ou composant Jira).
2. Relations du Teamwork Graph entre service, dépôt et composant, lues côté Jira.

Sans correspondance, R-05 ne bloque pas et le dit : « service inconnu pour ce dépôt, règle non évaluée ».

### Extraire le ticket

La clé est cherchée dans le nom de la branche source, puis le titre de la PR, puis les messages de commit. Plusieurs clés trouvées : toutes sont évaluées, la plus stricte l'emporte.

## 9. Le message de blocage

Bitbucket n'affiche qu'un texte par contrôle. Sa qualité fait la différence entre un garde-fou et une gêne.

Format imposé :

```
Bloqué, 2 raisons.
1) PAY-123 : 2 critères d'acceptation non cochés.
2) Gel « Black Friday » sur main jusqu'au 30/11, 9 h.
Détail et dérogation : carte « Merge avec contexte » à droite.
```

Règles de rédaction :

- Le nombre de raisons d'abord, puis une ligne par raison, la plus grave en premier.
- Chaque ligne nomme l'objet (ticket, gel, incident) et l'action attendue.
- Jamais de jargon interne (« R-03 a échoué »).
- En cas de succès avec avertissements : « Autorisé, 1 avertissement : … ».
- Si le Cerveau ne répond pas : « Contexte indisponible, contrôle non concluant » et application de la politique de repli (§ 13).

## 10. Exigences fonctionnelles

| N° | Exigence | Priorité |
|---|---|---|
| MC-01 | Jumeler une installation Bitbucket et une installation Jira par un code à usage unique | M |
| MC-02 | Exécuter le contrôle aux trois déclencheurs : push, changement d'avis d'un relecteur, tentative de fusion | M |
| MC-03 | Évaluer les règles R-01 à R-07 | M |
| MC-04 | Renvoyer un message conforme au § 9 | M |
| MC-05 | Afficher le détail dans une carte de la PR | M |
| MC-06 | Régler niveau, portée et mode de chaque règle | M |
| MC-07 | Demander, accorder, refuser et faire expirer une dérogation | M |
| MC-08 | Journaliser chaque évaluation et chaque dérogation | M |
| MC-09 | Console de test dans Jira : simuler une PR sur un ticket, sans Bitbucket | M |
| MC-10 | Afficher sur le ticket l'état de ses PR vis-à-vis des règles | M |
| MC-11 | Répondre en moins de 5 s dans 95 % des cas | M |
| MC-12 | Laisser passer les correctifs liés à un incident ouvert, avec trace | S |
| MC-13 | Mode observation et rapport « ce qui aurait été bloqué » | S |
| MC-14 | Calendrier des gels : périodes, branches, services, récurrence | S |
| MC-15 | Règles R-08 à R-11 | S |
| MC-16 | Statistiques : raisons de blocage, dérogations par équipe, délai de déblocage | S |
| MC-17 | Fichier de règles dans le dépôt, borné par les règles de l'espace de travail | C |

## 11. Agent Rovo et outils MCP (côté Jira)

### Agent « Merge avec contexte »

- « Pourquoi la PR de PAY-123 est-elle bloquée ? »
- « Puis-je fusionner PAY-123 maintenant ? »
- « Quels gels sont prévus cette semaine ? »
- « Qui peut m'accorder une dérogation ? »

### Actions, aussi exposées par `rovo:mcp`

| Clé | Verbe | Entrées | Retour |
|---|---|---|---|
| `evaluate-merge` | GET | `issueKey`, `targetBranch`, `repository` (optionnels) | Évaluation à blanc : règles, raisons, levées possibles |
| `explain-block` | GET | `issueKey` | Dernière évaluation réelle des PR du ticket |
| `list-freezes` | GET | `days` | Gels en cours et à venir |
| `list-waivers` | GET | `issueKey` | Dérogations en cours |
| `request-waiver` | CREATE | `issueKey`, `ruleCode`, `reason`, `hours` | Demande enregistrée, approbateurs notifiés |

`evaluate-merge` est l'outil clé pour les agents de code : il leur donne la réponse avant qu'ils ne tentent la fusion.

## 12. Écrans

**Côté Bitbucket (Capteur)**

1. **Résultat du contrôle** dans la liste native des merge checks de la PR.
2. **Carte de PR** dans la colonne de droite : ticket reconnu, règles évaluées, raisons, bouton « Demander une dérogation », lien vers le ticket.
3. **Page de réglages de l'espace de travail** : saisie du code de jumelage, état de la liaison, politique de repli.

**Côté Jira (Cerveau)**

4. **Réglages du projet** : règles, gels, correspondance dépôt → service, approbateurs, code de jumelage.
5. **Encart sur le ticket** : PR connues, dernière évaluation, dérogations.
6. **Console de test** : choisir un ticket et une branche cible, obtenir l'évaluation et le message exact.
7. **Page « Journal »** : évaluations, blocages, dérogations, rapport d'observation.

## 13. Architecture

### 13.1 Les deux manifestes

```yaml
# Capteur — app Bitbucket (esquisse, à valider avec forge lint)
modules:
  bitbucket:mergeCheck:
    - key: context-check
      name: Merge avec contexte
      function: runCheck
      triggers: [on-code-pushed, on-reviewer-status-changed, on-merge]
  # carte de PR et page de réglages : clés exactes à relever dans la référence des modules
permissions:
  scopes: [read:pullrequest:bitbucket, read:repository:bitbucket, storage:app]
  external:
    fetch:
      backend: ['*.webtrigger.atlassian.app']
```

```yaml
# Cerveau — app Jira
modules:
  webtrigger:
    - key: bridge
      function: handleBridge
      urlFormat: v2
      response: { type: dynamic }
  jira:projectSettingsPage:
  jira:issueContext:
  jira:projectPage:
  rovo:agent:
  action:
  rovo:mcp:
  trigger:      # événements de tickets et de liens, pour tenir le cache à jour
  sql:
```

### 13.2 Déroulement d'un contrôle

1. Bitbucket appelle le Capteur avec l'identifiant de l'espace de travail, du dépôt et de la PR, le type de déclencheur et, à la fusion, le message de commit et la stratégie.
2. Le Capteur lit la PR : titre, branches, commits, relecteurs, liste des fichiers modifiés.
3. Il extrait les clés de tickets.
4. Il envoie au Cerveau une requête signée : clés, dépôt, branche cible, chemins modifiés, relecteurs, déclencheur.
5. Le Cerveau évalue les règles à partir de son cache et de lectures Jira, applique les dérogations, enregistre l'évaluation, renvoie le verdict et le détail.
6. Le Capteur renvoie `success` et `message` à Bitbucket, et garde le détail pour la carte.

Le déclencheur « tentative de fusion » garantit une évaluation fraîche au dernier moment : c'est lui qui rattrape un incident ouvert après le dernier push.

### 13.3 Le pont signé

- **Jumelage.** L'administrateur Jira génère un code valable 10 minutes. L'administrateur Bitbucket le saisit. Le Capteur appelle le Cerveau avec ce code ; les deux côtés enregistrent alors un secret partagé et l'adresse du web trigger. Le secret est rangé dans le stockage de secrets de Forge.
- **Signature.** Chaque requête porte une empreinte HMAC-SHA256 du corps, un horodatage et un numéro unique. Le Cerveau rejette toute requête de plus de 5 minutes ou déjà vue.
- **Sobriété.** Aucun code source ne quitte Bitbucket : seulement des métadonnées de PR. L'envoi des chemins de fichiers est désactivable.
- **Rotation.** Un nouveau jumelage remplace le secret ; l'ancien est invalidé.

Un web trigger n'a aucune authentification par défaut : la signature n'est pas une option.

### 13.4 Tenir les 5 secondes

- Le Cerveau tient un cache par ticket (statut, critères, liens, version) et par service (incidents ouverts), mis à jour par les événements Jira.
- Les gels et les dérogations sont lus en base.
- Une évaluation n'appelle Jira en direct que si le cache du ticket a plus de 60 secondes.

### 13.5 Politique de repli

Si le Cerveau est injoignable ou trop lent, l'administrateur a choisi d'avance :

- **Ouvert** (défaut) : le contrôle passe avec le message « contexte indisponible ».
- **Fermé** : le contrôle échoue ; à réserver aux branches critiques.

Chaque repli est journalisé.

## 14. Modèle de données (Forge SQL, côté Jira)

| Table | Colonnes principales |
|---|---|
| `pairing` | id, workspace_uuid, secret_ref, paired_at, paired_by |
| `rule_config` | project_id, rule_code, level, mode, scope_json, params_json |
| `freeze` | id, name, starts_at, ends_at, branches, services, recurrence, created_by |
| `repo_service` | workspace_uuid, repo_uuid, service, jira_component |
| `evaluation` | id, workspace_uuid, repo_uuid, pr_id, issue_keys, trigger, verdict, reasons_json, evaluated_at, duration_ms |
| `waiver` | id, pr_id, repo_uuid, rule_code, requested_by, granted_by, reason, expires_at, status |
| `issue_cache` | issue_id, status, criteria_json, blockers_json, fix_version, updated_at |
| `service_incident` | service, incident_key, opened_at, resolved_at |

## 15. Contraintes vérifiées et points à valider

### Vérifié dans la documentation (10 et 11 novembre 2026)

- Module `bitbucket:mergeCheck` : déclencheurs `on-code-pushed`, `on-reviewer-status-changed`, `on-merge` ; réponse `success` (booléen) et `message` (texte) ; une exception vaut échec.
- Le contrôle reçoit les identifiants de l'espace de travail, du dépôt et de la PR, pas son contenu : il faut relire la PR par l'API.
- Un administrateur de l'espace de travail doit activer les merge checks personnalisés, puis choisir pour chaque contrôle la branche cible et son caractère obligatoire.
- D'après le support Atlassian, rendre un contrôle **obligatoire** et l'administrer au niveau projet ou espace de travail demande l'offre Premium. Sur les autres offres, le contrôle informe sans bloquer.
- Les merge checks personnalisés ne sont pas proposés aux espaces de travail personnels.
- Un utilisateur peut relancer individuellement un contrôle en échec.
- Événements Bitbucket disponibles : création, mise à jour, fusion et refus de PR, commentaires de PR, changement d'avis d'un relecteur.
- Web trigger : adresse propre à chaque installation, aucune authentification par défaut, 55 s au plus.
- Le site de démonstration fourni par `forge site provision` contient Jira, Confluence, JSM, Rovo et Studio. Bitbucket n'est pas mentionné.

### À valider par un prototype la première semaine

| Point | Pourquoi | Solution de repli |
|---|---|---|
| Durée maximale d'exécution d'un merge check | La doc ne la donne pas ; elle borne tout le pont | Viser 5 s ; cache agressif |
| Appel d'un web trigger depuis une app Bitbucket | C'est le pont lui-même | Compte de service et jeton d'API Jira saisis par l'administrateur |
| Longueur maximale du message affiché | Conditionne le format du § 9 | Deux raisons au plus dans le message, le reste dans la carte |
| Offre requise pour un contrôle obligatoire | Conditionne la démo du blocage réel | Essai Premium sur l'espace de travail de démonstration |
| Global Apps : connexion Bitbucket disponible ? | Supprimerait le pont | Garder les deux apps |
| Lecture des cases cochées dans une description Jira | Cœur de R-03 | Champ personnalisé ou sous-tâches |

## 16. Exigences non fonctionnelles

- **Rapidité.** 95 % des évaluations en moins de 5 s, mesurées et affichées dans le journal.
- **Disponibilité.** Aucune fusion n'est bloquée par une panne de l'app si la politique de repli est « ouvert ».
- **Sécurité.** Pont signé, secret hors base, rejet des rejeux, aucune donnée de code stockée.
- **Traçabilité.** Évaluations gardées 180 jours, dérogations sans limite.
- **Explicabilité.** Aucun blocage sans raison lisible et sans action proposée.
- **Langues.** Messages dans la langue réglée pour l'espace de travail ; soumission en anglais.

## 17. Cas limites

- PR sans clé de ticket : R-01 s'applique, les autres règles sont « non évaluées ».
- Clé qui ne correspond à aucun ticket, ou ticket d'un site non jumelé : traitée comme absente, avec message distinct.
- Plusieurs tickets dans une PR : chaque règle prend le pire résultat ; le message cite le ticket fautif.
- Gel qui commence entre le push et la fusion : rattrapé par le déclencheur de fusion.
- Dérogation expirée entre l'accord et la fusion : le contrôle échoue et le dit.
- Incident clos pendant que la PR attend : il faut relancer le contrôle ou repousser un commit ; la carte l'indique.
- Branche de publication : les gels se règlent par motif de branche (`release/*`).
- PR issue d'un fork : mêmes règles ; pas de clé dans la branche, on lit le titre.
- Ticket déplacé de projet : la clé change, l'ancienne redirige ; le cache suit l'identifiant.
- Pont coupé (app Jira désinstallée) : politique de repli, bandeau d'alerte dans les réglages Bitbucket.

## 18. Recette

1. Étant donné une PR dont le ticket a deux cases non cochées et R-03 en bloquant, alors le contrôle échoue et le message cite le ticket et le nombre de cases.
2. Étant donné un gel actif sur `main`, alors toute PR vers `main` échoue avec le nom et la fin du gel.
3. Étant donné un incident ouvert sur le service du dépôt, alors la PR échoue, sauf si son ticket est lié à l'incident.
4. Quand une dérogation de 2 h est accordée, alors le contrôle passe et le journal montre qui, pourquoi, jusqu'à quand.
5. Quand le Cerveau est arrêté et la politique est « ouvert », alors le contrôle passe avec « contexte indisponible ».
6. Une requête au web trigger avec une signature fausse ou un horodatage ancien est rejetée.
7. La console de test renvoie, pour un ticket donné, le même message que le contrôle réel.
8. `evaluate-merge` appelé par un client MCP renvoie les mêmes raisons que la carte de la PR.
9. En mode observation, rien n'apparaît dans la PR et l'évaluation figure au journal.

## 19. Scénario de la vidéo (moins de 5 minutes, en anglais)

| Temps | Contenu |
|---|---|
| 0:00 – 0:30 | Un vendredi 17 h, une fusion part pendant un incident : le problème |
| 0:30 – 1:30 | PR #42 bloquée : message à deux raisons, carte détaillée |
| 1:30 – 2:15 | Critères cochés, contrôle relancé, dérogation demandée puis accordée |
| 2:15 – 2:50 | Un incident s'ouvre : les PR du service se bloquent, le correctif passe |
| 2:50 – 3:30 | Mode observation : « 31 fusions auraient été bloquées » |
| 3:30 – 4:10 | Agent Rovo, puis `evaluate-merge` appelé par un agent de code |
| 4:10 – 4:45 | Architecture : deux apps Forge, pont signé, aucune ligne de code qui sort |

## 20. Comment les juges testeront

Leur site de test n'a probablement pas Bitbucket. Les instructions prévoient donc deux niveaux :

1. **Sans Bitbucket.** Installer l'app Jira, charger le jeu d'exemple, utiliser la console de test, l'agent Rovo et les outils MCP. Toutes les règles sont démontrables.
2. **Avec Bitbucket.** Installer l'app Bitbucket sur un espace de travail partagé, activer les merge checks personnalisés, saisir le code de jumelage, ouvrir une PR d'essai.

La vidéo montre le second niveau en conditions réelles.

## 21. Plan jusqu'au 22 décembre

| Semaine | Objectif |
|---|---|
| 11 – 17 nov. | Les six validations du § 15 ; un merge check qui appelle un web trigger et renvoie son verdict |
| 18 – 24 nov. | Jumelage, signature, règles R-01, R-02, R-06, R-07 |
| 25 nov. – 1er déc. | R-03, R-04, R-05, cache, mesure des temps |
| 2 – 8 déc. | Dérogations, journal, carte de PR, encart ticket |
| 9 – 15 déc. | Console de test, agent, MCP, mode observation ; gel des fonctionnalités le 15 |
| 16 – 22 déc. | Recette, vidéo, instructions pour les juges, soumission, dépôt Marketplace des deux apps |

## 22. Risques

| Risque | Parade |
|---|---|
| Le pont entre les deux apps ne tient pas dans le délai d'un merge check | Validation dès le premier jour ; cache ; politique de repli |
| Contrôle obligatoire réservé à Premium | Essai Premium pour la démo ; l'app reste utile en avertissement |
| Juges sans Bitbucket | Console de test et jeu d'exemple côté Jira |
| Règles vécues comme une gêne | Mode observation, niveaux, dérogations rapides, messages actionnables |
| Deux apps à publier | Une seule fiche de présentation, instructions de jumelage en trois étapes |

## 23. La vision poussée à l'extrême

- **Règles dans le dépôt.** Un fichier `.merge-context.yml` versionné avec le code, relu comme le reste, borné par les règles de l'organisation.
- **Règles suggérées par l'historique.** « 4 des 5 derniers incidents sur ce service ont suivi une fusion faite pendant un autre incident : activer R-05 en bloquant ? »
- **Évaluation continue.** Les PR ouvertes sont réévaluées quand le contexte change ; leur auteur est prévenu avant de cliquer sur « Merge ».
- **Dérogations qui apprennent.** Une règle dérogée neuf fois sur dix est proposée à la rétrogradation ; une règle jamais dérogée et souvent déclenchée est confirmée.
- **Même garde-fou pour les humains et les agents.** Un agent de code passe par les mêmes règles, les mêmes dérogations et le même journal.

## 24. Sources

- [Codegeist 2026](https://codegeist2026.devpost.com/), son [règlement](https://codegeist2026.devpost.com/rules) et ses [ressources](https://codegeist2026.devpost.com/resources)
- [Module Bitbucket merge check](https://developer.atlassian.com/platform/forge/manifest-reference/modules/bitbucket-merge-check/)
- [Mettre en place les merge checks personnalisés](https://support.atlassian.com/bitbucket-cloud/docs/set-up-and-use-custom-merge-checks/)
- [Modules Bitbucket](https://developer.atlassian.com/platform/forge/manifest-reference/modules/index-bitbucket/) et [événements Bitbucket](https://developer.atlassian.com/platform/forge/events-reference/bitbucket/)
- [Scopes Jira et Bitbucket dans une même app (fil de la communauté)](https://community.developer.atlassian.com/t/access-jira-and-bitbucket-scopes-in-the-same-forge-app/79065)
- [Compatibilité multi-apps](https://developer.atlassian.com/platform/forge/app-compatibility/)
- [Web trigger](https://developer.atlassian.com/platform/forge/manifest-reference/modules/web-trigger/)
- [Module Rovo MCP](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-mcp/) et [module Action](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-action/)
- [Limites d'invocation](https://developer.atlassian.com/platform/forge/limits-invocation/)
