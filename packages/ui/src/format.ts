import type { FileKind, PlanAction, RuleStatus, ValidationStatus } from '@rpc/core';
import type { Locale } from './i18n';

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB'];

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const precision = unit === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${BYTE_UNITS[unit]}`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0 ms';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1)} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes} min ${rest} s`;
}

export function formatDate(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(locale === 'ja' ? 'ja-JP' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

export function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

export function stripZipExtension(name: string): string {
  return name.replace(/\.zip$/i, '');
}

export function statusTone(status: RuleStatus | ValidationStatus): 'ok' | 'warn' | 'err' | 'muted' {
  switch (status) {
    case 'SUCCESS':
    case 'PASS':
      return 'ok';
    case 'WARNING':
      return 'warn';
    case 'FAILED':
    case 'UNSUPPORTED':
    case 'ERROR':
      return 'err';
    default:
      return 'muted';
  }
}

export function fileKindLabelKey(kind: FileKind):
  | 'analysis.jsonFiles'
  | 'analysis.textures'
  | 'analysis.models'
  | 'analysis.itemDefs'
  | 'analysis.blockstates'
  | 'analysis.sounds'
  | 'analysis.fonts'
  | 'analysis.shaders'
  | 'analysis.unknown' {
  switch (kind) {
    case 'model':
      return 'analysis.models';
    case 'blockstate':
      return 'analysis.blockstates';
    case 'item-definition':
      return 'analysis.itemDefs';
    case 'texture':
    case 'pack-png':
      return 'analysis.textures';
    case 'sound':
      return 'analysis.sounds';
    case 'font':
      return 'analysis.fonts';
    case 'shader':
      return 'analysis.shaders';
    case 'unknown':
      return 'analysis.unknown';
    default:
      return 'analysis.jsonFiles';
  }
}

export function actionLabelKey(action: PlanAction):
  | 'preview.action.convert'
  | 'preview.action.validate'
  | 'preview.action.preserve'
  | 'preview.action.regenerate'
  | 'preview.action.unsupported'
  | 'preview.action.drop' {
  switch (action) {
    case 'convert':
      return 'preview.action.convert';
    case 'validate':
      return 'preview.action.validate';
    case 'preserve':
      return 'preview.action.preserve';
    case 'regenerate':
      return 'preview.action.regenerate';
    case 'unsupported':
      return 'preview.action.unsupported';
    case 'drop':
    default:
      return 'preview.action.drop';
  }
}

export function actionTone(action: PlanAction): 'ok' | 'warn' | 'err' | 'muted' | 'info' {
  switch (action) {
    case 'convert':
    case 'regenerate':
      return 'info';
    case 'validate':
      return 'ok';
    case 'preserve':
      return 'muted';
    case 'unsupported':
      return 'err';
    case 'drop':
    default:
      return 'warn';
  }
}

export function shortPath(path: string, max = 72): string {
  if (path.length <= max) return path;
  const head = Math.floor((max - 3) / 2);
  const tail = max - 3 - head;
  return `${path.slice(0, head)}…${path.slice(path.length - tail)}`;
}

export function joinPath(...parts: string[]): string {
  return parts
    .filter((part) => part.length > 0)
    .join('/')
    .replace(/\/{2,}/g, '/');
}
