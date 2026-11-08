/**
 * Pure validation helpers shared by the Electron main process and unit tests.
 * Nothing here imports Electron, so it stays testable in a plain Node process.
 */

export const MAX_SAVE_BYTES = 512 * 1024 * 1024;
export const MAX_CLIPBOARD_TEXT_LENGTH = 8 * 1024 * 1024;
export const MAX_PICK_FILE_BYTES = 512 * 1024 * 1024;
export const MAX_PICK_TOTAL_BYTES = 512 * 1024 * 1024;
export const MAX_PICK_FILES = 20_000;

const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

function replaceUnsafeCharacters(value: string): string {
  let result = '';
  for (const character of value) {
    const code = character.charCodeAt(0);
    result += code < 0x20 || '<>:"|?*'.includes(character) ? '_' : character;
  }
  return result;
}

export interface SafeSaveRequest {
  fileName: string;
  data: Uint8Array;
  mimeType: string;
}

/**
 * Reduces an untrusted file name to a single safe path segment. Path
 * separators, control characters, Windows reserved names and trailing dots or
 * spaces are removed so the save dialog can never escape its default folder.
 */
export function sanitizeFileName(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 200) return null;

  const base = trimmed.replace(/\\/g, '/').split('/').pop() ?? '';
  if (!base || base === '.' || base === '..') return null;

  const cleaned = replaceUnsafeCharacters(base).replace(/[. ]+$/g, '');
  if (!cleaned || cleaned === '.' || cleaned === '..') return null;
  if (WINDOWS_RESERVED_NAMES.test(cleaned)) return null;
  return cleaned;
}

function toBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
}

/** Validates an IPC save request, returning null when any field is unsafe. */
export function parseSaveRequest(input: unknown): SafeSaveRequest | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  const fileName = sanitizeFileName(record.fileName);
  const data = toBytes(record.data);
  if (!fileName || !data) return null;
  if (data.byteLength <= 0 || data.byteLength > MAX_SAVE_BYTES) return null;

  const mimeType =
    typeof record.mimeType === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(record.mimeType)
      ? record.mimeType
      : 'application/octet-stream';
  return { fileName, data, mimeType };
}

export function isAllowedClipboardText(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_CLIPBOARD_TEXT_LENGTH;
}

/** Only our packaged `app://` origin and the Vite dev server may call IPC. */
export function isTrustedSenderUrl(url: string | null | undefined, devServerUrl?: string): boolean {
  if (!url) return false;
  if (url.startsWith('app://bundle/')) return true;
  if (devServerUrl) {
    const base = devServerUrl.endsWith('/') ? devServerUrl : `${devServerUrl}/`;
    if (url === devServerUrl || url.startsWith(base)) return true;
  }
  return false;
}

/**
 * Resolves a request path inside the packaged renderer directory. Returns null
 * for anything that escapes the directory (path traversal, encoded separators).
 */
export function resolveRendererPath(rendererDir: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\u0000')) return null;

  const normalizedDir = rendererDir.replace(/\\/g, '/').replace(/\/+$/, '');
  const relative = decoded.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments: string[] = [];
  for (const segment of relative.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..' || segment.includes(':')) return null;
    segments.push(segment);
  }
  if (segments.length === 0) return `${normalizedDir}/index.html`;
  return `${normalizedDir}/${segments.join('/')}`;
}
