import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    testTimeout: 10_000,
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'json-summary', 'html', 'lcov'],
      reportOnFailure: true,
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/server/index.ts',
        'src/client/main.tsx',
        'src/domain/types.ts',
        'src/client/types.ts',
        'src/client/pages/settlement/types.ts',
        'src/**/*.d.ts',
      ],
      thresholds: {
        // Die globale Schranke zählt bewusst auch React-TSX mit. Deren
        // Hauptabläufe werden zusätzlich in Playwright geprüft.
        lines: 40,
        statements: 40,
        branches: 75,
        functions: 75,
        'src/domain/**': {
          lines: 90,
          statements: 90,
          branches: 80,
          functions: 100,
        },
        'src/server/**': {
          lines: 85,
          statements: 85,
          branches: 75,
          functions: 95,
        },
        'src/shared/**': {
          lines: 80,
          statements: 80,
          branches: 70,
          functions: 100,
        },
        'src/client/**/*.ts': {
          lines: 95,
          statements: 95,
          branches: 85,
          functions: 95,
        },
      },
    },
  },
});
