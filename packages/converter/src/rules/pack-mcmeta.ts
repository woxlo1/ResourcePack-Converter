import {
  formatPackFormat,
  isFormatAtLeast,
  packFormat,
  type PackFormat,
} from '@rpc/core';
import type { ConversionRule, RuleContext, RulePlanContext } from '../rule-types';
import { requireRuleMetadata } from '../metadata';
import { cloneRecord, isRecord, jsonBytes, packFormatJson, parseJsonObject } from '../util';

/** Resource pack format that introduced min_format/max_format (1.21.9). */
export const MIN_MAX_FORMAT = packFormat(69, 0);

const MCMETA_PATH = 'pack.mcmeta';

interface PackDocument {
  raw: Record<string, unknown>;
  pack: Record<string, unknown>;
  created: boolean;
  invalid: boolean;
}

function readPackDocument(context: Pick<RuleContext, 'files'>): PackDocument {
  const bytes = context.files.get(MCMETA_PATH);
  if (!bytes) {
    return { raw: { pack: {} }, pack: {}, created: true, invalid: false };
  }
  const parsed = parseJsonObject(bytes);
  if (!parsed) {
    return { raw: { pack: {} }, pack: {}, created: false, invalid: true };
  }
  const raw = cloneRecord(parsed);
  const existing = isRecord(raw.pack) ? raw.pack : {};
  return { raw, pack: existing, created: false, invalid: false };
}

function writePackDocument(context: RuleContext, document: PackDocument): void {
  document.raw.pack = document.pack;
  if (typeof document.pack.description !== 'string' && !isRecord(document.pack.description) && !Array.isArray(document.pack.description)) {
    document.pack.description = 'Converted resource pack';
  }
  context.files.set(MCMETA_PATH, jsonBytes(document.raw));
}

function describeFormatChange(before: unknown, target: PackFormat): Record<string, unknown> {
  return { before: before ?? null, after: packFormatJson(target) };
}

const formatRule: ConversionRule = {
  metadata: requireRuleMetadata('rpc:pack-mcmeta/format'),
  plan(context: RulePlanContext) {
    return [
      {
        path: MCMETA_PATH,
        kind: 'pack-mcmeta',
        action: context.archiveFiles.has(MCMETA_PATH) ? 'convert' : 'regenerate',
        ruleIds: [this.metadata.id],
        reason: context.archiveFiles.has(MCMETA_PATH)
          ? 'Update pack_format for the target resource pack format.'
          : 'Generate a pack.mcmeta for the target resource pack format.',
      },
    ];
  },
  apply(context: RuleContext) {
    const document = readPackDocument(context);
    const before = document.pack.pack_format;
    const target = context.targetFormat;

    if (isFormatAtLeast(target, MIN_MAX_FORMAT)) {
      // The min/max rule owns the version fields for 1.21.9+.
      delete document.pack.pack_format;
      delete document.pack.supported_formats;
    } else {
      document.pack.pack_format = packFormatJson(target);
      delete document.pack.min_format;
      delete document.pack.max_format;
    }

    writePackDocument(context, document);
    context.addResult({
      ruleId: this.metadata.id,
      ruleName: this.metadata.name,
      status: document.invalid ? 'FAILED' : document.created ? 'WARNING' : 'SUCCESS',
      file: MCMETA_PATH,
      message: document.invalid
        ? 'pack.mcmeta could not be parsed and was regenerated.'
        : document.created
          ? 'pack.mcmeta was missing and has been generated.'
          : `pack.mcmeta now targets resource pack format ${formatPackFormat(target)}.`,
      before: describeFormatChange(before, target),
      after: describeFormatChange(document.pack.pack_format, target),
    });
  },
};

const minMaxRule: ConversionRule = {
  metadata: requireRuleMetadata('rpc:pack-mcmeta/min-max-format'),
  plan(context: RulePlanContext) {
    return [
      {
        path: MCMETA_PATH,
        kind: 'pack-mcmeta',
        action: context.archiveFiles.has(MCMETA_PATH) ? 'convert' : 'regenerate',
        ruleIds: [this.metadata.id],
        reason: 'Replace supported_formats with min_format/max_format.',
      },
    ];
  },
  apply(context: RuleContext) {
    const document = readPackDocument(context);
    const before = {
      pack_format: document.pack.pack_format ?? null,
      supported_formats: document.pack.supported_formats ?? null,
      min_format: document.pack.min_format ?? null,
      max_format: document.pack.max_format ?? null,
    };

    delete document.pack.pack_format;
    delete document.pack.supported_formats;
    document.pack.min_format = packFormatJson(context.targetFormat);
    document.pack.max_format = packFormatJson(context.targetFormat);

    writePackDocument(context, document);
    context.addResult({
      ruleId: this.metadata.id,
      ruleName: this.metadata.name,
      status: document.invalid ? 'FAILED' : document.created ? 'WARNING' : 'SUCCESS',
      file: MCMETA_PATH,
      message: document.invalid
        ? 'pack.mcmeta could not be parsed and was regenerated with min_format/max_format.'
        : `pack.mcmeta now declares min_format and max_format ${formatPackFormat(context.targetFormat)}.`,
      before,
      after: {
        pack_format: null,
        supported_formats: null,
        min_format: packFormatJson(context.targetFormat),
        max_format: packFormatJson(context.targetFormat),
      },
    });
  },
};

export const packMcmetaRules: ConversionRule[] = [formatRule, minMaxRule];
