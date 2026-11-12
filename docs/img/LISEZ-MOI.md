# `docs/img/` — convention de nommage des captures

Dossier des captures d'écran de la soumission (voir `docs/CAPTURES.md` pour la check-list
complète et `docs/SOUMISSION.md` §D pour la liste récapitulative).

## Règle

`NN[-suffixe]-<plateforme>-<ecran>.png`

- **NN** : un numéro à deux chiffres (`01`, `02`, …), dans l'ordre de la check-list.
- **suffixe** : une lettre minuscule pour une variante (`06b`).
- **plateforme** : `bitbucket`, `jira`, `terminal` ou `site` (le site public du projet).
- **ecran** : un nom court et explicite.
- Tout en minuscules, sans accents, sans espaces, tirets `-` comme séparateur, extension `.png`.

Exemples : `01-bitbucket-resultat-controle.png`, `04-jira-reglages-projet.png`,
`06b-jira-journal.png`, `07-terminal-demo-e2e.png`.

## Tableau des fichiers attendus

| Fichier | Écran (§12) | État |
|---|---|---|
| `01-bitbucket-resultat-controle.png` | 1 — résultat du contrôle (merge checks natifs) | à capturer — reporté sans espace de travail |
| `02-bitbucket-carte-pr.png` | 2 — carte de PR (colonne de droite) | à capturer — reporté sans espace de travail |
| `03-bitbucket-reglages-espace.png` | 3 — réglages de l'espace de travail | à capturer — reporté sans espace de travail |
| `04-jira-reglages-projet.png` | 4 — réglages du projet | à capturer |
| `05-jira-encart-ticket.png` | 5 — encart sur le ticket | à capturer |
| `06-jira-console-test.png` | 6 — console de test | à capturer |
| `06b-jira-journal.png` | 7 — journal (même page) | à capturer |
| `07-terminal-demo-e2e.png` | sortie de `npm run demo` | à capturer |
| `08-jira-agent-rovo.png` | agent Rovo (bonus) | à capturer si possible |
| `09-terminal-client-mcp.png` | appel MCP (bonus) | à capturer si possible |
| `10-site-accueil-en.png` | 10 — site public (accueil, anglais) | capturé |
| `10b-site-accueil-fr.png` | 10 — site public (accueil, français) | capturé |
| `11-jira-ticket-mac2.png` | 11 — ticket réel MAC-2 (critères, composant, lien) | capturé |
| `11b-jira-ticket-mac3.png` | 11 — ticket réel MAC-3 (critères cochés) | capturé |

## Consignes

- **Largeur** : ≥ 1600 px pour une lecture confortable dans la galerie Devpost.
- **Propreté** : pas de barre d'outils, pas de favoris, pas d'onglet superflu ; fenêtre
  redimensionnée pour ne montrer que l'écran utile.
- **Langue** : anglais si possible (voir `docs/CAPTURES.md`, étape 0-A), sinon français.
- **Dates** : recharger le jeu de démonstration juste avant (les dates sont relatives à
  l'instant du chargement).
- **Sécurité** : aucune image ne doit divulguer de secret ou d'adresse de clé — vérifier
  chaque fichier, en particulier `07-terminal-demo-e2e.png`.
- Ne pas commettre une image prise ailleurs que sur l'instance réelle : une capture inventée
  est pire qu'une capture absente.