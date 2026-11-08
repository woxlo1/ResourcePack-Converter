import { useCallback, useMemo } from 'react';
import type { ConversionPlan } from '@rpc/core';
import { exportReport, reportFileName, reportMimeType, type ReportFormat } from '@rpc/report';
import { translate, type TranslationKey } from './i18n';
import { toUiError } from './errors';
import { folderBundleFromDrop, folderBundleFromFiles, isZipFile } from './io';
import { useServices } from './services-context';
import { settingsToLimits, settingsToOptions, useAppStore } from './store';
import type { HistoryEntryView, UiError } from './types';
import { WorkerRequestError } from './worker-client';
import type { ImportResult } from './worker-protocol';

export interface AppActions {
  importZipFile: (file: File) => Promise<void>;
  importFolderFiles: (files: File[]) => Promise<void>;
  importDrop: (dataTransfer: DataTransfer) => Promise<void>;
  refreshPlan: () => Promise<ConversionPlan | null>;
  startConversion: () => Promise<void>;
  cancelConversion: () => Promise<void>;
  downloadOutput: () => Promise<void>;
  downloadReport: (format?: ReportFormat) => Promise<void>;
  copyReport: (format?: ReportFormat) => Promise<void>;
  resetSession: () => Promise<void>;
  openSourceAnalysis: () => void;
  notify: (message: string) => void;
}

