import { RpcError, type ArchiveLimits, DEFAULT_ARCHIVE_LIMITS } from '@rpc/core';

export interface ZipDirectoryEntry {
  name: string;
  isDirectory: boolean;
  compressedSize: number;
  uncompressedSize: number;
  encrypted: boolean;
  compressionMethod: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const MAX_COMMENT = 65_535;

function invalid(message: string, details?: string): never {
  throw new RpcError('INVALID_ZIP', 'error.invalidZip', message, details);
}

function asSafeNumber(value: bigint, what: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) invalid(`${what} is too large`);
  return Number(value);
}

function readZip64Extra(
  extra: DataView,
  offset: number,
  length: number,
  entry: { compressedSize: number; uncompressedSize: number; localHeaderOffset: number },
): void {
  let position = 0;
  while (position + 4 <= length) {
    const id = extra.getUint16(offset + position, true);
    const size = extra.getUint16(offset + position + 2, true);
    const dataOffset = offset + position + 4;
    if (dataOffset + size > offset + length) break;
    if (id === 0x0001) {
      let cursor = dataOffset;
      if (entry.uncompressedSize === 0xffffffff && cursor + 8 <= dataOffset + size) {
        entry.uncompressedSize = asSafeNumber(extra.getBigUint64(cursor, true), 'Uncompressed size');
        cursor += 8;
      }
      if (entry.compressedSize === 0xffffffff && cursor + 8 <= dataOffset + size) {
        entry.compressedSize = asSafeNumber(extra.getBigUint64(cursor, true), 'Compressed size');
        cursor += 8;
      }
      if (entry.localHeaderOffset === 0xffffffff && cursor + 8 <= dataOffset + size) {
        entry.localHeaderOffset = asSafeNumber(extra.getBigUint64(cursor, true), 'Local header offset');
      }
      break;
    }
    position += 4 + size;
  }
}

/**
 * Reads the ZIP central directory without decompressing any entry. This is
 * intentionally independent of JSZip so that duplicate entries, encryption and
 * suspicious compression ratios are detected before decompression starts.
 */
export function readZipDirectory(data: Uint8Array): ZipDirectoryEntry[] {
  if (data.byteLength < 22) invalid('File is too small to be a ZIP archive');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  let eocdOffset = -1;
  const scanStart = Math.max(0, data.byteLength - 22 - MAX_COMMENT);
  for (let offset = data.byteLength - 22; offset >= scanStart; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) invalid('ZIP end-of-central-directory record was not found');

  let totalEntries = view.getUint16(eocdOffset + 10, true);
  let centralSize = view.getUint32(eocdOffset + 12, true);
  let centralOffset = view.getUint32(eocdOffset + 16, true);

  if (totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    const locatorOffset = eocdOffset - 20;
    if (locatorOffset < 0 || view.getUint32(locatorOffset, true) !== ZIP64_LOCATOR_SIGNATURE) {
      invalid('ZIP64 locator is missing');
    }
    const zip64Offset = asSafeNumber(view.getBigUint64(locatorOffset + 8, true), 'ZIP64 EOCD offset');
    if (zip64Offset + 56 > data.byteLength || view.getUint32(zip64Offset, true) !== ZIP64_EOCD_SIGNATURE) {
      invalid('ZIP64 end-of-central-directory record is invalid');
    }
    totalEntries = asSafeNumber(view.getBigUint64(zip64Offset + 32, true), 'Entry count');
    centralSize = asSafeNumber(view.getBigUint64(zip64Offset + 40, true), 'Central directory size');
    centralOffset = asSafeNumber(view.getBigUint64(zip64Offset + 48, true), 'Central directory offset');
  }

  if (centralOffset + centralSize > data.byteLength) invalid('ZIP central directory is outside the file');
  if (totalEntries > 1_000_000) invalid('ZIP contains an unreasonable number of entries');

  const entries: ZipDirectoryEntry[] = [];
  let cursor = centralOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (cursor + 46 > data.byteLength) invalid('ZIP central directory is truncated');
    if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) invalid('ZIP central directory entry is corrupt');

    const flags = view.getUint16(cursor + 8, true);
    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const entryEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (entryEnd > data.byteLength) invalid('ZIP central directory entry is truncated');

    const nameBytes = data.subarray(cursor + 46, cursor + 46 + nameLength);
    let name: string;
    try {
      name = new TextDecoder((flags & 0x0800) !== 0 ? 'utf-8' : 'utf-8', { fatal: false }).decode(nameBytes);
    } catch (error) {
      invalid('ZIP entry name is not valid text', String(error));
    }
    if (name.includes('\0')) invalid('ZIP entry name contains a NUL byte');

    const entry = {
      name,
      isDirectory: name.endsWith('/') || (view.getUint32(cursor + 38, true) & 0x10) !== 0,
      compressedSize,
      uncompressedSize,
      encrypted: (flags & 0x0001) !== 0 || (flags & 0x0040) !== 0,
      compressionMethod,
    };
    readZip64Extra(view, cursor + 46 + nameLength, extraLength, {
      compressedSize: entry.compressedSize,
      uncompressedSize: entry.uncompressedSize,
      localHeaderOffset,
    });
    entries.push(entry);
    cursor = entryEnd;
  }

  return entries;
}

