import {
  CancelledError,
  isCancelled,
  percentageOf,
  type ConversionOptions,
  type ConversionPlan,
  type ConversionProgress,
  type LogEntry,
  type LogLevel,
  type PackAnalysis,
  type PackArchive,
  type RuleResult,
} from '@rpc/core';
import { getApplicableRules } from '@rpc/version-registry';
import { getRuleImplementation } from './rules';
import type { RuleContext } from './rule-types';
import { yieldToEventLoop } from './util';

export interface ConversionHooks {
  signal?: AbortSignal;
  onProgress?: (progress: ConversionProgress) => void;
  onLog?: (entry: LogEntry) => void;
}

export interface ConvertedArchive {
  archive: PackArchive;
  ruleResults: RuleResult[];
  logs: LogEntry[];
  cancelled: boolean;
}

function createContext(
  files: Map<string, Uint8Array>,
  sourceFiles: ReadonlyMap<string, Uint8Array>,
  analysis: PackAnalysis,
  plan: ConversionPlan,
  options: ConversionOptions,
  results: RuleResult[],
  logs: LogEntry[],
  hooks: ConversionHooks,
  onResult: () => void,
): RuleContext {
  const signal = hooks.signal;
  const throwIfCancelled = (): void => {
    if (signal?.aborted) throw new CancelledError();
  };
  const log = (level: LogLevel, message: string, file?: string, details?: string): void => {
    if (level === 'DEBUG' && !options.detailedLogs) return;
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(file ? { file } : {}),
      ...(details ? { details } : {}),
    };
    logs.push(entry);
    hooks.onLog?.(entry);
  };
  return {
    files,
    sourceFiles,
    analysis,
    sourceFormat: plan.sourceFormat,
    targetFormat: plan.targetFormat,
    options,
    addResult(result) {
      results.push(result);
      onResult();
    },
    log,
    throwIfCancelled,
  };
}

/**
 * Applies the conversion rules described by the plan to a copy of the source
 * archive. The input archive is never mutated.
 */
export function applyConversion(
  archive: PackArchive,
  analysis: PackAnalysis,
  plan: ConversionPlan,
  options: ConversionOptions,
  hooks: ConversionHooks = {},
): Promise<ConvertedArchive> {
  return runConversionAsync(archive, analysis, plan, options, hooks);
}

async function runConversionAsync(
  archive: PackArchive,
  analysis: PackAnalysis,
  plan: ConversionPlan,
  options: ConversionOptions,
  hooks: ConversionHooks,
): Promise<ConvertedArchive> {
  const files = new Map<string, Uint8Array>(archive.files);
  const sourceFiles = archive.files;
  const ruleResults: RuleResult[] = [];
  const logs: LogEntry[] = [];

  const total = Math.max(1, plan.filesToConvert);
  const emitProgress = (stage: ConversionProgress['stage'], processed: number, message?: string): void => {
    hooks.onProgress?.({
      stage,
      totalFiles: plan.filesToConvert,
      processedFiles: Math.min(processed, total),
      successfulFiles: ruleResults.filter((result) => result.status === 'SUCCESS').length,
      warningFiles: ruleResults.filter((result) => result.status === 'WARNING').length,
      failedFiles: ruleResults.filter((result) => result.status === 'FAILED' || result.status === 'UNSUPPORTED').length,
      percentage: percentageOf(Math.min(processed, total), total),
      ...(message ? { message } : {}),
    });
  };

  const onResult = (): void => {
    emitProgress('converting', ruleResults.length);
  };

  const context = createContext(
    files,
    sourceFiles,
    analysis,
    plan,
    options,
    ruleResults,
    logs,
    hooks,
    onResult,
  );

  const logStart = (message: string): void => {
    const entry: LogEntry = { timestamp: new Date().toISOString(), level: 'INFO', message };
    logs.push(entry);
    hooks.onLog?.(entry);
  };

  logStart(`Converting ${archive.name} to resource pack format ${plan.targetFormat.major}${plan.targetFormat.minor ? `.${plan.targetFormat.minor}` : ''}.`);
  emitProgress('converting', 0, 'Applying conversion rules');

  const rules = getApplicableRules(plan.targetFormat, 'conversion');
  let cancelled = false;
  for (const metadata of rules) {
    await yieldToEventLoop();
    if (hooks.signal?.aborted) {
      cancelled = true;
      context.log('WARN', 'Conversion cancelled by the user.');
      break;
    }
    const rule = getRuleImplementation(metadata.id);
    if (!rule) {
      const result: RuleResult = {
        ruleId: metadata.id,
        ruleName: metadata.name,
        status: 'FAILED',
        message: 'Conversion rule metadata has no implementation.',
      };
      ruleResults.push(result);
      continue;
    }
    try {
      context.throwIfCancelled();
      await rule.apply(context);
    } catch (error) {
      if (isCancelled(error)) {
        cancelled = true;
        context.log('WARN', 'Conversion cancelled by the user.');
        break;
      }
      const result: RuleResult = {
        ruleId: metadata.id,
        ruleName: metadata.name,
        status: 'FAILED',
        message: 'The rule failed unexpectedly. Remaining files were left unchanged.',
        details: error instanceof Error ? error.message : String(error),
      };
      ruleResults.push(result);
      context.log('ERROR', result.message, undefined, result.details);
    }
    emitProgress('converting', ruleResults.length, metadata.name);
  }

  // Remove files that the plan marked as dropped (only possible when unknown-file
  // preservation is disabled).
  if (!cancelled) {
    for (const item of plan.items) {
      if (item.action === 'drop') files.delete(item.path);
    }
  }

  let totalUncompressedSize = 0;
  for (const data of files.values()) totalUncompressedSize += data.byteLength;

  emitProgress('converting', total, 'Conversion rules finished');

  return {
    archive: { name: archive.name, files, totalUncompressedSize },
    ruleResults,
    logs,
    cancelled,
  };
}

export type { RuleContext };