function newId(): string {
  const value = globalThis.crypto?.randomUUID?.();
  if (value) return value;
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function describeFailure(error: unknown, fallbackKey: string): UiError {
  const ui = toUiError(error);
  if (ui.code === 'INTERNAL' && ui.messageKey === 'error.internal') {
    return { ...ui, messageKey: fallbackKey };
  }
  return ui;
}

export function useAppActions(): AppActions {
  const { client, workerError, platform } = useServices();

  const notify = useCallback((message: string): void => {
    useAppStore.getState().setNotice(message);
    window.setTimeout(() => {
      if (useAppStore.getState().notice === message) useAppStore.getState().setNotice(null);
    }, 4_000);
  }, []);

  const notifyKey = useCallback(
    (key: Parameters<typeof translateKey>[0], params?: Record<string, string | number>): void => {
      notify(translateKey(key, params));
    },
    [notify],
  );

  const disposeCurrent = useCallback(async (): Promise<void> => {
    const state = useAppStore.getState().source;
    if (!state || !client) return;
    try {
      await client.dispose(state.sourceId);
    } catch {
      // Disposing a stale worker source is best-effort.
    }
  }, [client]);

  const applyImported = useCallback((result: ImportResult): void => {
    const store = useAppStore.getState();
    store.setSource({
      sourceId: result.sourceId,
      name: result.name,
      zipSize: result.zipSize,
      analysis: result.analysis,
      plan: null,
    });
    store.setScreen('analysis');
  }, []);

  const ensureWorker = useCallback((): boolean => {
    if (client) return true;
    useAppStore.getState().setError({
      code: 'INTERNAL',
      messageKey: 'error.workerUnavailable',
      message: workerError ?? undefined,
    });
    return false;
  }, [client, workerError]);

  const importZipFile = useCallback(
    async (file: File): Promise<void> => {
      if (!ensureWorker() || !client) return;
      const store = useAppStore.getState();
      store.setError(null);
      store.setNotice(null);
      store.setStatus({ isImporting: true, isRunning: false, cancelling: false });
      try {
        const buffer = await file.arrayBuffer();
        await disposeCurrent();
        const result = await client.importZip(
          file.name,
          buffer,
          settingsToLimits(store.settings),
        );
        applyImported(result);
      } catch (error) {
        useAppStore.getState().setError(describeFailure(error, 'error.importFailed'));
      } finally {
        useAppStore.getState().setStatus({ isImporting: false });
      }
    },
    [applyImported, client, disposeCurrent, ensureWorker],
  );

  const importFolderPayload = useCallback(
    async (name: string, entries: { path: string; data: ArrayBuffer }[]): Promise<void> => {
      if (!ensureWorker() || !client) return;
      const store = useAppStore.getState();
      store.setError(null);
      store.setNotice(null);
      store.setStatus({ isImporting: true, isRunning: false, cancelling: false });
      try {
        await disposeCurrent();
        const result = await client.importFolder(name, entries, settingsToLimits(store.settings));
        applyImported(result);
      } catch (error) {
        useAppStore.getState().setError(describeFailure(error, 'error.importFailed'));
      } finally {
        useAppStore.getState().setStatus({ isImporting: false });
      }
    },
    [applyImported, client, disposeCurrent, ensureWorker],
  );

  const importFolderFiles = useCallback(
    async (files: File[]): Promise<void> => {
      if (files.length === 0) {
        useAppStore.getState().setError({
          code: 'INTERNAL',
          messageKey: 'error.noFile',
          message: 'No file was selected.',
        });
        return;
      }
      try {
        const bundle = await folderBundleFromFiles(files);
        await importFolderPayload(bundle.name, bundle.entries);
      } catch (error) {
        useAppStore.getState().setError(describeFailure(error, 'error.folderEmpty'));
      }
    },
    [importFolderPayload],
  );

  const importFromBundle = useCallback(
    async (bundle: { name: string; entries: { path: string; data: ArrayBuffer }[] } | null): Promise<void> => {
      if (!bundle) {
        useAppStore.getState().setError({
          code: 'INTERNAL',
          messageKey: 'error.noFile',
          message: 'No file was selected.',
        });
        return;
      }
      await importFolderPayload(bundle.name, bundle.entries);
    },
    [importFolderPayload],
  );

  const importDrop = useCallback(
    async (dataTransfer: DataTransfer): Promise<void> => {
      const files = Array.from(dataTransfer.files);
      const single = files.length === 1 ? files[0] : undefined;
      if (single && isZipFile(single)) {
        await importZipFile(single);
        return;
      }
      try {
        const bundle = await folderBundleFromDrop(dataTransfer);
        await importFromBundle(bundle);
      } catch (error) {
        useAppStore.getState().setError(describeFailure(error, 'error.folderEmpty'));
      }
    },
    [importFromBundle, importZipFile],
  );

  const refreshPlan = useCallback(async (): Promise<ConversionPlan | null> => {
    const store = useAppStore.getState();
    const source = store.source;
    if (!source || !client) return null;
    store.setError(null);
    try {
      const plan = await client.buildPlan(
        source.sourceId,
        store.settings.targetVersionId,
        store.settings.preserveUnknownFiles,
      );
      useAppStore.getState().patchSource({ plan });
      return plan;
    } catch (error) {
      useAppStore.getState().setError(describeFailure(error, 'error.planFailed'));
      return null;
    }
  }, [client]);

  const startConversion = useCallback(async (): Promise<void> => {
    const store = useAppStore.getState();
    const source = store.source;
    if (!source) {
      notifyKey('errors.noFile');
      store.setScreen('import');
      return;
    }
    if (!ensureWorker() || !client) return;

    const options = settingsToOptions(store.settings);
    const startedAt = Date.now();
    store.setError(null);
    store.setLogs([]);
    store.setResult(null);
    store.setProgress({
      stage: 'converting',
      totalFiles: source.analysis.fileCount,
      processedFiles: 0,
      successfulFiles: 0,
      warningFiles: 0,
      failedFiles: 0,
      percentage: 0,
    });
    store.setStatus({ isRunning: true, cancelling: false, isImporting: false });
    store.setScreen('progress');

    try {
      const result = await client.convert(source.sourceId, options, {
        onProgress: (progress) => useAppStore.getState().setProgress(progress),
        onLog: (entry) => useAppStore.getState().appendLog(entry),
      });
      const durationMs = Date.now() - startedAt;
      const report = result.report;
      const status: HistoryEntryView['status'] = report.cancelled
        ? 'cancelled'
        : report.failedCount > 0
          ? 'failed'
          : report.warningCount > 0
            ? 'warning'
            : 'success';
      const entry: HistoryEntryView = {
        id: newId(),
        packName: result.analysis.name,
        sourceVersion: report.sourceVersion,
        targetVersion: report.targetVersion,
        executedAt: new Date().toISOString(),
        durationMs,
        status,
        warnings: report.warningCount,
        errors: report.failedCount,
      };
      const current = useAppStore.getState();
      current.setResult(result);
      current.setLogs(result.logs);
      current.setProgress({
        stage: 'done',
        totalFiles: Math.max(1, result.outputFileCount),
        processedFiles: result.outputFileCount,
        successfulFiles: report.successCount,
        warningFiles: report.warningCount,
        failedFiles: report.failedCount,
        percentage: 100,
      });
      current.setStatus({ isRunning: false, cancelling: false });
      current.addHistory(entry);
      current.setScreen('result');
    } catch (error) {
      const current = useAppStore.getState();
      current.setError(describeFailure(error, 'error.conversionFailed'));
      current.setStatus({ isRunning: false, cancelling: false });
      current.setProgress(null);
      current.setScreen('configure');
    }
  }, [client, ensureWorker, notifyKey]);

  const cancelConversion = useCallback(async (): Promise<void> => {
    const store = useAppStore.getState();
    const source = store.source;
    if (!source || !client || store.status.cancelling) return;
    store.setStatus({ cancelling: true });
    try {
      await client.cancel(source.sourceId);
    } catch (error) {
      useAppStore.getState().setError(describeFailure(error, 'error.cancelled'));
      useAppStore.getState().setStatus({ cancelling: false });
    }
  }, [client]);

  const downloadOutput = useCallback(async (): Promise<void> => {
    const result = useAppStore.getState().result;
    if (!result?.outputZip) {
      notifyKey('result.noZip');
      return;
    }
    const saved = await platform.saveFile({
      fileName: result.outputName,
      data: result.outputZip,
      mimeType: 'application/zip',
    });
    if (saved) notifyKey('result.downloadSuccess');
    else notifyKey('errors.saveFailed');
  }, [notifyKey, platform]);

  const downloadReport = useCallback(
    async (format?: ReportFormat): Promise<void> => {
      const store = useAppStore.getState();
      const result = store.result;
      if (!result) return;
      const chosen = format ?? store.reportFormat;
      const text = exportReport(result.report, chosen, store.locale);
      const saved = await platform.saveFile({
        fileName: reportFileName(result.outputName, chosen, result.report.targetVersion),
        data: new TextEncoder().encode(text),
        mimeType: reportMimeType(chosen),
      });
      if (saved) notifyKey('result.downloadSuccess');
      else notifyKey('errors.saveFailed');
    },
    [notifyKey, platform],
  );

  const copyReport = useCallback(
    async (format?: ReportFormat): Promise<void> => {
      const store = useAppStore.getState();
      const result = store.result;
      if (!result) return;
      const chosen = format ?? store.reportFormat;
      const copied = await platform.copyText(exportReport(result.report, chosen, store.locale));
      notifyKey(copied ? 'result.copySuccess' : 'errors.saveFailed');
    },
    [notifyKey, platform],
  );

  const resetSession = useCallback(async (): Promise<void> => {
    await disposeCurrent();
    const store = useAppStore.getState();
    store.resetSession();
    store.setScreen('home');
  }, [disposeCurrent]);

  const openSourceAnalysis = useCallback((): void => {
    const source = useAppStore.getState().source;
    if (source) {
      useAppStore.getState().setScreen('analysis');
      return;
    }
    notifyKey('history.unavailable');
  }, [notifyKey]);

  return useMemo<AppActions>(
    () => ({
      importZipFile,
      importFolderFiles,
      importDrop,
      refreshPlan,
      startConversion,
      cancelConversion,
      downloadOutput,
      downloadReport,
      copyReport,
      resetSession,
      openSourceAnalysis,
      notify,
    }),
    [
      cancelConversion,
      copyReport,
      downloadOutput,
      downloadReport,
      importDrop,
      importFolderFiles,
      importZipFile,
      notify,
      openSourceAnalysis,
      refreshPlan,
      resetSession,
      startConversion,
    ],
  );
}

/** Translates a key using the current locale without subscribing to React state. */
export function translateKey(
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  return translate(useAppStore.getState().locale, key, params);
}

export function isWorkerError(error: unknown): error is WorkerRequestError {
  return error instanceof WorkerRequestError;
}
