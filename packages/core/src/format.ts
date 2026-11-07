/**
 * Minecraft pack formats are versioned with a major number and, since
 * resource pack format 65 / 1.21.9, an optional minor number.
 */
export interface PackFormat {
  major: number;
  minor: number;
}

export function packFormat(major: number, minor = 0): PackFormat {
  return { major, minor };
}

export function formatPackFormat(format: PackFormat): string {
  return format.minor > 0 ? `${format.major}.${format.minor}` : String(format.major);
}

export function comparePackFormat(a: PackFormat, b: PackFormat): number {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  return 0;
}

export function isFormatAtLeast(a: PackFormat, b: PackFormat): boolean {
  return comparePackFormat(a, b) >= 0;
}

export function isFormatBefore(a: PackFormat, b: PackFormat): boolean {
  return comparePackFormat(a, b) < 0;
}

/**
 * Parses the pack format representations accepted by pack.mcmeta:
 * a plain integer, a single-element array, or a [major, minor] array.
 */
export function parsePackFormat(value: unknown): PackFormat | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return packFormat(Math.trunc(value), 0);
  }
  if (Array.isArray(value) && value.length >= 1 && value.length <= 2) {
    const major = value[0];
    const minor = value.length === 2 ? value[1] : 0;
    if (
      typeof major === 'number' &&
      Number.isFinite(major) &&
      major >= 0 &&
      typeof minor === 'number' &&
      Number.isFinite(minor) &&
      minor >= 0
    ) {
      return packFormat(Math.trunc(major), Math.trunc(minor));
    }
  }
  return null;
}

export type FormatRange = { min: PackFormat; max: PackFormat };

export function normalizeFormatRange(value: unknown): FormatRange | null {
  // A two-element array is ambiguous: supported_formats uses [min, max] while
  // pack_format uses [major, minor]. Prefer the range reading, then fall back to
  // the single-format reading (for example [69, 1] cannot be a valid range).
  if (Array.isArray(value) && value.length === 2) {
    const min = parsePackFormat(value[0]);
    const max = parsePackFormat(value[1]);
    if (min && max && comparePackFormat(min, max) <= 0) return { min, max };
    const single = parsePackFormat(value);
    return single ? { min: single, max: single } : null;
  }
  const single = parsePackFormat(value);
  if (single) return { min: single, max: single };
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const min = parsePackFormat(record.min_inclusive ?? record.min);
    const max = parsePackFormat(record.max_inclusive ?? record.max);
    if (min && max && comparePackFormat(min, max) <= 0) return { min, max };
  }
  return null;
}
