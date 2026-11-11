import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Les écrans Forge importent `@forge/*` et `react` : hors plateforme, `@forge`
// lève à l'import et deux copies de React coexisteraient (celle de chaque app).
// On bouchonne `@forge/*` (tests de rendu) et on force un React unique, la copie
// racine. Les tests de rendu déclarent leur propre environnement jsdom ; le reste
// demeure en `node` (plus rapide).
export default defineConfig({
  resolve: {
    alias: [
      { find: '@forge/react', replacement: fileURLToPath(new URL('./tools/test-stubs/forge-react.tsx', import.meta.url)) },
      { find: '@forge/bridge', replacement: fileURLToPath(new URL('./tools/test-stubs/forge-bridge.ts', import.meta.url)) },
      { find: /^react$/, replacement: fileURLToPath(new URL('./node_modules/react', import.meta.url)) },
      { find: /^react-dom$/, replacement: fileURLToPath(new URL('./node_modules/react-dom', import.meta.url)) },
      { find: /^react\/jsx-runtime$/, replacement: fileURLToPath(new URL('./node_modules/react/jsx-runtime.js', import.meta.url)) },
      { find: /^react\/jsx-dev-runtime$/, replacement: fileURLToPath(new URL('./node_modules/react/jsx-dev-runtime.js', import.meta.url)) },
    ],
  },
  test: {
    environment: 'node',
    // Les runners auto-hébergés sont partagés : un test qui charge un module
    // dynamiquement peut mettre 20 s là où il en met 0,2 s en local. Un délai
    // large évite les faux rouges sans masquer une vraie lenteur du produit.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: [
      'shared/test/**/*.test.ts',
      'capteur/test/**/*.test.ts',
      'cerveau/test/**/*.test.ts',
      'scripts/test/**/*.test.ts',
      'capteur/test/**/*.test.tsx',
      'cerveau/test/**/*.test.tsx',
    ],
  },
});