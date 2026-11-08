import { writeFile } from 'node:fs/promises';
import JSZip from 'jszip';

const encoder = new TextEncoder();

function jsonBytes(value: unknown): Uint8Array {
  return encoder.encode(`${JSON.stringify(value, null, 2)}\n`);
}

function pngBytes(width = 16, height = 16): Uint8Array {
  const data = new Uint8Array(33);
  data.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(data.buffer);
  view.setUint32(8, 13, false);
  data.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  data[24] = 8;
  data[25] = 6;
  return data;
}

function oggBytes(): Uint8Array {
  const data = new Uint8Array(64);
  data.set([0x4f, 0x67, 0x67, 0x53], 0);
  return data;
}

/**
 * Builds the legacy (format 15 / 1.20.1) fixture used by the browser and
 * Electron end-to-end tests. Kept dependency-free so Playwright can load it
 * without the workspace path aliases used by Vitest.
 */
export async function createLegacyPackZip(target: string): Promise<string> {
  const files: [string, Uint8Array][] = [
    ['pack.mcmeta', jsonBytes({ pack: { pack_format: 15, description: 'Fixture Pack' } })],
    ['pack.png', pngBytes(64, 64)],
    [
      'assets/minecraft/models/item/diamond_sword.json',
      jsonBytes({
        parent: 'item/handheld',
        textures: { layer0: 'items/diamond_sword' },
        overrides: [
          { predicate: { custom_model_data: 1 }, model: 'item/diamond_sword_custom' },
          { predicate: { damage: 0.5 }, model: 'item/diamond_sword_damaged' },
        ],
      }),
    ],
    [
      'assets/minecraft/models/item/diamond_sword_custom.json',
      jsonBytes({ parent: 'item/handheld', textures: { layer0: 'items/diamond_sword_custom' } }),
    ],
    [
      'assets/minecraft/models/item/diamond_sword_damaged.json',
      jsonBytes({ parent: 'item/handheld', textures: { layer0: 'items/diamond_sword_damaged' } }),
    ],
    [
      'assets/minecraft/models/block/stone.json',
      jsonBytes({ parent: 'block/block', textures: { all: 'blocks/stone' } }),
    ],
    [
      'assets/minecraft/blockstates/stone.json',
      jsonBytes({ variants: { '': { model: 'minecraft:block/stone' } } }),
    ],
    ['assets/minecraft/textures/items/diamond_sword.png', pngBytes()],
    ['assets/minecraft/textures/items/diamond_sword_custom.png', pngBytes()],
    ['assets/minecraft/textures/items/diamond_sword_damaged.png', pngBytes()],
    ['assets/minecraft/textures/blocks/stone.png', pngBytes()],
    [
      'assets/minecraft/sounds.json',
      jsonBytes({
        test: { category: 'player', sounds: [{ name: 'minecraft:test', stream: false }] },
      }),
    ],
    ['assets/minecraft/sounds/test.ogg', oggBytes()],
    ['assets/minecraft/lang/en_us.json', jsonBytes({ 'item.test': 'Test Item' })],
    [
      'assets/minecraft/font/default.json',
      jsonBytes({
        providers: [
          { type: 'bitmap', file: 'minecraft:font/test.png', ascent: 8, height: 8, chars: ['A'] },
        ],
      }),
    ],
    ['assets/minecraft/textures/font/test.png', pngBytes(8, 8)],
    ['assets/minecraft/unknown/readme.bin', encoder.encode('keep me')],
    ['notes/custom.txt', encoder.encode('custom note')],
  ];

  const zip = new JSZip();
  for (const [path, data] of files) zip.file(path, data, { binary: true });
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  await writeFile(target, bytes);
  return target;
}
