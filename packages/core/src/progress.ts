import type { ConversionProgress } from './types';

export type ProgressReporter = (progress: ConversionProgress) => void;

export function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}

export function createProgressState(): ConversionProgress {
  return {
    stage: 'reading',
    totalFiles: 0,
    processedFiles: 0,
    successfulFiles: 0,
    warningFiles: 0,
    failedFiles: 0,
    percentage: 0,
  };
}

export function percentageOf(processed: number, total: number): number {
  if (total <= 0) return 0;
  return clampPercentage((processed / total) * 100);
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error ? signal.reason : new Error('Aborted');
  }
}
