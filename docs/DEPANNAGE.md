# Dépannage — « Merge avec contexte »

Que faire quand quelque chose ne répond pas comme prévu, du pont signé aux
écrans. Les commandes sont exécutées depuis le dossier de l'app concernée
(`cerveau/` ou `capteur/`), avec le CLI Forge authentifié. Les contraintes de
plateforme sous-jacentes sont détaillées dans `docs/FORGE-API-NOTES.md`.

## 0. Les bons outils

- **Logs de l'app** : `forge logs` (précisez l'environnement et le site si le
  CLI le demande — `forge logs --help`). Aucune exception ne sort vers Forge :
  le code journalise et répond une erreur JSON, donc **le log est la première
  source d'information**.
- **Santé du pont** : un simple POST sur l'adresse du web trigger, sans
  signature (la route `health` est publique) :

  ```bash
  curl -s -X POST "$MAC_BRIDGE_URL" -H 'content-type: application/json' \
       -d '{"route":"health"}'
  # attendu : {"status":"ok","version":"1.0.0","date":"…","stockage":"ok"}
  ```

- **Console de test et journal** (page « Merge avec contexte — console et
  journal » du projet Jira) : la console évalue sans Bitbucket, le journal
  liste les évaluations avec leur durée et leur verdict.
- **Démonstration signée** : `npm run demo` à la racine rejoue onze
  vérifications contre l'app déployée (`docs/DEMO-E2E.md`) — un bon filet pour
  distinguer « le pont est cassé » de « mon client est cassé ».

## 1. Le pont répond 500

Une réponse `WebTriggerResponse` malformée ou une erreur d'exécution non
capturée produit un 500 de la plateforme (le handler du pont, lui, rend
toujours du JSON — 400 `bad-payload`, 401 `unauthorized`, 500 `internal`).

1. Lisez les logs : `forge logs` — cherchez la ligne `erreur` du handler ou une
   `ForgeSQLError`.
2. **Vérifiez les migrations** : sur une installation neuve, les huit tables du
   §14 doivent exister. Le chemin nominal est le déclencheur horaire
   `migrations-schema` (`migrerSchema`), doublé d'un rattrapage au premier
   appel (`cerveau/src/app/compose.ts`, `assurerMigrations`) — sans lui, une
   installation neuve répond `ForgeSQLError` sur toutes les routes jusqu'au
   premier tick. Dans les logs, cherchez `migrations` :
   `{"mode":"runner","appliquees":8}` est l'état sain ; `mode:"direct"` est le
   repli (plateforme ancienne) ; un `echec` non vide nomme la table en cause.
3. Vérifiez que le module `sql` est bien au manifeste déployé
   (`cerveau/manifest.yml`, `sql: - key: main, engine: mysql`) et que l'ajout
   du module a été **accepté par l'administrateur du site** (une montée de
   version majeure du module `sql` demande son consentement).
4. Redéployez proprement : `forge deploy -e production`, puis renvoyez
   `{"route":"health"}`. Le premier appel après déploiement est lent (à froid,
   migrations comprises : ~6 s mesurés) — ce n'est pas une panne.

## 2. `health` répond `"stockage": "indisponible"`

La route `health` sonde la base à chaque appel (`cerveau/src/bridge/routes.ts`)
: `indisponible` signifie que Forge SQL ne répond pas, même si le reste du pont
fonctionne.

1. Même séquence que ci-dessus : logs, migrations (`forge logs`), consentement
   de l'administrateur sur le module `sql`.
2. Vérifiez les quotas Forge SQL (1 Gio en production, 200 tables, 25 DDL/min,
   150 DML/s — `docs/FORGE-API-NOTES.md` §4) : un dépassement de DDL se voit
   dans les logs du déclencheur horaire.
