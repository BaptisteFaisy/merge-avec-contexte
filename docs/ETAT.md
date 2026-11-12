# État du projet

Relevé du 2026-11-11 (nuit du 10 au 11). Tout ce qui est décrit ici est sur
`main`, vert en CI, et mergé par la file Mergify — aucun push direct.

## Ce qui est livré

| Lot | Contenu | Où |
|---|---|---|
| Contrat partagé | types du domaine, catalogue des 13 règles, messages bilingues au format imposé du §9, pont signé (HMAC-SHA256 + horodatage + nonce + anti-rejeu), jumelage par code à usage unique, gels (ponctuels et récurrents, avec fuseau), dérogations, politique de repli, réponse `bitbucket:mergeCheck` | `shared/src/` |
| Moteur de règles | portée par dépôt et branche, mode observation, dérogations, verdict, « la plus stricte l'emporte » sur plusieurs tickets | `cerveau/src/rules/` |
| Stockage | les huit tables du §14 plus `bridge_nonce` (anti-rejeu) et `waiver_audit` (traçabilité des décisions), en DDL MySQL idempotente, un port par agrégat, implémentation Forge SQL et implémentation mémoire | `cerveau/src/storage/` |
| Pont | web trigger signé : six routes (`health`, `pair`, `evaluate`, `card`, `waiver.request`, `waiver.decide`), erreurs explicites, aucune exception vers Forge | `cerveau/src/bridge/` |
| Lectures Jira + cache | critères d'acceptation (cases de la description, champ ou sous-tâches), liens, versions, composants, incidents JSM ; cache à 60 s | `cerveau/src/jira/`, `cerveau/src/cache/` |
| Agent Rovo et MCP | les cinq actions du §11 (`evaluate-merge`, `explain-block`, `list-freezes`, `list-waivers`, `request-waiver`) et le prompt de l'agent | `cerveau/src/rovo/` |
| Écrans Jira | réglages du projet, encart sur le ticket, console de test et journal (UI Kit 2) | `cerveau/src/frontend/`, `cerveau/src/ui/` |
| Capteur | lecture de la PR (métadonnées seulement), client du pont avec délai de 4 s, politique de repli, carte de PR, panneau, réglages de l'espace de travail | `capteur/src/` |
| Assemblage | racine de composition : les onze handlers du manifeste Jira et les quatre du manifeste Bitbucket branchés sur les modules | `cerveau/src/app/`, `capteur/src/app/`, `*/src/index.ts` |
| Démonstration | jeu de données complet (tickets, gels, incident, dérogations, PR), son chargeur depuis la page de réglages, et les neuf scénarios de recette du §18 en tests | `cerveau/src/seed/`, `cerveau/test/recette*.ts`, `cerveau/test/seed-loader.test.ts` |
| Documentation | cahier des charges, architecture, conventions, référence des modules Forge, instructions aux juges (EN), scénario vidéo (EN), plan des six validations, recette | `docs/` |

Chiffres au 2026-11-12 : **620 tests** en 49 fichiers (vitest, logique pure et
rendu jsdom des six écrans, aucun réseau), **15 347 lignes** de
TypeScript/JSX hors copies générées du contrat, 58 commits, **48 PR mergées
par la file Mergify** — aucune intervention humaine sur un merge.

Gardes en CI : `ci` (typecheck strict, tests, sanity docs), `ci-budget` (aucun
job au-delà de 5 min), `couche0` (périmètre déclaré, motifs interdits), plus
trois gardes maison — taille des fichiers (< 500 lignes), taille des fonctions
(< 50 lignes, via l'AST TypeScript) et cohérence des manifestes Forge (fonctions
référencées, handlers exportés, ressources présentes).

## Démonstration gratuite, en une commande

`docs/DEMO-E2E.md` : onze vérifications jouées contre l'app déployée par un
script signé (`npm run demo`), sans navigateur, sans espace de travail
Bitbucket et sans rien payer. Sortie réelle du 2026-11-11 dans le document :
PR bloquée avec les deux raisons du §9, carte détaillée, dérogation demandée
puis accordée puis retirée, PR bloquée par l'incident, correctif lié autorisé,
requête non signée refusée.

## Essayer sans Bitbucket (niveau 1 des juges)

Rien ne dépend d'un espace de travail Bitbucket pour démontrer le produit :

```bash
npm install && npm test        # 352 tests, dont les neuf scénarios de recette
```

