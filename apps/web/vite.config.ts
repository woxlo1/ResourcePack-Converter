import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('../../', import.meta.url));
const alias = (name: string) => `${root}packages/${name}/src/index.ts`;

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@rpc\/ui$/, replacement: alias('ui') },
      { find: /^@rpc\/shared$/, replacement: alias('shared') },
      { find: /^@rpc\/core$/, replacement: alias('core') },
      { find: /^@rpc\/archive$/, replacement: alias('archive') },
      { find: /^@rpc\/version-registry$/, replacement: alias('version-registry') },
      { find: /^@rpc\/analyzer$/, replacement: alias('analyzer') },
      { find: /^@rpc\/converter$/, replacement: alias('converter') },
      { find: /^@rpc\/validator$/, replacement: alias('validator') },
      { find: /^@rpc\/report$/, replacement: alias('report') },
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  worker: {
    format: 'es',
  },
});
