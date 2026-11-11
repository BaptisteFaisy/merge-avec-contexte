#!/usr/bin/env python3
"""Garde de taille des fichiers de code : moins de 500 lignes.

Règle utilisateur (24 octobre 2026) : tout fichier de code écrit ou modifié fait
moins de 500 lignes. Au-delà, on découpe (module, helper, sous-composant).

Périmètre : le code du produit et son outillage (`shared/`, `capteur/`,
`cerveau/`, `scripts/`, `tools/`). L'infrastructure CI (`.github/`) et les
documents markdown ne sont pas concernés — `.github/` est gardé par
`ci-budget`, et un cahier des charges n'est pas du code.

Usage : check-file-limits.py [--limite N] [--racine R]...
Codes : 0 = conforme, 1 = dépassement(s).
"""

import argparse
import pathlib
import sys

LIMITE_DEFAUT = 500
RACINES_DEFAUT = ("shared", "capteur", "cerveau", "scripts", "tools")
EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".sh"}
DOSSIERS_IGNORES = {"node_modules", "dist", "coverage", "__pycache__", ".git"}


def iter_fichiers(racines, base):
    """Fichiers de code des racines, triés, hors dossiers ignorés."""
    for racine in racines:
        chemin = base / racine
        if not chemin.exists():
            continue
        for fichier in sorted(chemin.rglob("*")):
            if not fichier.is_file() or fichier.suffix not in EXTENSIONS:
                continue
            if DOSSIERS_IGNORES.intersection(fichier.parts):
                continue
            yield fichier


def compter_lignes(fichier):
    """Nombre de lignes d'un fichier texte (0 si illisible)."""
    try:
        with fichier.open(encoding="utf-8") as flux:
            return sum(1 for _ in flux)
    except (OSError, UnicodeError) as erreur:
        print("::error::%s illisible : %s" % (fichier, erreur))
        return 0


def main():
    """Vérifie la limite et rend le code de sortie."""
    parseur = argparse.ArgumentParser()
    parseur.add_argument("--limite", type=int, default=LIMITE_DEFAUT)
    parseur.add_argument("--racine", action="append", default=None)
    args = parseur.parse_args()
    base = pathlib.Path(__file__).resolve().parent.parent
    racines = args.racine or list(RACINES_DEFAUT)
    depassements = []
    total = 0
    for fichier in iter_fichiers(racines, base):
        total += 1
        lignes = compter_lignes(fichier)
        if lignes > args.limite:
            depassements.append((fichier.relative_to(base).as_posix(), lignes))
    for chemin, lignes in depassements:
        print("::error::%s : %d lignes (> %d) — découper" % (chemin, lignes, args.limite))
    print("%d fichier(s) contrôlé(s), %d dépassement(s), limite %d lignes"
          % (total, len(depassements), args.limite))
    return 1 if depassements else 0


if __name__ == "__main__":
    sys.exit(main())