Les neuf scénarios du §18 sont exécutés sur le jeu de démonstration
(`cerveau/src/seed/dataset.ts`) : critères non cochés, gel actif, incident ouvert
avec voie rapide pour le correctif, dérogation de deux heures, repli ouvert et
fermé, signature fausse et horodatage ancien rejetés, console de test alignée sur
le contrôle réel, `evaluate-merge` aligné sur la carte de PR, mode observation.

## Ce qui reste à faire sur une vraie instance Atlassian

1. **Identifiants d'app** : les deux `manifest.yml` portent un `app.id`
  Placeholder — `forge register` dans chaque dossier les renseigne.
2. **Les six validations du §15** (protocole dans `docs/VALIDATION-PLAN.md`) :
   durée maximale d'un merge check, appel d'un web trigger depuis une app
   Bitbucket, longueur maximale du message affiché, offre requise pour un
   contrôle obligatoire, disponibilité de la connexion Bitbucket des Global Apps,
   lecture des cases cochées dans une description Jira.
3. **Espace de travail de démonstration** : `forge site provision` fournit Jira,
   Confluence, JSM, Rovo et Studio — mais pas Bitbucket. Le niveau 2 de la
   démonstration exige un espace de travail partagé, avec l'offre Premium pour
   rendre le contrôle obligatoire.
4. **Champs personnalisés Jira** : si R-03 lit un champ plutôt que les cases de
   la description, renseigner son identifiant dans les réglages (le lecteur Jira
   accepte `champs` en paramètre).
5. **Vidéo de soumission** (moins de 5 minutes, anglais) : le scénario minute par
   minute est prêt dans `docs/VIDEO-SCRIPT.md`.
6. **Marketplace** : une fiche de présentation pour les deux apps, avec les
   instructions de jumelage en trois étapes — et la mention **explicite** que
   le caractère bloquant du contrôle exige l'offre Premium Bitbucket : sur une
   offre gratuite, le contrôle s'exécute et informe sans empêcher la fusion
   (`docs/AUDIT.md` n°39, `docs/DEPANNAGE.md` §7). Le dire dans la fiche de
   soumission, pas seulement ici.

## Incertitudes assumées

`docs/FORGE-API-NOTES.md` liste ce qui est confirmé par la documentation et ce
qui ne l'est pas. Les points non confirmés (payload de réponse des modules
d'interface, `resourceSlug`, disponibilité de la connexion Bitbucket aux Global
Apps) sont écrits de façon défensive : le code lit le contexte d'extension à
plusieurs endroits possibles et ne lève jamais vers Forge.

## Pipeline et preuve de l'agent de conflit

Le dépôt tourne sur cinq runners auto-hébergés du r630
(`r630-merge-avec-contexte-01..05`) et deux du poste de travail
(`pc-merge-avec-contexte-01..02`), tous porteurs du label
`merge-avec-contexte-worker`. Le r630 étant saturé par d'autres travaux au
moment de la construction, les deux runners locaux ont évité que la CI n'attende.