3. Si la base est vide sur une installation qui fonctionnait : l'app a
   peut-être été **réinstallée** (une réinstallation repart d'une base neuve) —
   reprenez la procédure de la section 6.

## 3. L'app n'est pas installée

Symptômes : aucun module visible dans Bitbucket/Jira, `forge install` jamais
passé, ou le Capteur appelle un pont qui ne connaît pas son espace.

1. Cerveau (Jira) : `forge install -p jira -s <votre-site>.atlassian.net`
   depuis `cerveau/`. Les pages apparaissent dans les réglages du projet et
   dans la navigation du projet (console et journal).
2. Capteur (Bitbucket) : `forge install -p bitbucket -s bitbucket.org/<espace>`
   depuis `capteur/`. `forge site provision` ne fournit **pas** de Bitbucket :
   il faut un vrai espace de travail (gratuit jusqu'à cinq utilisateurs).
3. Côté Bitbucket, l'administrateur de l'espace doit en outre **activer les
   merge checks personnalisés** pour que le module `merge-avec-contexte-check`
   soit proposé sur les dépôts (audit n°34 : étape jamais jouée à ce jour).
4. Après toute installation : **jumeler** les deux apps (section 4), sinon le
   Capteur n'a ni adresse de pont ni secret.

## 4. « Code de jumelage inconnu » (ou expiré, déjà utilisé)

La route `pair` refuse en 401 avec l'un des trois messages
(`cerveau/src/bridge/pairing.ts`) :

| Message | Cause | Que faire |
|---|---|---|
| `Code de jumelage inconnu.` | Le code saisi ne correspond à aucune offre en base (jamais généré, faute de frappe, ou généré sur un **autre site/environnement**) | Régénérez un code sur la page de réglages du projet Jira — même site, même environnement que le pont appelé |
| `Code de jumelage expiré.` | Plus de 10 minutes depuis la génération (`PAIRING_TTL_MS`) | Régénérez et saisissez le code sans attendre |
| `Code de jumelage déjà utilisé.` | L'offre a déjà été consommée (usage unique) | Régénérez un nouveau code |

Un code faux ne consomme pas l'offre : on peut ressaisir jusqu'à l'expiration.
Vérifiez aussi que le Capteur appelle le bon pont : l'adresse saisie/renvoyée
doit être celle de l'environnement où le code a été généré
(`development` ≠ `production`). Le code se présente `MAC-XXXX-XXXX` ; la saisie
est normalisée (majuscules, tirets et espaces retirés).

## 5. Un écran reste vide

Les six écrans sont en UI Kit 2 (`render: native`). Un écran blanc vient
presque toujours du bundle front, pas du resolver :

1. **`React` doit être importé** dans chaque `.jsx` : le bundler Forge ne
   l'injecte pas (`docs/FORGE-API-NOTES.md` §8).
2. **tsconfig de l'app** : `"jsx": "react"`, **sans** `jsxImportSource` ni
   `noEmit` — le bundler impose ces contraintes et échoue silencieusement
   sinon.
3. **Chemins de ressources** : chaque `resources:` du manifeste doit pointer
   vers le bon `src/frontend/*.jsx` (la clé `resource` du module et la clé de
   la ressource doivent correspondre).
4. **Clés de resolver** : le front appelle `invoke('<clé>')` avec les clés
   déclarées dans `function:` (≤ 23 caractères) ; une clé mal orthographiée
   rend un écran vide sans erreur côté serveur.
5. Redéployez l'environnement que vous regardez (`forge deploy` sans `-e`
   déploie `development` ; les écrans de l'installation prod viennent de
   `production`).
6. Côté données : si l'écran se rend mais reste désespérément vide sur un site
   neuf, chargez le jeu de démonstration (bouton de la page de réglages, ou
   `MAC_DEMO_DATA=1` — `docs/ARCHITECTURE.md` §8.3).

## 6. Après une réinstallation : régénérer l'adresse du pont et le secret

Une réinstallation du Cerveau (ou un changement d'environnement) repart d'une
base vide : plus de jumelage, plus de secret, et l'adresse du web trigger a pu
changer. L'adresse du pont ne se versionne pas (elle vaut secret) ; le secret
partagé non plus. Deux voies :

**Voie nominale — par l'interface (rotation propre)** : régénérez un code à
usage unique dans la page de réglages du projet Jira, saisissez-le dans les
réglages de l'espace de travail Bitbucket. Le nouveau jumelage **remplace** le
secret précédent : l'ancien ne signe plus rien, l'échange est atomique
(`docs/ARCHITECTURE.md` §2.1 et §2.4).

**Voie sans navigateur — par variables d'environnement** (déploiement
automatisé, démonstration ; idempotent, `cerveau/src/app/bootstrap.ts`) :

```bash
cd cerveau
# 1. (ré)générer l'adresse du pont pour l'installation et l'environnement visés
forge webtrigger create -f pont-bitbucket -e production -s <site> -p jira
# 2. poser le secret partagé (chiffré) et l'espace de travail à jumeler
forge variables set MAC_SHARED_SECRET <secret> -e production --encrypt
forge variables set MAC_PAIRED_WORKSPACE <workspaceUuid> -e production
# 3. (démo seulement) servir le jeu de démonstration
forge variables set MAC_DEMO_DATA 1 -e production
# 4. redéployer pour que l'amorçage s'exécute
forge deploy -e production
```

Puis, côté Capteur, faites-lui connaître la nouvelle adresse et le nouveau
secret : soit par la saisie d'un code de jumelage (voie nominale), soit — pour
la démonstration de bout en bout — en passant les mêmes valeurs au script :

```bash
MAC_BRIDGE_URL=<adresse du pont> MAC_SHARED_SECRET=<secret> npm run demo
```

Le Cerveau, lui, lit son adresse à l'exécution par
`webTrigger.getUrl('pont-bitbucket')` (`cerveau/src/app/pont-url.ts`) : il n'y
a rien à recopier de son côté, et la route `pair` rend l'adresse au Capteur au
moment du jumelage. Après l'opération, vérifiez `{"route":"health"}`
(`stockage: ok`) et rejouez `npm run demo` : « Requête non signée refusée —
HTTP 401 » prouve que le nouveau secret est bien celui qui signe.

## 7. Le contrôle n'empêche pas de fusionner

Ce n'est pas un bogue : un merge check **bloquant** exige l'offre Premium
Bitbucket. Sur une offre gratuite, le contrôle s'exécute, affiche son message
et son verdict, mais **informe sans empêcher** la fusion
(`docs/FORGE-API-NOTES.md` §6, point 5). À offre égale, vérifiez aussi que le
contrôle est déclaré obligatoire sur le dépôt (réglages de branches), et que la
règle visée n'est pas en mode observation ni couverte par une dérogation active
(page Journal).
