# Preuve réelle — ce qui est demonstrated sur des systèmes réels

La démo (`npm run demo`) joue un jeu de données **fictif** : les tickets `PAY-123`
n'existent nulle part, l'espace de travail est `ws-demo`, et le pont répond à un
cerveau nourri par `MAC_DEMO_DATA=1`. Ce document décrit ce qui a été fait pour
remplacer ce jeu par des **données et des systèmes réels**, et ce qui reste bloqué.

## 1. Le jeu de données réel (site Jira `one-atlas-cndz.atlassian.net`)

Créé par l'API REST Jira Cloud v3 (`/tmp/jeu-reel-mac.py` reproduit l'opération) :

| Objet | Identité | Détail |
|---|---|---|
| Projet | `MAC` | « Merge avec contexte », logiciel, lead Baptiste Faisy |
| Composant | `checkout-api` | le service visé par le scénario de paiement |
| Versions | `2.3` (publiée), `2.4` (non publiée) | permet de déclencher R-07 pour de vrai |
| Ticket | `MAC-2` | « Limiter les tentatives de paiement (preuve réelle) », statut *En cours*, description avec 2 cases à cocher **non cochées**, version `2.4` |
| Ticket | `MAC-3` | « Correctif incident checkout-api (preuve réelle) », statut *En cours`, description avec 2 cases **cochées**, version `2.3` (publiée) |
| Lien | `MAC-3` bloque `MAC-2` | type `Blocks` (sens réel, pas simulé) |

## 2. Le Cerveau en mode réel

Variables de production posées puis application par redéploiement :

```
MAC_DEMO_DATA=0            # plus de jeu de démonstration : lecture Jira réelle
MAC_DEMO_REFRESH=0
MAC_PAIRED_WORKSPACE={b44dcce8-0f72-4e36-bf40-65aead14ce35}   # uuid de l'espace Bitbucket
```

Le journal de l'app confirme le basculement (`forge logs -e production`) :
`amorçage : jumelage déjà en place, conservé {"workspace":"ws-demo"}` puis, après
bascule, plus aucune ligne « mode démonstration actif ».

## 3. Les verdicts réellement observés

`scripts/preuve-reelle.ts` (nouveau) appelle le pont **signé** et rend les verdicts :

```
— Cas 1 — MAC-2 : critères d'acceptation non cochés + lien « Blocks » —
        │ Bloqué, 2 raisons.
        │ 1) MAC-2 est au statut « In Progress », attendu : À faire, En cours, En revue, Prêt pour la livraison.
        │ 2) MAC-2 : 2 critère(s) d'acceptation non coché(s).
        │ Détail et dérogation : carte « Merge avec contexte » à droite.
