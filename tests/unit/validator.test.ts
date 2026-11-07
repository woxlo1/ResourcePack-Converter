import { describe, expect, it } from 'vitest';
import { packFormat } from '@rpc/core';
import { analyzeArchive } from '@rpc/analyzer';
import { validateArchive } from '@rpc/validator';
import {
  decodeJson,
  jsonBytes,
  legacyPack,
  oggBytes,
  packFromFiles,
  pngBytes,
  textBytes,
} from '../fixtures/pack';

function validate(files: Parameters<typeof packFromFiles>[1], target = packFormat(46)) {
  const archive = packFromFiles('test.zip', files);
  const analysis = analyzeArchive(archive, 0);
  return validateArchive(archive, analysis, { targetFormat: target });
}

function codes(result: ReturnType<typeof validate>): string[] {
  return result.issues.map((issue) => issue.code);
}

describe('validator', () => {
  it('flags invalid PNG and OGG signatures', () => {
    const result = validate([
      { path: 'pack.mcmeta', data: jsonBytes({ pack: { pack_format: 46, description: 'x' } }) },
      { path: 'assets/minecraft/textures/block/broken.png', data: textBytes('not a png') },
      { path: 'assets/minecraft/sounds/broken.ogg', data: textBytes('not an ogg') },
    ]);
    expect(codes(result)).toContain('PNG_SIGNATURE');
    expect(codes(result)).toContain('OGG_SIGNATURE');
    expect(result.summary.error).toBeGreaterThanOrEqual(2);
  });

  it('flags a valid-but-empty PNG header', () => {
    const result = validate([
      { path: 'pack.mcmeta', data: jsonBytes({ pack: { pack_format: 46, description: 'x' } }) },
      { path: 'assets/minecraft/textures/block/empty.png', data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
    ]);
    expect(codes(result)).toContain('PNG_SIGNATURE');
  });

  it('requires min_format and max_format for target format 69', () => {
    const result = validate(
      [{ path: 'pack.mcmeta', data: jsonBytes({ pack: { pack_format: 15, description: 'x' } }) }],
      packFormat(69),
    );
    expect(codes(result)).toContain('PACK_MCMETA_MIN_MAX');
    expect(codes(result)).toContain('PACK_MCMETA_PACK_FORMAT');
  });

  it('accepts min_format and max_format for target format 69', () => {
    const result = validate(
      [
        {
          path: 'pack.mcmeta',
          data: jsonBytes({ pack: { min_format: [69, 0], max_format: [69, 0], description: 'x' } }),
        },
      ],
      packFormat(69),
    );
    expect(codes(result)).not.toContain('PACK_MCMETA_MIN_MAX');
    expect(codes(result)).not.toContain('PACK_MCMETA_PACK_FORMAT');
  });

  it('flags unknown item model node types', () => {
    const result = validate([
      { path: 'pack.mcmeta', data: jsonBytes({ pack: { pack_format: 46, description: 'x' } }) },
      {
        path: 'assets/minecraft/items/test.json',
        data: jsonBytes({ model: { type: 'minecraft:not_real' } }),
      },
    ]);
    expect(codes(result)).toContain('ITEMS_MODEL_TYPE');
  });

  it('validates item model references and conditions', () => {
    const result = validate([
      { path: 'pack.mcmeta', data: jsonBytes({ pack: { pack_format: 46, description: 'x' } }) },
      {
        path: 'assets/minecraft/items/test.json',
        data: jsonBytes({
          model: {
            type: 'minecraft:condition',
            property: 'minecraft:damaged',
            on_true: { type: 'minecraft:model', model: 'minecraft:item/a' },
            on_false: { type: 'minecraft:model', model: 'minecraft:item/b' },
          },
        }),
      },
    ]);
    expect(codes(result)).toContain('ITEMS_DEFINITION_OK');
    expect(codes(result)).not.toContain('ITEMS_MODEL_TYPE');
  });

  it('validates animation metadata dimensions', () => {
    const result = validate([
      { path: 'pack.mcmeta', data: jsonBytes({ pack: { pack_format: 46, description: 'x' } }) },
      { path: 'assets/minecraft/textures/block/anim.png', data: pngBytes(16, 32) },
      {
        path: 'assets/minecraft/textures/block/anim.png.mcmeta',
        data: jsonBytes({ animation: { height: 16, frames: [0, 1] } }),
      },
    ]);
    expect(codes(result)).toContain('TEXTURE_MCMETA_OK');
  });

  it('validates legacy_unicode fonts against modern targets', () => {
    const result = validate([
      { path: 'pack.mcmeta', data: jsonBytes({ pack: { pack_format: 46, description: 'x' } }) },
      {
        path: 'assets/minecraft/font/default.json',
        data: jsonBytes({ providers: [{ type: 'legacy_unicode', sizes: 'minecraft:font/glyph_sizes.bin', template: 'minecraft:font/unicode_page_%s.png' }] }),
      },
    ]);
    expect(codes(result)).toContain('FONT_LEGACY_UNICODE');
  });

  it('passes a valid fixture archive without schema errors', () => {
    const archive = legacyPack();
    const analysis = analyzeArchive(archive, 0);
    const result = validateArchive(archive, analysis, { targetFormat: packFormat(46) });
    const errorIssues = result.issues.filter((issue) => issue.status === 'ERROR');
    // The fixture is intentionally valid; only missing-reference warnings are allowed.
    expect(errorIssues).toEqual([]);
    expect(decodeJson(archive.files.get('pack.mcmeta')).pack.description).toBe('Fixture Pack');
    expect(archive.files.get('assets/minecraft/sounds/test.ogg')?.slice(0, 4)).toEqual(oggBytes().slice(0, 4));
  });
});
