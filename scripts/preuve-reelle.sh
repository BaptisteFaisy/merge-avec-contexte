#!/usr/bin/env bash
# Preuve réelle — bascule le Cerveau en mode « données réelles », joue les cas
# réels, puis restaure la démonstration.
#
# Ce que fait ce script, dans l'ordre :
#   1. bascule le Cerveau de production en mode réel (MAC_DEMO_DATA=0) et
#      annonce l'espace Bitbucket réellement jumelé (uuid de one-atlas-cndz) ;
#   2. redéploie l'app (les variables ne s'appliquent qu'au déploiement) ;
#   3. joue scripts/preuve-reelle.ts : vrais tickets Jira, vrais verdicts ;
#   4. restaure la démonstration et redéploie, quoi qu'il arrive.
#
# Variables d'environnement reconnues :
#   MAC_BRIDGE_URL   adresse du pont (par défaut : ~/.atlassian/bridge-url-prod.txt)
#   MAC_SHARED_SECRET  secret partagé (par défaut : ~/.atlassian/demo-shared-secret)
#   MAC_ESPACE_UUID  uuid de l'espace Bitbucket (par défaut : one-atlas-cndz)
#
# Usage : bash scripts/preuve-reelle.sh
set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
FORGE="$HOME/.atlassian/cli/node_modules/.bin/forge"
ESPACE="${MAC_ESPACE_UUID:-ws-demo}"
PONT="${MAC_BRIDGE_URL:-$(cat "$HOME/.atlassian/bridge-url-prod.txt")}"
SECRET="${MAC_SHARED_SECRET:-$(cat "$HOME/.atlassian/demo-shared-secret")}"

# L'espace annoncé dans les requêtes doit être celui avec lequel le Cerveau est
# jumelé : tant que l'écran de réglages Jira ne rend pas son interface (voir
# docs/PREUVE-REELLE.md §7), le jumelage mémorisé reste `ws-demo`. Passer
# `MAC_ESPACE_UUID='{b44dcce8-…}'` après un jumelage réel.

# Basculer le Cerveau : 0 = données réelles, 1 = jeu de démonstration.
basculer() {
  local demo="$1" espace="$2"
  (cd "$RACINE/cerveau" && "$FORGE" variables set MAC_DEMO_DATA "$demo" -e production >/dev/null &&
    "$FORGE" variables set MAC_DEMO_REFRESH "$demo" -e production >/dev/null &&
    "$FORGE" variables set MAC_PAIRED_WORKSPACE "$espace" -e production >/dev/null) ||
    { echo "KO : variables non posées"; return 1; }
}

# Redéployer l'app (les variables ne prennent effet qu'au déploiement).
deployer() {
  (cd "$RACINE" && MAC_BRIDGE_URL="$PONT" node scripts/deploiement.mjs cerveau production >/tmp/deploy-preuve.log 2>&1) ||
    { echo "KO : déploiement ; voir /tmp/deploy-preuve.log"; return 1; }
}

echo "→ bascule en mode réel (espace $ESPACE)"
basculer 0 "$ESPACE" && deployer || exit 1

echo "→ cas réels"
(cd "$RACINE" && MAC_BRIDGE_URL="$PONT" MAC_SHARED_SECRET="$SECRET" MAC_WORKSPACE="$ESPACE" \
  npx vite-node scripts/preuve-reelle.ts)
CODE=$?

echo "→ restauration de la démonstration"
basculer 1 "ws-demo" && deployer || echo "ATTENTION : restauration à faire à la main"

exit "$CODE"
