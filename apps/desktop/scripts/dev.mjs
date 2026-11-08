import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import electronPath from 'electron';
import { createServer } from 'vite';

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));

const electronBuild = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'info',
};

async function buildElectron() {
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
}

const server = await createServer({
  configFile: join(appDir, 'vite.config.ts'),
  root: appDir,
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});
await server.listen();

const url = server.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:5173/';
console.log(`Renderer dev server: ${url}`);

await buildElectron();

const child = spawn(electronPath, ['.'], {
  cwd: appDir,
  stdio: 'inherit',
  env: { ...process.env, RPC_DEV_SERVER_URL: url },
});

let shuttingDown = false;
const shutdown = async (code = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  child.kill();
  await server.close();
  process.exit(code);
};

child.on('close', (code) => void shutdown(code ?? 0));
process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));
