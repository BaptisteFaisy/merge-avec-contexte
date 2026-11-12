#!/usr/bin/env -S npx vite-node --
/**
 * Point d'entrée de `npm run demo`.
 *
 * La démonstration vit dans `scripts/demo-e2e.ts` ; l'importer ne doit pas
 * la lancer (le module est aussi importé par les tests et par la preuve
 * réelle). C'est donc ce fichier, et lui seul, qui déclenche l'exécution.
 */
import { lancerDemonstration } from './demo-e2e';

await lancerDemonstration();
