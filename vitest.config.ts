import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { cc: resolve(import.meta.dirname, 'client/test/mock-cc/cc.ts') } },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'server/test/**/*.test.ts', 'tools/test/**/*.test.ts', 'client/test/**/*.test.ts'],
    environment: 'node',
  },
});
