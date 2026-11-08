import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const root = fileURLToPath(new URL('../../', import.meta.url));
const alias = (name: string) => `${root}packages/${name}/src/index.ts`;

const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/** Injects a strict CSP into the packaged renderer only (dev needs Vite HMR). */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'rpc-content-security-policy',
    apply: 'build',
    transformIndexHtml(html) {
      const meta = `    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />\n`;
      return html.replace('  </head>', `${meta}  </head>`);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), contentSecurityPolicy()],
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
    strictPort: true,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  worker: {
    format: 'es',
  },
});
