import { toUserMessage, type ConversionProgress, type PackAnalysis, type PackArchive } from '@rpc/core';
import { analyzeArchive } from '@rpc/analyzer';
import { readFileEntries, readZip, writeZip } from '@rpc/archive';
import { buildConversionPlan, outputNameFor, runConversion } from '@rpc/shared';
import type { ImportResult, SerializedError, WorkerRequest, WorkerResponse } from './worker-protocol';
import type { SessionResult } from './types';

interface SourceRecord {
  archive: PackArchive;
  analysis: PackAnalysis;
  zipSize: number;
}

const scope = self as unknown as DedicatedWorkerGlobalScope;
const sources = new Map<string, SourceRecord>();
const controllers = new Map<string, AbortController>();
let sourceCounter = 0;

function nextSourceId(): string {
  sourceCounter += 1;
  const random =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `src-${random}-${sourceCounter}`;
}

function serializeError(error: unknown): SerializedError {
  const user = toUserMessage(error);
  return {
    code: user.code,
    messageKey: user.messageKey,
    message: error instanceof Error ? error.message : String(error),
    ...(user.details ? { details: user.details } : {}),
  };
}

function post(message: WorkerResponse, transfer: Transferable[] = []): void {
  scope.postMessage(message, transfer);
}

function progress(
  id: number,
  stage: ConversionProgress['stage'],
  total: number,
  processed: number,
  message: string,
): void {
  post({
    type: 'progress',
    id,
    progress: {
      stage,
      totalFiles: total,
      processedFiles: processed,
      successfulFiles: 0,
      warningFiles: 0,
      failedFiles: 0,
      percentage: total > 0 ? Math.min(100, Math.round((processed / total) * 1000) / 10) : 0,
      message,
    },
  });
}

function imported(sourceId: string, record: SourceRecord): ImportResult {
  return {
    sourceId,
    name: record.archive.name,
    zipSize: record.zipSize,
    fileCount: record.archive.files.size,
    totalUncompressedSize: record.archive.totalUncompressedSize,
    analysis: record.analysis,
  };
}

async function handleImportZip(request: Extract<WorkerRequest, { type: 'import-zip' }>): Promise<void> {
  const archive = await readZip(request.data, request.name, request.limits);
  const analysis = analyzeArchive(archive, request.data.byteLength);
  const sourceId = nextSourceId();
  const record: SourceRecord = { archive, analysis, zipSize: request.data.byteLength };
  sources.set(sourceId, record);
  post({ type: 'imported', id: request.id, result: imported(sourceId, record) });
}

async function handleImportFolder(request: Extract<WorkerRequest, { type: 'import-folder' }>): Promise<void> {
  const fileInputs = request.entries.map((entry) => ({
    path: entry.path,
    size: entry.data.byteLength,
    arrayBuffer: () => Promise.resolve(entry.data),
  }));
  const archive = await readFileEntries(fileInputs, request.name, request.limits);
  const analysis = analyzeArchive(archive, 0);
  const sourceId = nextSourceId();
  const record: SourceRecord = { archive, analysis, zipSize: 0 };
  sources.set(sourceId, record);
  post({ type: 'imported', id: request.id, result: imported(sourceId, record) });
}

function handlePlan(request: Extract<WorkerRequest, { type: 'plan' }>): void {
  const record = sources.get(request.sourceId);
  if (!record) throw new Error('The source pack is no longer loaded.');
  const plan = buildConversionPlan(
    record.archive,
    record.analysis,
    request.targetVersionId,
    request.preserveUnknownFiles,
  );
  post({ type: 'planned', id: request.id, plan });
}

async function handleConvert(request: Extract<WorkerRequest, { type: 'convert' }>): Promise<void> {
  const record = sources.get(request.sourceId);
  if (!record) throw new Error('The source pack is no longer loaded.');

  const controller = new AbortController();
  controllers.set(request.sourceId, controller);
  try {
    const output = await runConversion({
      archive: record.archive,
      zipSize: record.zipSize,
      options: request.options,
      signal: controller.signal,
      onProgress: (value) => {
        if (value.stage === 'done') return;
        post({ type: 'progress', id: request.id, progress: value });
      },
      onLog: (entry) => post({ type: 'log', id: request.id, entry }),
    });

    let zip: Uint8Array | null = null;
    if (!output.report.cancelled) {
      const total = output.archive.files.size;
      progress(request.id, 'writing', total, 0, 'Writing the converted ZIP archive');
      zip = await writeZip(output.archive);
      progress(request.id, 'done', total, total, 'Conversion finished');
    }

    const result: SessionResult = {
      analysis: output.analysis,
      plan: output.plan,
      validation: output.validation,
      report: output.report,
      outputZip: zip,
      outputName: outputNameFor(record.archive.name, request.options),
      logs: output.report.logs,
      outputFileCount: output.archive.files.size,
      outputTotalSize: output.archive.totalUncompressedSize,
    };
    const transfer: Transferable[] = zip ? [zip.buffer as ArrayBuffer] : [];
    post({ type: 'converted', id: request.id, result }, transfer);
  } finally {
    controllers.delete(request.sourceId);
  }
}

async function handle(request: WorkerRequest): Promise<void> {
  try {
    switch (request.type) {
      case 'import-zip':
        await handleImportZip(request);
        break;
      case 'import-folder':
        await handleImportFolder(request);
        break;
      case 'plan':
        handlePlan(request);
        break;
      case 'convert':
        await handleConvert(request);
        break;
      case 'cancel':
        controllers.get(request.sourceId)?.abort();
        post({ type: 'cancelled', id: request.id });
        break;
      case 'dispose':
        controllers.get(request.sourceId)?.abort();
        controllers.delete(request.sourceId);
        sources.delete(request.sourceId);
        post({ type: 'disposed', id: request.id });
        break;
      default:
        throw new Error('Unknown worker request.');
    }
  } catch (error) {
    post({ type: 'error', id: request.id, error: serializeError(error) });
  }
}

scope.onmessage = (event: MessageEvent<WorkerRequest>): void => {
  void handle(event.data);
};
