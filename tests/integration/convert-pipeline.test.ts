import { describe, expect, it } from 'vitest';
import { DEFAULT_ARCHIVE_LIMITS, packFormat, type ConversionOptions } from '@rpc/core';
import { readZip } from '@rpc/archive';
import { runConversion } from '@rpc/shared';
import { convertZip } from '@rpc/shared';
import {
  decodeJson,
  decodeText,
  jsonBytes,
  legacyPack,
  legacyPackFiles,
  legacyPackZip,
  packFromFiles,
  pngBytes,
} from '../fixtures/pack';

function options(overrides: Partial<ConversionOptions> = {}): ConversionOptions {
  return {
    targetVersionId: '1.21.4',
    limits: DEFAULT_ARCHIVE_LIMITS,
    validateAfterConversion: true,
    preserveUnknownFiles: true,
    detailedLogs: true,
    ...overrides,
  };
}

describe('conversion pipeline', () => {
  it('converts a legacy ZIP end to end', async () => {
    const zip = await legacyPackZip();
    const progress: string[] = [];
    const result = await convertZip({
      zip,
      name: 'fixture-pack.zip',
      options: options(),
      onProgress: (value) => progress.push(value.stage),
    });

    expect(result.outputName).toBe('fixture-pack-1.21.4.zip');
    expect(result.output.report.cancelled).toBe(false);
    expect(result.output.report.targetFormat).toBe('46');
    expect(result.output.report.failedCount).toBe(0);
    expect(result.output.report.validation.error).toBe(0);
    expect(result.output.report.logs.length).toBeGreaterThan(0);
    expect(progress).toContain('converting');
    expect(progress).toContain('validating');
    expect(progress).toContain('done');
    expect(result.zip).not.toBeNull();

    const output = await readZip(result.zip!, 'output.zip');

    const mcmeta = decodeJson(output.files.get('pack.mcmeta'));
    expect(mcmeta.pack.pack_format).toBe(46);
    expect(mcmeta.pack.description).toBe('Fixture Pack');

    const itemDefinition = decodeJson(output.files.get('assets/minecraft/items/diamond_sword.json'));
    expect(itemDefinition.model.type).toBe('minecraft:range_dispatch');
    expect(itemDefinition.model.property).toBe('minecraft:damage');
    expect(itemDefinition.model.fallback.property).toBe('minecraft:custom_model_data');

    const model = decodeJson(output.files.get('assets/minecraft/models/item/diamond_sword.json'));
    expect(model.overrides).toBeUndefined();
    expect(model.parent).toBe('item/handheld');

    expect(output.files.has('assets/minecraft/textures/block/stone.png')).toBe(true);
    expect(output.files.has('assets/minecraft/textures/blocks/stone.png')).toBe(false);
    const stoneModel = decodeJson(output.files.get('assets/minecraft/models/block/stone.json'));
    expect(stoneModel.textures.all).toBe('block/stone');

    expect(decodeText(output.files.get('assets/minecraft/unknown/readme.bin'))).toBe('keep me');
    expect(decodeText(output.files.get('notes/custom.txt'))).toBe('custom note');
    expect(result.output.report.unknownFiles).toEqual(
      expect.arrayContaining(['assets/minecraft/unknown/readme.bin', 'notes/custom.txt']),
    );

    const created = result.output.report.files.find(
      (file) => file.path === 'assets/minecraft/items/diamond_sword.json',
    );
    expect(created?.status).toBe('SUCCESS');
    expect(created?.rules).toContain('rpc:item-model/overrides');
  });

  it('writes min_format/max_format for resource pack format 69', async () => {
    const archive = legacyPack();
    const output = await runConversion({ archive, zipSize: 0, options: options({ targetVersionId: '1.21.10' }) });
    const mcmeta = decodeJson(output.archive.files.get('pack.mcmeta'));
    expect(mcmeta.pack.pack_format).toBeUndefined();
    expect(mcmeta.pack.supported_formats).toBeUndefined();
    expect(mcmeta.pack.min_format).toBe(69);
    expect(mcmeta.pack.max_format).toBe(69);
  });

  it('leaves a model untouched when an items definition already exists', async () => {
    const files = legacyPackFiles();
    files.push({
      path: 'assets/minecraft/items/diamond_sword.json',
      data: jsonBytes({ model: { type: 'minecraft:model', model: 'minecraft:item/diamond_sword' } }),
    });
    const archive = packFromFiles('existing.zip', files);
    const output = await runConversion({ archive, zipSize: 0, options: options() });

    const model = decodeJson(output.archive.files.get('assets/minecraft/models/item/diamond_sword.json'));
    expect(model.overrides).toHaveLength(2);
    const definition = decodeJson(output.archive.files.get('assets/minecraft/items/diamond_sword.json'));
    expect(definition.model.model).toBe('minecraft:item/diamond_sword');

    const warning = output.report.ruleResults.find(
      (entry) => entry.ruleId === 'rpc:item-model/overrides' && entry.status === 'WARNING',
    );
    expect(warning?.message).toContain('already exists');
  });

  it('preserves the whole model when a predicate is unsupported', async () => {
    const files = legacyPackFiles();
    const modelPath = 'assets/minecraft/models/item/diamond_sword.json';
    const modelIndex = files.findIndex((file) => file.path === modelPath);
    const model = decodeJson(files[modelIndex]?.data);
    model.overrides.push({ predicate: { trim_type: 'gold' }, model: 'item/diamond_sword_trimmed' });
    files[modelIndex] = { path: modelPath, data: jsonBytes(model) };
    const archive = packFromFiles('unsupported.zip', files);
    const output = await runConversion({ archive, zipSize: 0, options: options() });

    const outputModel = decodeJson(output.archive.files.get(modelPath));
    expect(outputModel.overrides).toHaveLength(3);
    expect(output.archive.files.has('assets/minecraft/items/diamond_sword.json')).toBe(false);

    const file = output.report.files.find((entry) => entry.path === modelPath);
    expect(file?.status).toBe('UNSUPPORTED');
    expect(output.report.ruleResults.some((entry) => entry.status === 'UNSUPPORTED')).toBe(true);
  });

  it('does not mutate the input archive', async () => {
    const archive = legacyPack();
    const before = decodeText(archive.files.get('assets/minecraft/models/item/diamond_sword.json'));
    await runConversion({ archive, zipSize: 0, options: options() });
    const after = decodeText(archive.files.get('assets/minecraft/models/item/diamond_sword.json'));
    expect(after).toBe(before);
    expect(archive.files.has('assets/minecraft/items/diamond_sword.json')).toBe(false);
  });

  it('returns no ZIP when the run is cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const zip = await legacyPackZip();
    const result = await convertZip({
      zip,
      name: 'cancelled.zip',
      options: options(),
      signal: controller.signal,
    });
    expect(result.output.report.cancelled).toBe(true);
    expect(result.zip).toBeNull();
  });

  it('drops unknown files when preservation is disabled', async () => {
    const archive = legacyPack();
    const output = await runConversion({
      archive,
      zipSize: 0,
      options: options({ preserveUnknownFiles: false }),
    });
    expect(output.archive.files.has('assets/minecraft/unknown/readme.bin')).toBe(false);
    expect(output.archive.files.has('notes/custom.txt')).toBe(false);
    expect(output.report.unknownFiles).toContain('assets/minecraft/unknown/readme.bin');
  });

  it('produces deterministic output ZIPs', async () => {
    const zip = await legacyPackZip();
    const first = await convertZip({ zip, name: 'deterministic.zip', options: options() });
    const second = await convertZip({ zip, name: 'deterministic.zip', options: options() });
    expect(first.zip).not.toBeNull();
    expect(second.zip).not.toBeNull();
    expect(Array.from(first.zip!)).toEqual(Array.from(second.zip!));
  });

  it('keeps PNG bytes untouched', async () => {
    const archive = legacyPack();
    const source = archive.files.get('assets/minecraft/textures/blocks/stone.png');
    const output = await runConversion({ archive, zipSize: 0, options: options() });
    const moved = output.archive.files.get('assets/minecraft/textures/block/stone.png');
    expect(moved).toEqual(source);
    expect(moved).toEqual(pngBytes());
  });

  it('uses the requested output file name', async () => {
    const archive = legacyPack();
    const output = await runConversion({
      archive,
      zipSize: 0,
      options: options({ outputFileName: 'custom-name' }),
    });
    expect(output.report.resourcePackName).toBe('fixture-pack.zip');
    expect(output.plan.targetFormat).toEqual(packFormat(46));
  });
});
