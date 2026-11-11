import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'shared/test/**/*.test.ts',
      'capteur/test/**/*.test.ts',
      'cerveau/test/**/*.test.ts',
    ],
  },
});
