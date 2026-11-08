import type {
  ConversionPlan,
  ConversionProgress,
  ConversionReport,
  LogEntry,
  PackAnalysis,
  ValidationResult,
} from '@rpc/core';
import type { ReportFormat } from '@rpc/report';

export type Screen =
  | 'home'
  | 'import'
  | 'analysis'
  | 'configure'
  | 'preview'
  | 'progress'
  | 'result'
  | 'history'
  | 'settings';

export type Locale = 'en' | 'ja';
export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  targetVersionId: string;
  validateAfterConversion: boolean;
  preserveUnknownFiles: boolean;
  detailedLogs: boolean;
  outputFileName: string;
  reportFormat: ReportFormat;
  maxFileCount: number;
  maxTotalMb: number;
}

export interface UiError {
  code: string;
  messageKey: string;
  details?: string;
  message?: string;
}

/** A resource pack loaded into the conversion worker. */
export interface SourceState {
  sourceId: string;
  name: string;
  zipSize: number;
  analysis: PackAnalysis;
  plan: ConversionPlan | null;
}

export interface SessionResult {
  analysis: PackAnalysis;
  plan: ConversionPlan;
  validation: ValidationResult;
  report: ConversionReport;
  outputZip: Uint8Array | null;
  outputName: string;
  logs: LogEntry[];
  outputFileCount: number;
  outputTotalSize: number;
}

export interface AppStatus {
  isImporting: boolean;
  isRunning: boolean;
  cancelling: boolean;
}

export interface ProgressState extends ConversionProgress {
  message?: string;
}

export interface HistoryEntryView {
  id: string;
  packName: string;
  sourceVersion: string;
  targetVersion: string;
  executedAt: string;
  durationMs: number;
  status: 'success' | 'warning' | 'failed' | 'cancelled';
  warnings: number;
  errors: number;
}

export type ConvertStatus = 'success' | 'warning' | 'failed' | 'cancelled';

export interface ImportSummary {
  fileName: string;
  zipSize: number;
  fileCount: number;
  totalUncompressedSize: number;
}
