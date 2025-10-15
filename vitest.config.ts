import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
    coverage: {
      reporter: ['text', 'lcov'],
    },
  },
});
