import JSZip from 'jszip';
import {
  DEFAULT_ARCHIVE_LIMITS,
  RpcError,
  type ArchiveLimits,
  type PackArchive,
} from '@rpc/core';
import { assertNoDuplicatePaths, normalizeArchivePath } from './safe-path';
import { checkDirectoryLimits, readZipDirectory } from './zip-directory';

const FIXED_ZIP_DATE = new Date(Date.UTC(1980, 0, 1, 0, 0, 0));
const MAX_ZIP64_ENTRIES = 1_000_000;

function toBytes(input: ArrayBuffer | Uint8Array): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

function validateNames(names: string[]): void {
  for (const name of names) normalizeArchivePath(name);
  assertNoDuplicatePaths(names);
}

function assertZipSize(size: number, limits: ArchiveLimits): void {
  if (size > limits.maxZipBytes) {
    throw new RpcError(
      'ZIP_TOO_LARGE',
      'error.zipTooLarge',
      `ZIP file is too large: ${size} bytes (limit ${limits.maxZipBytes})`,
    );
  }
}

/**
 * Reads a ZIP archive into memory with all security checks applied before any
 * entry is decompressed.
 */
export async function readZip(
  input: ArrayBuffer | Uint8Array,
  name: string,
  limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS,
): Promise<PackArchive> {
  const bytes = toBytes(input);
  assertZipSize(bytes.byteLength, limits);

  let directory;
  try {
    directory = readZipDirectory(bytes);
  } catch (error) {
    if (error instanceof RpcError) throw error;
    throw new RpcError('INVALID_ZIP', 'error.invalidZip', 'ZIP central directory could not be read', String(error));
  }

  const fileEntries = directory.filter((entry) => !entry.isDirectory);
  checkDirectoryLimits(directory, limits);
  const normalizedByOriginal = new Map<string, string>();
  const names: string[] = [];
  for (const entry of fileEntries) {
    const safeName = normalizeArchivePath(entry.name);
    normalizedByOriginal.set(entry.name, safeName);
    names.push(safeName);
  }
  assertNoDuplicatePaths(names);

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes, { checkCRC32: false, createFolders: false });
  } catch (error) {
    throw new RpcError('INVALID_ZIP', 'error.invalidZip', 'ZIP archive could not be opened', String(error));
  }

  const files = new Map<string, Uint8Array>();
  let totalUncompressedSize = 0;
  for (const entry of fileEntries) {
    const safeName = normalizedByOriginal.get(entry.name);
    if (!safeName) continue;
    const zipEntry = zip.files[entry.name] ?? Object.values(zip.files).find((candidate) => candidate.name === entry.name);
    if (!zipEntry) {
      throw new RpcError('INVALID_ZIP', 'error.invalidZip', 'ZIP entry is missing from the central directory', entry.name);
    }
    let data: Uint8Array;
    try {
      data = await zipEntry.async('uint8array');
    } catch (error) {
      throw new RpcError('INVALID_ZIP', 'error.invalidZip', 'ZIP entry could not be decompressed', `${entry.name}: ${String(error)}`);
    }
    if (data.byteLength > limits.maxSingleFileBytes) {
      throw new RpcError('FILE_TOO_LARGE', 'error.fileTooLarge', 'Decompressed entry exceeds the size limit', safeName);
    }
    if (data.byteLength > entry.uncompressedSize && data.byteLength > 1024 * 1024) {
      const ratio = entry.compressedSize === 0 ? Infinity : data.byteLength / entry.compressedSize;
      if (ratio > limits.maxCompressionRatio) {
        throw new RpcError('ZIP_BOMB_SUSPECTED', 'error.zipBomb', 'Decompressed entry exceeded its declared ratio', safeName);
      }
    }
    totalUncompressedSize += data.byteLength;
    if (totalUncompressedSize > limits.maxTotalUncompressedBytes) {
      throw new RpcError(
        'ZIP_BOMB_SUSPECTED',
        'error.zipBomb',
        `Decompressed archive exceeds ${limits.maxTotalUncompressedBytes} bytes`,
      );
    }
    files.set(safeName, data);
  }

  return { name, files, totalUncompressedSize };
}

