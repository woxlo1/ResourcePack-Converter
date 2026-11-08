import { useCallback } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_ARCHIVE_LIMITS, type ArchiveLimits, type ConversionOptions, type LogEntry } from '@rpc/core';
import { LATEST_VERSION } from '@rpc/version-registry';
import { translate, type TranslationKey } from './i18n';
import type {
  AppStatus,
  HistoryEntryView,
  Locale,
  ProgressState,
  Screen,
  SessionResult,
  Settings,
  SourceState,
  Theme,
  UiError,
} from './types';

const STORAGE_KEY = 'rpc.app-state.v1';
const MAX_HISTORY = 50;
const MAX_LOGS = 2_000;

export const DEFAULT_SETTINGS: Settings = {
  targetVersionId: LATEST_VERSION.id,
  validateAfterConversion: true,
  preserveUnknownFiles: true,
  detailedLogs: false,
  outputFileName: '',
  reportFormat: 'html',
  maxFileCount: DEFAULT_ARCHIVE_LIMITS.maxFileCount,
  maxTotalMb: Math.round(DEFAULT_ARCHIVE_LIMITS.maxTotalUncompressedBytes / (1024 * 1024)),
};

const IDLE_STATUS: AppStatus = { isImporting: false, isRunning: false, cancelling: false };

export function settingsToLimits(settings: Settings): ArchiveLimits {
  return {
    ...DEFAULT_ARCHIVE_LIMITS,
    maxFileCount: Math.max(1, Math.trunc(settings.maxFileCount)),
    maxTotalUncompressedBytes: Math.max(1, Math.trunc(settings.maxTotalMb)) * 1024 * 1024,
  };
}

export function settingsToOptions(settings: Settings): ConversionOptions {
  return {
    targetVersionId: settings.targetVersionId,
    limits: settingsToLimits(settings),
    validateAfterConversion: settings.validateAfterConversion,
    preserveUnknownFiles: settings.preserveUnknownFiles,
    detailedLogs: settings.detailedLogs,
    ...(settings.outputFileName.trim() ? { outputFileName: settings.outputFileName.trim() } : {}),
  };
}

interface AppState {
  screen: Screen;
  locale: Locale;
  theme: Theme;
  settings: Settings;
  source: SourceState | null;
  result: SessionResult | null;
  progress: ProgressState | null;
  logs: LogEntry[];
  status: AppStatus;
  error: UiError | null;
  history: HistoryEntryView[];
  notice: string | null;
  reportFormat: Settings['reportFormat'];

  setScreen: (screen: Screen) => void;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: Theme) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  resetSettings: () => void;
  setSource: (source: SourceState | null) => void;
  patchSource: (patch: Partial<SourceState>) => void;
  setResult: (result: SessionResult | null) => void;
  setProgress: (progress: ProgressState | null) => void;
  setLogs: (logs: LogEntry[]) => void;
  appendLog: (entry: LogEntry) => void;
  clearLogs: () => void;
  setStatus: (patch: Partial<AppStatus>) => void;
  setError: (error: UiError | null) => void;
  setNotice: (notice: string | null) => void;
  setReportFormat: (format: Settings['reportFormat']) => void;
  addHistory: (entry: HistoryEntryView) => void;
  removeHistory: (id: string) => void;
  clearHistory: () => void;
  resetSession: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      screen: 'home',
      locale: 'en',
      theme: 'system',
      settings: { ...DEFAULT_SETTINGS },
      source: null,
      result: null,
      progress: null,
      logs: [],
      status: { ...IDLE_STATUS },
      error: null,
      history: [],
      notice: null,
      reportFormat: DEFAULT_SETTINGS.reportFormat,

      setScreen: (screen) => set({ screen }),
      setLocale: (locale) => set({ locale }),
      setTheme: (theme) => set({ theme }),
      updateSettings: (patch) =>
        set((state) => ({
          settings: { ...state.settings, ...patch },
          reportFormat: patch.reportFormat ?? state.reportFormat,
        })),
      resetSettings: () =>
        set({ settings: { ...DEFAULT_SETTINGS }, reportFormat: DEFAULT_SETTINGS.reportFormat }),
      setSource: (source) => set({ source, result: null, progress: null, logs: [], error: null }),
      patchSource: (patch) =>
        set((state) => (state.source ? { source: { ...state.source, ...patch } } : {})),
      setResult: (result) => set({ result }),
      setProgress: (progress) => set({ progress }),
      setLogs: (logs) => set({ logs: logs.slice(-MAX_LOGS) }),
      appendLog: (entry) =>
        set((state) => {
          const next = [...state.logs, entry];
          return { logs: next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next };
        }),
      clearLogs: () => set({ logs: [] }),
      setStatus: (patch) => set((state) => ({ status: { ...state.status, ...patch } })),
      setError: (error) => set({ error }),
      setNotice: (notice) => set({ notice }),
      setReportFormat: (reportFormat) => set({ reportFormat }),
      addHistory: (entry) =>
        set((state) => ({
          history: [entry, ...state.history.filter((item) => item.id !== entry.id)].slice(0, MAX_HISTORY),
        })),
      removeHistory: (id) =>
        set((state) => ({ history: state.history.filter((item) => item.id !== id) })),
      clearHistory: () => set({ history: [] }),
      resetSession: () =>
        set({
          source: null,
          result: null,
          progress: null,
          logs: [],
          error: null,
          status: { ...IDLE_STATUS },
        }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({
        locale: state.locale,
        theme: state.theme,
        settings: state.settings,
        history: state.history,
        reportFormat: state.reportFormat,
      }),
      merge: (persisted, current) => {
        const value = persisted as Partial<AppState> | undefined;
        return {
          ...current,
          ...value,
          settings: { ...DEFAULT_SETTINGS, ...(value?.settings ?? {}) },
          status: { ...IDLE_STATUS },
          source: null,
          result: null,
          progress: null,
          logs: [],
          error: null,
          notice: null,
        };
      },
    },
  ),
);

export type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

export function useTranslation(): Translate {
  const locale = useAppStore((state) => state.locale);
  return useCallback<Translate>((key, params) => translate(locale, key, params), [locale]);
}
