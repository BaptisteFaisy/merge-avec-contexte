import { defineConfig } from 'vitest/config';

export default defineConfig({
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
    ],
  },
});
