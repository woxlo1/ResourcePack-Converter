import { describe, expect, it } from 'vitest';
import type { ConversionReport } from '@rpc/core';
import {
  exportReport,
  reportExtension,
  reportFileName,
  reportMimeType,
  toCsvReport,
  toHtmlReport,
  toJsonReport,
  toTextReport,
} from '@rpc/report';

const report: ConversionReport = {
  reportVersion: 1,
  resourcePackName: 'fixture-pack.zip',
  sourceVersion: '1.20 – 1.20.1',
  targetVersion: '1.21.4',
  sourceFormat: '15',
  targetFormat: '46',
  startedAt: '2026-01-01T00:00:00.000Z',
  finishedAt: '2026-01-01T00:00:01.000Z',
  durationMs: 1000,
  cancelled: false,
  totalFiles: 3,
  successCount: 2,
  warningCount: 1,
  failedCount: 0,
  skippedCount: 0,
  unsupportedCount: 0,
  validation: { pass: 4, warning: 1, error: 0, notChecked: 0 },
  validationIssues: [
    {
      path: 'assets/minecraft/textures/block/stone.png',
      status: 'WARNING',
      code: 'MISSING_REFERENCE_MODEL_TEXTURE',
      message: 'Referenced resource does not exist: minecraft:block/missing',
      details: 'details',
    },
  ],
  ruleResults: [
    { ruleId: 'rpc:pack-mcmeta/format', ruleName: 'pack.mcmeta', status: 'SUCCESS', message: 'Updated pack format.' },
  ],
  files: [
    {
      path: 'assets/minecraft/models/item/<sword>.json',
      kind: 'model',
      status: 'SUCCESS',
      rules: ['rpc:item-model/overrides'],
      warnings: [],
      errors: [],
      notes: ['created'],
    },
    {
      path: 'assets/minecraft/items/sword.json',
      kind: 'item-definition',
      status: 'WARNING',
      rules: ['rpc:item-model/overrides'],
      warnings: ['Approximated using_item.'],
      errors: [],
      notes: [],
    },
  ],
  unknownFiles: [],
  logs: [
    { timestamp: '2026-01-01T00:00:00.000Z', level: 'INFO', message: 'Started' },
    { timestamp: '2026-01-01T00:00:01.000Z', level: 'WARN', message: 'Approximated', file: 'assets/x.json' },
  ],
};

describe('report exporters', () => {
  it('exports JSON that round-trips', () => {
    const parsed = JSON.parse(toJsonReport(report));
    expect(parsed.resourcePackName).toBe('fixture-pack.zip');
    expect(parsed.files).toHaveLength(2);
  });

  it('escapes HTML and includes report data', () => {
    const html = toHtmlReport(report);
    expect(html).toContain('&lt;sword&gt;');
    expect(html).not.toContain('<sword>');
    expect(html).toContain('MISSING_REFERENCE_MODEL_TEXTURE');
    expect(html).toContain('ResourcePack Converter Report');
    expect(toHtmlReport(report, 'ja')).toContain('変換レポート');
  });

  it('exports text and CSV with locale labels', () => {
    const text = toTextReport(report);
    expect(text).toContain('ResourcePack Converter Report');
    expect(text).toContain('SUCCESS');
    expect(text).toContain('assets/minecraft/models/item/<sword>.json');
    const csv = toCsvReport(report);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('assets/minecraft/models/item/<sword>.json');
    expect(csv).toContain('rpc:item-model/overrides');
  });

  it('dispatches all supported formats', () => {
    expect(exportReport(report, 'json')).toContain('"reportVersion": 1');
    expect(exportReport(report, 'html')).toContain('<!doctype html>');
    expect(exportReport(report, 'txt')).toContain('ResourcePack Converter Report');
    expect(exportReport(report, 'csv')).toContain('Path,Kind,Status');
  });

  it('provides MIME types, extensions and safe file names', () => {
    expect(reportMimeType('json')).toContain('application/json');
    expect(reportMimeType('html')).toContain('text/html');
    expect(reportMimeType('csv')).toContain('text/csv');
    expect(reportMimeType('txt')).toContain('text/plain');
    expect(reportExtension('json')).toBe('json');
    expect(reportFileName('my:pack<>.zip', 'html', '1.21.4')).toBe('my_pack__-1.21.4-report.html');
  });
});
