import type {
  ArchiveLimits,
  ConversionOptions,
  ConversionPlan,
  ConversionProgress,
  LogEntry,
} from '@rpc/core';
import type { ImportResult, FolderEntry, SerializedError, WorkerRequest, WorkerResponse } from './worker-protocol';
import type { SessionResult } from './types';

/** Error raised by the conversion worker, carrying the stable RpcError code. */
export class WorkerRequestError extends Error {
  readonly code: string;
  readonly messageKey: string;
  readonly details?: string;

  constructor(serialized: SerializedError) {
    super(serialized.message);
    this.name = 'WorkerRequestError';
    this.code = serialized.code;
    this.messageKey = serialized.messageKey;
    this.details = serialized.details;
  }
}

export interface ConvertHooks {
  onProgress?: (progress: ConversionProgress) => void;
  onLog?: (entry: LogEntry) => void;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  onProgress?: (progress: ConversionProgress) => void;
  onLog?: (entry: LogEntry) => void;
}

export class ConversionWorkerClient {
  private readonly worker: Worker;
  private readonly pending = new Map<number, PendingRequest>();
  private nextId = 1;

  constructor(worker: Worker) {
    this.worker = worker;
    this.worker.addEventListener('message', this.handleMessage);
  }

  private handleMessage = (event: MessageEvent<WorkerResponse>): void => {
    const message = event.data;
    const pending = this.pending.get(message.id);
    if (!pending) return;

    switch (message.type) {
      case 'progress':
        pending.onProgress?.(message.progress);
        return;
      case 'log':
        pending.onLog?.(message.entry);
        return;
      case 'error':
        this.pending.delete(message.id);
        pending.reject(new WorkerRequestError(message.error));
        return;
      case 'imported':
        this.pending.delete(message.id);
        pending.resolve(message.result);
        return;
      case 'planned':
        this.pending.delete(message.id);
        pending.resolve(message.plan);
        return;
      case 'converted':
        this.pending.delete(message.id);
        pending.resolve(message.result);
        return;
      case 'cancelled':
      case 'disposed':
        this.pending.delete(message.id);
        pending.resolve(undefined);
        return;
      default:
        return;
    }
  };

  private send<T>(
    request: WorkerRequest,
    transfer: Transferable[] = [],
    hooks: ConvertHooks = {},
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.set(request.id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        ...(hooks.onProgress ? { onProgress: hooks.onProgress } : {}),
        ...(hooks.onLog ? { onLog: hooks.onLog } : {}),
      });
      try {
        this.worker.postMessage(request, transfer);
      } catch (error) {
        this.pending.delete(request.id);
        reject(error);
      }
    });
  }

  importZip(name: string, data: ArrayBuffer, limits: ArchiveLimits): Promise<ImportResult> {
    return this.send(
      { id: this.nextId++, type: 'import-zip', name, data, limits },
      [data],
    );
  }

  importFolder(name: string, entries: FolderEntry[], limits: ArchiveLimits): Promise<ImportResult> {
    return this.send(
      { id: this.nextId++, type: 'import-folder', name, entries, limits },
      entries.map((entry) => entry.data),
    );
  }

  buildPlan(
    sourceId: string,
    targetVersionId: string,
    preserveUnknownFiles: boolean,
  ): Promise<ConversionPlan> {
    return this.send({
      id: this.nextId++,
      type: 'plan',
      sourceId,
      targetVersionId,
      preserveUnknownFiles,
    });
  }

  convert(sourceId: string, options: ConversionOptions, hooks: ConvertHooks = {}): Promise<SessionResult> {
    return this.send(
      { id: this.nextId++, type: 'convert', sourceId, options },
      [],
      hooks,
    );
  }

  cancel(sourceId: string): Promise<void> {
    return this.send({ id: this.nextId++, type: 'cancel', sourceId });
  }

  dispose(sourceId: string): Promise<void> {
    return this.send({ id: this.nextId++, type: 'dispose', sourceId });
  }

  terminate(): void {
    for (const pending of this.pending.values()) {
      pending.reject(new Error('The conversion worker was terminated.'));
    }
    this.pending.clear();
    this.worker.removeEventListener('message', this.handleMessage);
    this.worker.terminate();
  }
}

/** Creates the Vite-bundled module worker that owns loaded source archives. */
export function createDefaultWorker(): Worker {
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
}
