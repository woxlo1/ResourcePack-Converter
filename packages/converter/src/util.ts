import type { PackFormat } from '@rpc/core';

export function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

export function parseJsonObject(data: Uint8Array): Record<string, unknown> | null {
  try {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(data).replace(/^\uFEFF/, '');
    const value = JSON.parse(text) as unknown;
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export function packFormatJson(format: PackFormat): number | [number, number] {
  return format.minor > 0 ? [format.major, format.minor] : format.major;
}

export function resourceRef(value: string, defaultNamespace = 'minecraft'): string {
  return value.includes(':') ? value : `${defaultNamespace}:${value}`;
}

export function namespaceOf(value: string): string {
  const index = value.indexOf(':');
  return index >= 0 ? value.slice(0, index) : 'minecraft';
}

export function pathOf(value: string): string {
  const index = value.indexOf(':');
  return index >= 0 ? value.slice(index + 1) : value;
}

/** Yields to the event loop so workers can process progress and cancel messages. */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