export interface FileInput {
  path: string;
  size?: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** Builds a pack archive from individual files (folder input or drag & drop). */
export async function readFileEntries(
  inputs: FileInput[],
  name: string,
  limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS,
): Promise<PackArchive> {
  if (inputs.length > limits.maxFileCount) {
    throw new RpcError('ZIP_TOO_MANY_FILES', 'error.zipTooManyFiles', `Folder contains ${inputs.length} files`);
  }
  const names: string[] = [];
  let declaredTotal = 0;
  for (const input of inputs) {
    const safeName = normalizeArchivePath(input.path);
    names.push(safeName);
    const size = input.size ?? 0;
    if (size > limits.maxSingleFileBytes) {
      throw new RpcError('FILE_TOO_LARGE', 'error.fileTooLarge', 'File is too large', safeName);
    }
    declaredTotal += size;
    if (declaredTotal > limits.maxTotalUncompressedBytes) {
      throw new RpcError('ZIP_BOMB_SUSPECTED', 'error.zipBomb', 'Folder contents exceed the size limit');
    }
  }
  assertNoDuplicatePaths(names);

  const files = new Map<string, Uint8Array>();
  let totalUncompressedSize = 0;
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    if (!input) continue;
    const safeName = names[index];
    if (!safeName) continue;
    const buffer = await input.arrayBuffer();
    const data = new Uint8Array(buffer);
    if (data.byteLength > limits.maxSingleFileBytes) {
      throw new RpcError('FILE_TOO_LARGE', 'error.fileTooLarge', 'File is too large', safeName);
    }
    totalUncompressedSize += data.byteLength;
    if (totalUncompressedSize > limits.maxTotalUncompressedBytes) {
      throw new RpcError('ZIP_BOMB_SUSPECTED', 'error.zipBomb', 'Folder contents exceed the size limit');
    }
    files.set(safeName, data);
  }

  return { name, files, totalUncompressedSize };
}

export interface ArchiveFile {
  path: string;
  data: Uint8Array;
}

export function createPackArchive(name: string, inputFiles: ArchiveFile[]): PackArchive {
  const files = new Map<string, Uint8Array>();
  let totalUncompressedSize = 0;
  const names: string[] = [];
  for (const file of inputFiles) {
    const safeName = normalizeArchivePath(file.path);
    names.push(safeName);
    files.set(safeName, file.data);
    totalUncompressedSize += file.data.byteLength;
  }
  assertNoDuplicatePaths(names);
  return { name, files, totalUncompressedSize };
}

/**
 * Serializes a pack archive. Output order and timestamps are deterministic so
 * that repeated conversions produce byte-identical ZIP files.
 */
export async function writeZip(archive: PackArchive): Promise<Uint8Array> {
  const names = [...archive.files.keys()];
  validateNames(names);
  const zip = new JSZip();
  for (const path of names.sort()) {
    const data = archive.files.get(path);
    if (!data) continue;
    zip.file(path, data, {
      binary: true,
      date: FIXED_ZIP_DATE,
      createFolders: false,
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
  }
  const output = await zip.generateAsync({
    type: 'uint8array',
    platform: 'DOS',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    mimeType: 'application/zip',
    streamFiles: false,
  });
  if (output.byteLength > DEFAULT_ARCHIVE_LIMITS.maxZipBytes) {
    throw new RpcError('ZIP_TOO_LARGE', 'error.zipTooLarge', 'Generated ZIP exceeds the maximum ZIP size');
  }
  return output;
}

export function suggestOutputName(packName: string, targetVersion: string): string {
  const base = packName.replace(/\.zip$/i, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'resourcepack';
  return `${base}-${targetVersion}.zip`;
}

export { MAX_ZIP64_ENTRIES };
