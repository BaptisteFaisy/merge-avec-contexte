# Changelog

Tous les changements notables de « Merge avec contexte » sont consignés dans ce
fichier. Le format suit [Keep a Changelog](https://keepachangelog.com/fr-FR/1.1.0/)
et le projet adhère au [versionnage sémantique](https://semver.org/lang/fr/).

L'historique ci-dessous est établi d'après `git log` et les 34 pull requests
mergées par la file Mergify (numéros entre parenthèses) — aucun merge manuel,
aucun push direct sur `main`.

## [Non publié]

### Ajouté

- Hygiène du dépôt public : `LICENSE` (Apache-2.0, choix à confirmer par le
  propriétaire), ce changelog, `CONTRIBUTING.md` (installation, tests, flux de
  PR, déploiement des deux apps).
- `docs/DEPANNAGE.md` : pont en 500, `stockage: indisponible`, app non
  installée, « Code de jumelage inconnu », écran vide, et la procédure de
  régénération de l'adresse du pont et du secret après une réinstallation.
- `docs/FORGE-API-NOTES.md` : section « Contraintes découvertes au déploiement
  réel » (clé de fonction ≤ 23 caractères, `function` sous `modules:`, egress
  `- address:`, tsconfig d'app sans `noEmit` ni `jsxImportSource`, etc.).

### Modifié

- `docs/RECETTE.md` réécrite : les neuf scénarios du §18 ne sont plus « à
  écrire », ils sont testés dans `cerveau/test/recette.test.ts` et joués contre
  l'app déployée par `npm run demo` ; tableau MC-01 → MC-17 à jour des vrais
  emplacements.
- `docs/ARCHITECTURE.md` complétée : `cerveau/src/app/` (composition,
  amorçage, adaptateurs), `cerveau/src/seed/` (jeu de démonstration et son
  chargeur), le mode démonstration (`MAC_DEMO_DATA`, lecteur de démo),
  `scripts/demo-e2e.ts`, diagramme de séquence du jumelage et diagramme
  d'ensemble à jour (R-01 à R-13, clés de modules exactes).
- `README.md` et `docs/ETAT.md` : le caractère **bloquant** du contrôle exige
  l'offre Premium Bitbucket (sur une offre gratuite, le contrôle s'exécute et
  informe) ; liste de topics GitHub proposés pour le dépôt public.

### Corrigé

- **Le journal ne s'écrivait plus en production** (`journal : écriture
  impossible — ForgeSQLError: Unknown SQL execution error` à chaque
  évaluation). Cause : la colonne `correlation_id` d'`evaluation` a été
  déclarée après la création de la table, et `CREATE TABLE IF NOT EXISTS` ne
  complète jamais une table déjà créée — `migrationRunner` ne rejoue que les
  opérations dont le nom est absent de `__migrations`. Les installations en
  place n'avaient donc pas la colonne, que l'insertion citait. Correctif : une
  instruction d'alignement (`ALTER TABLE … ADD COLUMN IF NOT EXISTS`) sous un
  nom de migration neuf, qui rejoue le DDL là où la table existe déjà
  (`cerveau/src/storage/schema.ts`, `cerveau/src/storage/migrate.ts`).
- Le rapport de migration ne ment plus : `appliquees` compte les instructions
  réellement exécutées, `declarees` celles qui sont déclarées (avant, un
  passage sans rien jouer annonçait quand même « dix migrations appliquées »).
- `docs/DEPANNAGE.md` : section « Le journal ne s'écrit plus » (symptôme,
  cause, remède).

## [0.1.0] — 2026-11-11

Première version fonctionnelle complète, développée et mergée le 11 novembre
2026 (42 commits, 34 PR, aucune étiquette posée à ce jour). Déployée pour de
vrai : le Cerveau est enregistré, déployé (development 2.2.0, production 2.0.0)
et installé sur le site de démonstration `one-atlas-cndz.atlassian.net` ; le
Capteur est déployé mais non installé (aucun espace de travail Bitbucket
disponible). Détails dans `docs/ETAT.md`.

### Ajouté

- **Socle** : contrat partagé, gardes de qualité (< 500 lignes par fichier,
  < 50 par fonction), pipeline de CI (couche0, ci, balayeur, triage) et file
  Mergify (#2) ; pack de livraison documentaire — architecture, juges, vidéo,
  validations, recette (#1, première PR mergée).
- **Cerveau (app Forge Jira)** : stockage Forge SQL — les huit tables du §14,
  ports et implémentation mémoire (#4) ; lectures Jira et cache des tickets et
  des incidents à 60 s (#6) ; moteur de règles et R-01 à R-13 (#7) ; cinq
  actions Rovo/MCP (`evaluate-merge`, `explain-block`, `list-freezes`,
  `list-waivers`, `request-waiver`) et prompt de l'agent (#8) ; jeu de données
  de démonstration du §20 (#9) ; pont signé — web trigger, routage six routes,
  jumelage par code à usage unique (#10) ; écrans Jira — réglages du projet,
  encart ticket, console de test et journal (#17) ; racine de composition et
  branchement des onze handlers du manifeste (#28, #29) ; règles par défaut du
  catalogue évaluées dès une installation neuve (#37) ; bouton « Charger le jeu
  de démonstration » sur la page de réglages (#38) ; amorçage d'une
  installation neuve par variables d'environnement — jumelage d'office et jeu
  de démo sans navigateur (#42) ; les écrans suivent le projet ouvert, plus un
  projet unique codé en dur (#40).
- **Capteur (app Forge Bitbucket)** : carte de PR, panneau Overview et réglages
  de l'espace de travail (#11) ; lecture de la PR, client du pont signé avec
  délai de 4 s, politique de repli et réponse au merge check (#18) ;
  branchement des handlers — merge check et écrans (#19).
- **Tests de recette** : les neuf scénarios du §18 en tests vitest sur le jeu
  de démonstration, avec leurs fixtures (doublures des ports, horloge
  injectée) (#24).
- **Intégration** : la carte du Capteur lit le `CardDetail` renvoyé par le pont
  (#30).
- **Démonstration** : tickets et incidents servis localement en mode démo,
  dates relatives (#43) ; démonstration de bout en bout gratuite en une
  commande, `npm run demo` contre l'app déployée — onze vérifications signées
  (#44).
- **Déploiement réel** : manifestes conformes à la référence Forge, apps
  enregistrées, déployées et Cerveau installé ; pont vérifié en direct (health
  200, requête non signée 401, corps non JSON 400) ; latence mesurée —
  médiane 0,57 s, P95 0,83 s ; huit migrations Forge SQL appliquées (#35).

### Modifié

- Documentation mise à jour au fil de l'eau : référence des modules et API
  Forge, source de vérité (#15) ; sections déploiement du README (#21, #22) ;
  état du projet et reste à faire sur une instance Atlassian (#33, #34) ;
  chiffres exacts — tests, latences, validations (#36, #39, #45) ; backlog
  d'audit — 103 manques classés et les dix meilleurs (#46).

### Corrigé

- CI : le contrôle de budget ne s'annule plus, check requis Mergify (#2,
  commit `5213ee4`) ; installation allégée — `@forge/react` reste dans les
  paquets d'app, `@forge/sql` rejoint les types (commit `c63ac3c`) ; délai de
  30 s par test vitest sur runners partagés (#20) ; l'agent de conflit reçoit
  l'URL de son fournisseur (#25) ; trois motifs refusés par couche0 dans la
  documentation et les gardes (commit `62a7687`).

[Non publié]: https://github.com/BaptisteFaisy/merge-avec-contexte/commits/main
[0.1.0]: https://github.com/BaptisteFaisy/merge-avec-contexte/commits/main
