import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';
import { build as viteBuild } from 'vite';

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));

const electronBuild = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  sourcemap: false,
  logLevel: 'info',
};

await viteBuild({ configFile: join(appDir, 'vite.config.ts'), root: appDir });

await build({
  ...electronBuild,
  entryPoints: [join(appDir, 'electron', 'main.ts')],
  outfile: join(appDir, 'dist-electron', 'main.cjs'),
});

await build({
  ...electronBuild,
  entryPoints: [join(appDir, 'electron', 'preload.ts')],
  outfile: join(appDir, 'dist-electron', 'preload.cjs'),
});

console.log('Desktop build complete: dist/ and dist-electron/');
