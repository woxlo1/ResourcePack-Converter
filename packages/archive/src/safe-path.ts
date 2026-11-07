import { RpcError } from '@rpc/core';

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const DRIVE_PREFIX = /^[a-z]:/i;

/**
 * Normalizes an archive entry path and rejects anything that could escape the
 * extraction root. This is the single gate used for ZIP input, folder input and
 * ZIP output.
 */
export function normalizeArchivePath(rawPath: string): string {
  if (typeof rawPath !== 'string' || rawPath.length === 0) {
    throw new RpcError('UNSAFE_PATH', 'error.unsafePath', 'Archive entry has an empty path', String(rawPath));
  }
  if (rawPath.length > 512) {
    throw new RpcError('UNSAFE_PATH', 'error.unsafePath', 'Archive entry path is too long', rawPath);
  }
  if (rawPath.includes('\0')) {
    throw new RpcError('UNSAFE_PATH', 'error.unsafePath', 'Archive entry path contains a NUL byte', rawPath);
  }

  const slashed = rawPath.replace(/\\/g, '/');
  if (slashed.startsWith('/') || DRIVE_PREFIX.test(slashed) || slashed.startsWith('//')) {
    throw new RpcError('UNSAFE_PATH', 'error.unsafePath', 'Archive entry uses an absolute path', rawPath);
  }

  const segments = slashed.split('/');
  const normalized: string[] = [];
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      throw new RpcError('UNSAFE_PATH', 'error.unsafePath', 'Archive entry attempts path traversal', rawPath);
    }
    if (/[\u0000-\u001f\u007f]/.test(segment)) {
      throw new RpcError('UNSAFE_PATH', 'error.unsafePath', 'Archive entry contains control characters', rawPath);
    }
    if (segment.endsWith('.') || segment.endsWith(' ')) {
      throw new RpcError('UNSAFE_PATH', 'error.unsafePath', 'Archive entry ends with a dot or space', rawPath);
    }
    if (WINDOWS_RESERVED.test(segment)) {
      throw new RpcError('UNSAFE_PATH', 'error.unsafePath', 'Archive entry uses a reserved Windows name', rawPath);
    }
    normalized.push(segment);
  }

  if (normalized.length === 0) {
    throw new RpcError('UNSAFE_PATH', 'error.unsafePath', 'Archive entry has an empty normalized path', rawPath);
  }
  return normalized.join('/');
}

export function isSafeArchivePath(rawPath: string): boolean {
  try {
    normalizeArchivePath(rawPath);
    return true;
  } catch {
    return false;
  }
}

export function duplicatePathKey(path: string): string {
  return path.toLocaleLowerCase('en-US');
}

/** Throws when two entries collide on case-insensitive file systems. */
export function assertNoDuplicatePaths(paths: Iterable<string>): void {
  const seen = new Map<string, string>();
  for (const path of paths) {
    const key = duplicatePathKey(path);
    const previous = seen.get(key);
    if (previous !== undefined) {
      throw new RpcError(
        'DUPLICATE_ENTRY',
        'error.duplicateEntry',
        `Archive contains duplicate entries: "${previous}" and "${path}"`,
        path,
      );
    }
    seen.set(key, path);
  }
}
