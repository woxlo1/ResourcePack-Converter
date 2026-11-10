/**
 * Generates the application icon assets from apps/desktop/build/icon.svg.
 *
 * Run with: pnpm icons
 *
 * Outputs:
 *   apps/desktop/build/icon.png   512x512 PNG (Linux / electron-builder source)
 *   apps/desktop/build/icon.ico   multi-size Windows icon
 *   apps/desktop/build/icon.icns  multi-size macOS icon
 *   apps/web/public/favicon.svg   browser favicon
 *   apps/web/public/apple-touch-icon.png 180x180 touch icon
 */
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const desktopBuild = join(root, 'apps', 'desktop', 'build');
const webPublic = join(root, 'apps', 'web', 'public');

const svg = await readFile(join(desktopBuild, 'icon.svg'), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function renderPng(size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><html><head><style>
       html, body { margin: 0; padding: 0; background: transparent; }
       svg { display: block; width: ${size}px; height: ${size}px; }
     </style></head><body>${svg}</body></html>`,
  );
  return page.screenshot({ omitBackground: true, type: 'png' });
}

function buildIco(images) {
  const headerSize = 6 + images.length * 16;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = headerSize;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });

  return Buffer.concat([header, ...images.map((image) => image.png)]);
}

function buildIcns(entries) {
  const chunks = entries.map(({ type, png }) => {
    const chunk = Buffer.alloc(8 + png.length);
    chunk.write(type, 0, 4, 'ascii');
    chunk.writeUInt32BE(8 + png.length, 4);
    png.copy(chunk, 8);
    return chunk;
  });
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(8 + body.length, 4);
  return Buffer.concat([header, body]);
}

const sizes = [16, 32, 48, 64, 128, 180, 256, 512, 1024];
const rendered = new Map();
for (const size of sizes) {
  rendered.set(size, await renderPng(size));
}

await browser.close();
await mkdir(webPublic, { recursive: true });

const icoSizes = [16, 32, 48, 64, 128, 256];
await writeFile(
  join(desktopBuild, 'icon.ico'),
  buildIco(icoSizes.map((size) => ({ size, png: rendered.get(size) }))),
);

const icnsEntries = [
  ['ic11', 32],
  ['ic12', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic13', 256],
  ['ic09', 512],
  ['ic14', 512],
  ['ic10', 1024],
];
await writeFile(
  join(desktopBuild, 'icon.icns'),
  buildIcns(icnsEntries.map(([type, size]) => ({ type, png: rendered.get(size) }))),
);

await writeFile(join(desktopBuild, 'icon.png'), rendered.get(512));
await writeFile(join(webPublic, 'favicon.svg'), svg);
await writeFile(join(webPublic, 'apple-touch-icon.png'), rendered.get(180));

console.log('Generated icon.png, icon.ico, icon.icns, favicon.svg and apple-touch-icon.png.');
