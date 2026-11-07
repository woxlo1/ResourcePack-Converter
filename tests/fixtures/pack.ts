import JSZip from 'jszip';
import { createPackArchive, type ArchiveFile } from '@rpc/archive';
import type { PackArchive } from '@rpc/core';

const encoder = new TextEncoder();

export function textBytes(value: string): Uint8Array {
  return encoder.encode(value);
}

export function jsonBytes(value: unknown): Uint8Array {
  return textBytes(`${JSON.stringify(value, null, 2)}\n`);
}

/** Minimal but structurally valid PNG (signature + IHDR). */
export function pngBytes(width = 16, height = 16): Uint8Array {
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

/** Minimal Ogg page signature followed by padding. */
export function oggBytes(): Uint8Array {
  const data = new Uint8Array(64);
  data.set([0x4f, 0x67, 0x67, 0x53], 0);
  return data;
}

export interface FixtureFile {
  path: string;
  data: Uint8Array;
}

/** A legacy (format 15 / 1.20.1) pack exercising every conversion path. */
export function legacyPackFiles(): FixtureFile[] {
  return [
    {
      path: 'pack.mcmeta',
      data: jsonBytes({ pack: { pack_format: 15, description: 'Fixture Pack' } }),
    },
    { path: 'pack.png', data: pngBytes(64, 64) },
    {
      path: 'assets/minecraft/models/item/diamond_sword.json',
      data: jsonBytes({
        parent: 'item/handheld',
        textures: { layer0: 'items/diamond_sword' },
        overrides: [
          { predicate: { custom_model_data: 1 }, model: 'item/diamond_sword_custom' },
          { predicate: { damage: 0.5 }, model: 'item/diamond_sword_damaged' },
        ],
      }),
    },
    {
      path: 'assets/minecraft/models/item/diamond_sword_custom.json',
      data: jsonBytes({ parent: 'item/handheld', textures: { layer0: 'items/diamond_sword_custom' } }),
    },
    {
      path: 'assets/minecraft/models/item/diamond_sword_damaged.json',
      data: jsonBytes({ parent: 'item/handheld', textures: { layer0: 'items/diamond_sword_damaged' } }),
    },
    {
      path: 'assets/minecraft/models/block/stone.json',
      data: jsonBytes({ parent: 'block/block', textures: { all: 'blocks/stone' } }),
    },
    {
      path: 'assets/minecraft/blockstates/stone.json',
      data: jsonBytes({ variants: { '': { model: 'minecraft:block/stone' } } }),
    },
    { path: 'assets/minecraft/textures/items/diamond_sword.png', data: pngBytes() },
    { path: 'assets/minecraft/textures/items/diamond_sword_custom.png', data: pngBytes() },
    { path: 'assets/minecraft/textures/items/diamond_sword_damaged.png', data: pngBytes() },
    { path: 'assets/minecraft/textures/blocks/stone.png', data: pngBytes() },
    {
      path: 'assets/minecraft/sounds.json',
      data: jsonBytes({
        test: { category: 'player', sounds: [{ name: 'minecraft:test', stream: false }] },
      }),
    },
    { path: 'assets/minecraft/sounds/test.ogg', data: oggBytes() },
    {
      path: 'assets/minecraft/lang/en_us.json',
      data: jsonBytes({ 'item.test': 'Test Item' }),
    },
    {
      path: 'assets/minecraft/font/default.json',
      data: jsonBytes({
        providers: [
          { type: 'bitmap', file: 'minecraft:font/test.png', ascent: 8, height: 8, chars: ['A'] },
        ],
      }),
    },
    { path: 'assets/minecraft/textures/font/test.png', data: pngBytes(8, 8) },
    { path: 'assets/minecraft/unknown/readme.bin', data: textBytes('keep me') },
    { path: 'notes/custom.txt', data: textBytes('custom note') },
  ];
}

export function packFromFiles(name: string, files: FixtureFile[]): PackArchive {
  const entries: ArchiveFile[] = files.map((file) => ({ path: file.path, data: file.data }));
  return createPackArchive(name, entries);
}

export function legacyPack(name = 'fixture-pack.zip'): PackArchive {
  return packFromFiles(name, legacyPackFiles());
}

export async function zipFromFiles(files: FixtureFile[]): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const file of files) zip.file(file.path, file.data, { binary: true });
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

export async function legacyPackZip(): Promise<Uint8Array> {
  return zipFromFiles(legacyPackFiles());
}

export function decodeJson(data: Uint8Array | undefined): any {
  if (!data) throw new Error('Missing file in fixture');
  return JSON.parse(new TextDecoder().decode(data));
}

export function decodeText(data: Uint8Array | undefined): string {
  if (!data) throw new Error('Missing file in fixture');
  return new TextDecoder().decode(data);
}