La file Mergify a mergé les 48 PR sans intervention humaine. La résolution
automatique de conflit a été exercée pour de vrai : deux PR modifiaient la même
section du `README.md` (PR #21 et #22). La première mergée, la seconde est passée
`DIRTY` ; l'agent de conflit l'a reconciliée en gardant les deux intentions, a
poussé le rebase sur la branche de la PR, et la file a mergé dans la minute
(commentaire « Conflit réconcilié par l'agent : 1 fichier (README.md) »).

Le fournisseur de cet agent était hors service (compte suspendu, HTTP 412) : il a
été rebranché sur une API compatible OpenAI via les variables de dépôt
`FIREWORKS_BASE_URL` et `FIREWORKS_MODEL` — d'où la transmission de
`FIREWORKS_BASE_URL` au balayeur, qui manquait.

## Déploiement réel (2026-11-11)

Les deux apps sont enregistrées dans la Developer Console, déployées, et le
Cerveau est installé sur le site de démonstration.

| | Cerveau (Jira) | Capteur (Bitbucket) |
|---|---|---|
| Nom | Merge avec contexte Cerveau | Merge avec contexte Capteur |
| App ID | `ari:cloud:ecosystem::app/8361630d-9d57-4099-9c2b-5201bb00648d` | `ari:cloud:ecosystem::app/0777c25e-2be7-44fc-aa99-6d82fd3789c1` |
| Developer Space | laddition | laddition |
| `development` | 2.2.0 déployé | 2.1.0 déployé |
| `production` | 2.0.0 déployé | 2.0.0 déployé |
| Installé | oui, sur `one-atlas-cndz.atlassian.net` (Jira, dev et prod) | **non** — aucun espace de travail Bitbucket disponible |
| Console | `developer.atlassian.com/console/myapps/8361630d-9d57-4099-9c2b-5201bb00648d` | `developer.atlassian.com/console/myapps/0777c25e-2be7-44fc-aa99-6d82fd3789c1` |

Site de démonstration : **`one-atlas-cndz.atlassian.net`**, actif jusqu'au
2027-02-09, fourni par `forge site provision` (Jira, Confluence, JSM, Rovo,
Studio — **pas de Bitbucket**).

### Vérifié en direct sur l'app déployée

Le pont (web trigger `pont-bitbucket`, environnement production) répond :

| Appel | Attendu | Observé |
|---|---|---|
| `{"route":"health"}` | 200 | `{"status":"ok","version":"1.0.0","stockage":"ok"}` |
| `{"route":"evaluate",…}` sans signature | 401 | `{"error":"unauthorized","message":"Signature absente, invalide, périmée ou déjà vue."}` |
| `{"route":"pair",…}` code inconnu | 401 | `{"error":"unauthorized","message":"Code de jumelage inconnu."}` |
| corps non JSON | 400 | `{"error":"bad-payload","message":"Corps illisible : JSON attendu."}` |

**Latence du pont** (production, 10 appels successifs à chaud) : minimum 0,44 s,
médiane 0,57 s, **p95 0,83 s**, maximum 1,10 s. Premier appel après déploiement
(à froid, migrations comprises) : 6,4 s. L'objectif de 5 s (MC-11) est tenu avec
de la marge pour l'évaluation elle-même.

**Migrations Forge SQL** : `{"mode":"runner","appliquees":8}` — les huit tables
du §14 sont créées, en production comme en development. Un rattrapage au premier
appel a été ajouté après constat : sans lui, une installation neuve répond
`ForgeSQLError` sur toutes les routes jusqu'au premier tick du déclencheur
horaire.

L'adresse du pont n'est **pas versionnée** (elle vaut secret) : elle se régénère
avec `forge webtrigger create -f pont-bitbucket -e production -s <site> -p jira`,
et le Cerveau la lit lui-même à l'exécution (`webTrigger.getUrl`) pour la rendre
au Capteur au moment du jumelage.

### Jumelage sans navigateur (Capteur)

Le Capteur accepte le jumelage par variables d'environnement, en **repli
seulement** — un jumelage saisi dans l'écran de réglages garde toujours la
priorité :

```bash
forge variables set MAC_BRIDGE_URL   '<adresse du pont>'   -e production   # côté capteur
forge variables set MAC_SHARED_SECRET '<secret partagé>'   -e production --encrypt
forge variables set MAC_WORKSPACE     '<uuid de l’espace>' -e production   # facultatif
forge variables set MAC_FALLBACK_POLICY closed             -e production   # facultatif
forge variables set MAC_ENVOI_CHEMINS 0                    -e production   # facultatif
forge deploy -e production
```

C'est ce qui rend l'installation Bitbucket scriptable : sans cela, le jumelage
exige un navigateur pour saisir le code à usage unique. Un `hasSettings`
optionnel a été ajouté au port des réglages pour distinguer « jamais réglé » de
« réglé aux valeurs par défaut » — sinon une variable écraserait un choix
explicite de l'administrateur.

### Ce qui bloque encore

1. **Le Capteur n'est installé nulle part.** `forge site provision` ne fournit
   pas Bitbucket et `forge install -p bitbucket` demande l'URL d'un espace de
   travail (`bitbucket.org/<espace>`). Sans espace de travail, le merge check ne
   peut pas s'exécuter en conditions réelles — et un contrôle **obligatoire**
   exige en plus l'offre Premium (§15).
2. **Les écrans ne sont pas vérifiés visuellement** : les modèles de vue sont
   testés, mais le rendu UI Kit demande un navigateur sur le site de démo
   (page de réglages du projet, encart de ticket, console et journal).
3. **Le jumelage complet n'a pas été joué** : il passe par la page de réglages
   Jira (générer un code) puis la page de réglages Bitbucket (le saisir). La
   route `pair` est validée côté serveur (code inconnu refusé en 401).
