import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));
const alias = (name: string): string => `${root}packages/${name}/src/index.ts`;

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@rpc\/core$/, replacement: alias('core') },
      { find: /^@rpc\/archive$/, replacement: alias('archive') },
      { find: /^@rpc\/version-registry$/, replacement: alias('version-registry') },
      { find: /^@rpc\/analyzer$/, replacement: alias('analyzer') },
      { find: /^@rpc\/converter$/, replacement: alias('converter') },
      { find: /^@rpc\/validator$/, replacement: alias('validator') },
      { find: /^@rpc\/report$/, replacement: alias('report') },
      { find: /^@rpc\/shared$/, replacement: alias('shared') },
      { find: /^@rpc\/ui$/, replacement: alias('ui') },
    ],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['packages/ui/**'],
    },
  },
});