function checkDirectoryLimits(entries: ZipDirectoryEntry[], limits: ArchiveLimits): void {
  const files = entries.filter((entry) => !entry.isDirectory);
  if (files.length > limits.maxFileCount) {
    throw new RpcError(
      'ZIP_TOO_MANY_FILES',
      'error.zipTooManyFiles',
      `Archive contains ${files.length} files; limit is ${limits.maxFileCount}`,
    );
  }
  let total = 0;
  let compressedTotal = 0;
  for (const entry of files) {
    if (entry.encrypted) {
      throw new RpcError('INVALID_ZIP', 'error.encryptedZip', 'Encrypted ZIP entries are not supported', entry.name);
    }
    if (
      entry.compressionMethod !== 0 &&
      entry.compressionMethod !== 8 &&
      entry.compressionMethod !== 12 &&
      entry.compressionMethod !== 14
    ) {
      throw new RpcError(
        'INVALID_ZIP',
        'error.invalidZip',
        `Unsupported ZIP compression method ${entry.compressionMethod}`,
        entry.name,
      );
    }
    if (entry.uncompressedSize > limits.maxSingleFileBytes) {
      throw new RpcError(
        'FILE_TOO_LARGE',
        'error.fileTooLarge',
        `Archive entry is too large: ${entry.uncompressedSize} bytes`,
        entry.name,
      );
    }
    total += entry.uncompressedSize;
    compressedTotal += entry.compressedSize;
    if (total > limits.maxTotalUncompressedBytes) {
      throw new RpcError(
        'ZIP_BOMB_SUSPECTED',
        'error.zipBomb',
        `Uncompressed archive size exceeds ${limits.maxTotalUncompressedBytes} bytes`,
      );
    }
    if (entry.uncompressedSize > 1024 * 1024) {
      const ratio = entry.compressedSize === 0 ? Infinity : entry.uncompressedSize / entry.compressedSize;
      if (ratio > limits.maxCompressionRatio) {
        throw new RpcError(
          'ZIP_BOMB_SUSPECTED',
          'error.zipBomb',
          `Suspicious compression ratio ${ratio.toFixed(1)} for entry`,
          entry.name,
        );
      }
    }
  }
  if (compressedTotal > 0 && total / compressedTotal > limits.maxCompressionRatio && total > 1024 * 1024) {
    throw new RpcError(
      'ZIP_BOMB_SUSPECTED',
      'error.zipBomb',
      `Suspicious overall compression ratio ${(total / compressedTotal).toFixed(1)}`,
    );
  }
}

export { checkDirectoryLimits };