```

Points vérifiés sur cette exécution :

- le message cite le **vrai ticket** (`MAC-2`) et ses **vrais critères** lus dans Jira ;
- le statut affiché (`In Progress`) est celui que Jira renvoie **à l'app**, pas le jeu de démo ;
- la carte expose les **13 règles** ; une requête **non signée** reçoit **HTTP 401** ;
- latences : médiane ≈ 0,95 s, max ≈ 2,7 s (premier appel à froid).

## 4. Défauts réels révélés par cette exécution

Ces quatre points n'étaient pas visibles avec le jeu de démonstration :

1. **R-02 compare des noms de statut localisés.** L'app reçoit `In Progress`
   (anglais) alors que la liste blanche mémorisée contient `En cours` (français) :
   tout ticket réel est bloqué à tort. La comparaison porte désormais sur la
   **catégorie Jira** du statut, son identifiant et son nom : un réglage peut
   désigner un statut par sa catégorie (`indeterminate`, `done`) et rester
   valable quelle que soit la langue du site. La liste blanche par défaut reste
   une décision de politique (des statuts nommés) : c'est à l'administrateur de
   la fixer, l'app ne peut pas deviner quels statuts ouvrent une fusion.
2. **R-06 ne voyait pas le lien réel — cause trouvée, corrigée.** Le lien
   `Blocks` existait bien dans Jira (`inwardIssue: null`, `outwardIssue: MAC-3`),
   la lecture des liens le remontait bien jusqu'à la règle, et le sens du lien
   était correctement calculé. La cause était la **configuration mémorisée** :
   le jeu de démonstration écrit neuf réglages de règles
   (`cerveau/src/seed/dataset.ts`), dont celui de R-06 avec
   `linkTypes: ['bloque par']`. Ce réglage *remplace* les défauts du catalogue
   (`['Blocks', 'bloque']`) — et « Blocks », le nom que porte le lien sur un
   site anglais, ne correspondait à rien : le lien était ignoré, R-06 muette.
   Deux tolérances corrigent le tir : le type de lien est reconnu par **famille**
   (un réglage qui parle de blocage reconnaît « Blocks », « bloque » et
   « bloque par »), et la livraison se compare par **catégorie de statut**
   (`done`), identifiant ou nom normalisé — une cible livrée reste livrée sur
   un site dont la langue n'est pas celle du réglage.
3. **R-01 se tait quand la branche ne porte aucune clé.** L'issue est explicitement
   absente des faits : la branche `feature/migration-sans-ticket` ne produit aucune
   raison, alors que la chaîne `r01.missing` existe.
   *Corrigé depuis* : la clé vide annoncée par le Capteur n'est plus lue par Jira
   (la lecture échouait et l'évaluation tombait en repli, muette) ; R-01 émet
   désormais `r01.missing`, une fois et une seule.
4. **Le journal ne s'écrit plus en production** : `journal : écriture impossible —
   ForgeSQLError: Unknown SQL execution error` (les dix migrations passent
   pourtant). Cause trouvée et corrigée : la colonne `correlation_id` de la
   table `evaluation` a été déclarée après la création de la table, et
   `CREATE TABLE IF NOT EXISTS` ne complète jamais une table déjà créée — les
   installations en place n'ont donc pas la colonne, que l'insertion citait.
   Le correctif ajoute une instruction d'alignement (`ALTER TABLE … ADD
   COLUMN IF NOT EXISTS`) sous un nom de migration neuf, rejouée là où la
   table existe déjà ; il attend un redéploiement pour se voir en production.

## 5. Côté Bitbucket : ce qui est fait, ce qui bloque

- **Fait** : le Capteur est **réellement installé** sur l'espace Bitbucket
  `one-atlas-cndz` (`forge install -p bitbucket -s https://bitbucket.org/one-atlas-cndz
  --non-interactive -e production` → `✔ Install in Bitbucket complete !`), avec les
  scopes `read:pullrequest:bitbucket`, `read:repository:bitbucket`, `storage:app`.
- **Bloqué** : l'espace `one-atlas-cndz` refuse toute écriture et toute page de
  réglage depuis cette IP. Message exact de l'API Bitbucket :
  `To access this workspace, an admin must whitelist your IP.` (HTTP 403), et la
  page affiche « As an administrator, send an email to request disabling IP
  allowlisting to add your IP address (46.193.66.237) ». Concrètement : création
  de dépôt, création d'espace, page de réglages (donc l'activation des *custom
  merge checks*) et création de jeton sont tous refusés. Aucune politique
  d'allowlist n'est visible dans `admin.atlassian.com` (Atlassian Guard : « aucune
  politique n'a été créée »), et l'API REST Bitbucket n'expose pas ce réglage.

## 5 bis. Une preuve vérifiable par étape

Le dossier `docs/preuve/` associe à chaque étape un **élément** qui prouve qu'elle a
fonctionné (clé Jira, signature HMAC, identifiant d'installation, capture d'écran) et un
contrôle automatique qui le revérifie : `npm run preuve:verifier` relit les tickets sur le
site, recalcule les signatures, rejoue chaque cas et sort un tableau
« étape / preuve / état ». Détail dans `docs/preuve/00-synthese.md`.

## 6. Reproduire

```bash
bash scripts/preuve-reelle.sh      # bascule réel → cas réels → restauration
```

Le script pose `MAC_DEMO_DATA=0`, redéploie, joue `scripts/preuve-reelle.ts`, puis
remet la démonstration et redéploie. Variables d'environnement reconnues :
`MAC_BRIDGE_URL`, `MAC_SHARED_SECRET`, `MAC_ESPACE_UUID` (par défaut `ws-demo`,
l'espace actuellement jumelé — voir §7 pour le passage à l'UUID réel).

## 7. Ce qui manque encore pour la preuve « bout en bout »

1. La PR Bitbucket réelle (création de dépôt, branche `feature/MAC-2-…`, PR) et le
   déclenchement du contrôle par Bitbucket : bloqué par l'allowlist IP (§5).
2. L'activation des *custom merge checks* dans les réglages de l'espace, puis
   l'ajout du contrôle au dépôt : même page, même blocage.
3. Le jumelage avec l'UUID réel de l'espace : le code à usage unique se génère sur
   l'écran de réglages Jira, dont l'interface UI Kit ne se rend pas dans le
   navigateur de cette machine (`body` vide, aucune erreur applicative journalisée).
