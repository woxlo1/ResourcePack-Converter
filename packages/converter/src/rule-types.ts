import type {
  LogEntry,
  LogLevel,
  PackAnalysis,
  PackFormat,
  PlanItem,
  RuleMetadata,
  RuleResult,
  ConversionOptions,
} from '@rpc/core';

export interface RuleContext {
  files: Map<string, Uint8Array>;
  sourceFiles: ReadonlyMap<string, Uint8Array>;
  analysis: PackAnalysis;
  sourceFormat: PackFormat | null;
  targetFormat: PackFormat;
  options: ConversionOptions;
  addResult(result: RuleResult): void;
  log(level: LogLevel, message: string, file?: string, details?: string): void;
  throwIfCancelled(): void;
}

export interface RulePlanContext {
  archiveFiles: ReadonlyMap<string, Uint8Array>;
  analysis: PackAnalysis;
  sourceFormat: PackFormat | null;
  targetFormat: PackFormat;
}

export interface ConversionRule {
  metadata: RuleMetadata;
  plan(context: RulePlanContext): PlanItem[];
  apply(context: RuleContext): void | Promise<void>;
}

export type { LogEntry };
