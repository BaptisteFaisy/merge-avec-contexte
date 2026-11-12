# Dossier de preuve — une preuve vérifiable par étape

La démo (`npm run demo`) montre le produit sur un jeu de données **fictif**.
Ce dossier montre le produit sur des données **réelles**, et pour chaque étape il
donne **un élément qui prouve que l'étape a fonctionné** — plus un contrôle
automatique qui revérifie cet élément sur le moment.

| # | Étape | Élément de preuve | Capture | Contrôle automatique |
|---|---|---|---|---|
| 1 | Les tickets existent vraiment | `https://one-atlas-cndz.atlassian.net/browse/MAC-2` et `…/MAC-3`, avec la réponse JSON brute de l'API Jira | `captures/etape-1-ticket-mac-2.json`, `captures/etape-1-ticket-mac-3.json` | le ticket est relu sur le site et comparé champ par champ |
| 2 | Le Cerveau lit le **vrai** Jira | le verdict cite la clé et les critères du ticket réel : « MAC-2 : 2 critère(s) d'acceptation non coché(s). » | `captures/etape-2-verdict-mac-2.json` | signature HMAC **recalculée** sur le corps enregistré + cas **rejoué** en direct |
| 3 | Idem sur le ticket propre | le verdict sur `MAC-3`, avec l'avertissement de version | `captures/etape-2b-verdict-mac-3.json` | idem |
| 4 | La carte expose les treize règles | corps de la réponse de la route `card` | `captures/etape-3-carte-13-regles.json` | route rejouée, compte des règles |
| 5 | Sans signature, la porte reste close | HTTP 401 | `captures/etape-4-requete-non-signee.json` | requête rejouée sans signature |
| 6 | Le Capteur est installé sur l'espace Bitbucket | `forge install list` : installation `2e2b050c-…`, « Connected to https://bitbucket.org/one-atlas-cndz/ » | `captures/etape-5-capteur-installe.json` | sortie de la CLI relue |
| 7 | La donnée est visible | captures d'écran des deux tickets réels | `docs/img/11-jira-ticket-mac2.png`, `docs/img/11b-jira-ticket-mac3.png` | — |

## Revérifier maintenant

```bash
MAC_BRIDGE_URL=<pont> MAC_SHARED_SECRET=<secret> npm run preuve:verifier
```

Sortie (un exemple réel) :

```
OK   etape-1-ticket-mac-2         GET …/rest/api/3/issue/MAC-2 → 200 3 case(s) d'acceptation, statut En cours
OK   etape-1-ticket-mac-3         GET …/rest/api/3/issue/MAC-3 → 200 2 case(s) d'acceptation, statut En cours
OK   etape-2-verdict-mac-2        signature HMAC recalculée + cas rejoué (blocked) signature conforme, verdict identique, 1145 ms
OK   etape-2b-verdict-mac-3       signature HMAC recalculée + cas rejoué (blocked) signature conforme, verdict identique, 998 ms
OK   etape-3-carte-13-regles      route `card` rejouée                       13 règle(s) exposée(s)
OK   etape-4-requete-non-signee   requête rejouée sans signature             HTTP 401
OK   etape-5-capteur-installe     forge install list -e production           Capteur installé sur l’espace Bitbucket

7 étape(s) vérifiée(s), 0 en échec
```

## Ce que contient une capture

```json
{
  "etape": "etape-2-verdict-mac-2",
  "titre": "Verdict réel sur MAC-2",
  "horodatage": "2026-11-12T…Z",
  "requete": { "url": "…", "entetes": { "x-mac-signature": "…", "x-mac-nonce": "…", "x-mac-timestamp": "…" }, "corps": {…} },
  "reponse": { "statut": 200, "corps": { "verdict": "blocked", "message": "Bloqué, 2 raisons.…" } },
  "preuve": { "ticket": "MAC-2", "urlJira": "https://…/browse/MAC-2", "verdict": "blocked", "signature": "…" },
  "empreinte": "sha256:…"
}
```

- le **secret partagé n'apparaît jamais** : seule la signature HMAC est conservée ;
- l'**empreinte** `sha256:` porte sur le contenu de la capture : une capture modifiée
  après coup est détectée par le vérificateur ;
- la signature est **recalculée** par le vérificateur à partir du corps enregistré :
  elle ne peut correspondre que si le corps est exactement celui qui a été signé.

## Refaire les captures

```bash
MAC_BRIDGE_URL=<pont> MAC_SHARED_SECRET=<secret> npm run preuve:captures
```

## Limites, dites franchement

1. **Côté Bitbucket, la preuve s'arrête à l'installation.** L'espace `one-atlas-cndz`
   refuse toute écriture depuis cette IP (`To access this workspace, an admin must
   whitelist your IP.`, HTTP 403) : pas de dépôt, pas de PR, pas d'activation des
   *custom merge checks* tant que l'allowlist n'est pas levée (voir §5 de
   `docs/PREUVE-REELLE.md`).
2. **Les écrans Jira de l'app ne se rendent pas** sur ce site provisionné (UI Kit) :
   la preuve passe donc par l'API, les journaux et les captures d'écran des tickets,
   pas par l'interface de l'app.
3. **Le verdict de `MAC-3` reste « blocked »** tant que R-02 compare des noms de statut
   localisés : l'app lit « In Progress », la liste blanche contient « En cours »
   (corrigé en cours, voir `docs/PREUVE-REELLE.md` §4).
