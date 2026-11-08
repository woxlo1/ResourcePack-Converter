import type {
  ArchiveLimits,
  ConversionOptions,
  ConversionPlan,
  ConversionProgress,
  LogEntry,
  PackAnalysis,
} from '@rpc/core';
import type { SessionResult } from './types';

/** A folder file sent from the UI thread to the worker. */
export interface FolderEntry {
  path: string;
  data: ArrayBuffer;
}

export interface ImportResult {
  sourceId: string;
  name: string;
  zipSize: number;
  fileCount: number;
  totalUncompressedSize: number;
  analysis: PackAnalysis;
}

export interface SerializedError {
  code: string;
  messageKey: string;
  message: string;
  details?: string;
}

export type WorkerRequest =
  | {
      id: number;
      type: 'import-zip';
      name: string;
      data: ArrayBuffer;
      limits: ArchiveLimits;
    }
  | {
      id: number;
      type: 'import-folder';
      name: string;
      entries: FolderEntry[];
      limits: ArchiveLimits;
    }
  | {
      id: number;
      type: 'plan';
      sourceId: string;
      targetVersionId: string;
      preserveUnknownFiles: boolean;
    }
  | {
      id: number;
      type: 'convert';
      sourceId: string;
      options: ConversionOptions;
    }
  | { id: number; type: 'cancel'; sourceId: string }
  | { id: number; type: 'dispose'; sourceId: string };

export type WorkerResponse =
  | { type: 'imported'; id: number; result: ImportResult }
  | { type: 'planned'; id: number; plan: ConversionPlan }
  | { type: 'converted'; id: number; result: SessionResult }
  | { type: 'progress'; id: number; progress: ConversionProgress }
  | { type: 'log'; id: number; entry: LogEntry }
  | { type: 'cancelled'; id: number }
  | { type: 'disposed'; id: number }
  | { type: 'error'; id: number; error: SerializedError };
