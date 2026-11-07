import { describe, expect, it } from 'vitest';
import { DEFAULT_ARCHIVE_LIMITS, RpcError, type ArchiveLimits } from '@rpc/core';
import { readFileEntries, readZip, readZipDirectory } from '@rpc/archive';
import { legacyPackZip, textBytes } from '../fixtures/pack';
import { boundarySizedZip, buildRawZip, zip64Extra } from '../fixtures/zip';

async function expectRpcError(promise: Promise<unknown>, code: RpcError['code']): Promise<RpcError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(RpcError);
    if (!(error instanceof RpcError)) throw error;
    expect(error.code).toBe(code);
    return error;
  }
  throw new Error(`Expected a rejection with code ${code}`);
}

function limits(overrides: Partial<ArchiveLimits> = {}): ArchiveLimits {
  return { ...DEFAULT_ARCHIVE_LIMITS, ...overrides };
}

describe('ZIP input security', () => {
  it('rejects path traversal entries', async () => {
    const zip = buildRawZip([{ name: '../evil.txt', data: textBytes('x') }]);
    const error = await expectRpcError(readZip(zip, 'traversal.zip'), 'UNSAFE_PATH');
    expect(error.message).toMatch(/traversal/i);
  });

  it('rejects absolute and drive-qualified entries', async () => {
    const names = ['/etc/passwd', 'C:\\Windows\\win.ini', '//server/share/file'];
    for (const name of names) {
      const zip = buildRawZip([{ name, data: textBytes('x') }]);
      const error = await expectRpcError(readZip(zip, 'absolute.zip'), 'UNSAFE_PATH');
      expect(error.message).toMatch(/absolute/i);
    }
  });

  it('rejects duplicate and case-insensitive duplicate entries', async () => {
    const duplicates = buildRawZip([
      { name: 'pack.mcmeta', data: textBytes('a') },
      { name: 'pack.mcmeta', data: textBytes('b') },
    ]);
    const duplicateError = await expectRpcError(readZip(duplicates, 'duplicate.zip'), 'DUPLICATE_ENTRY');
    expect(duplicateError.message).toMatch(/duplicate/i);

    const caseDuplicates = buildRawZip([
      { name: 'assets/A.png', data: textBytes('a') },
      { name: 'assets/a.png', data: textBytes('b') },
    ]);
    await expectRpcError(readZip(caseDuplicates, 'case-duplicate.zip'), 'DUPLICATE_ENTRY');
  });

  it('rejects encrypted entries before decompression', async () => {
    const zip = buildRawZip([{ name: 'pack.mcmeta', data: textBytes('{}'), flags: 0x0001 }]);
    const error = await expectRpcError(readZip(zip, 'encrypted.zip'), 'INVALID_ZIP');
    expect(error.message).toMatch(/encrypted/i);
  });

  it('rejects entries using an unsupported compression method', async () => {
    const zip = buildRawZip([{ name: 'pack.mcmeta', data: textBytes('{}'), method: 99 }]);
    const error = await expectRpcError(readZip(zip, 'method.zip'), 'INVALID_ZIP');
    expect(error.message).toMatch(/compression method/i);
  });

  it('rejects NUL bytes in entry names', async () => {
    const zip = buildRawZip([{ name: 'pack\u0000.mcmeta', data: textBytes('{}') }]);
    const error = await expectRpcError(readZip(zip, 'nul.zip'), 'INVALID_ZIP');
    expect(error.message).toMatch(/NUL/i);
  });
});

describe('ZIP size and bomb limits', () => {
  it('enforces the compressed ZIP size limit', async () => {
    const zip = buildRawZip([{ name: 'pack.mcmeta', data: textBytes('{}') }]);
    await expectRpcError(readZip(zip, 'large.zip', limits({ maxZipBytes: 8 })), 'ZIP_TOO_LARGE');
  });

  it('rejects suspected ZIP bombs from the declared compression ratio', async () => {
    const zip = buildRawZip([
      {
        name: 'assets/bomb.bin',
        data: textBytes('tiny'),
        compressedSize: 10,
        uncompressedSize: 50 * 1024 * 1024,
      },
    ]);
    const error = await expectRpcError(readZip(zip, 'bomb.zip'), 'ZIP_BOMB_SUSPECTED');
    expect(error.message).toMatch(/ratio/i);
  });

  it('enforces the per-file size limit', async () => {
    const zip = buildRawZip([
      { name: 'big.bin', data: textBytes('x'), uncompressedSize: 2 * 1024 * 1024 },
    ]);
    await expectRpcError(
      readZip(zip, 'big.zip', limits({ maxSingleFileBytes: 1024 * 1024 })),
      'FILE_TOO_LARGE',
    );
  });

  it('enforces the total uncompressed size limit', async () => {
    const zip = buildRawZip([
      { name: 'a.bin', data: textBytes('aa'), uncompressedSize: 700 },
      { name: 'b.bin', data: textBytes('bb'), uncompressedSize: 700 },
    ]);
    await expectRpcError(
      readZip(zip, 'total.zip', limits({ maxTotalUncompressedBytes: 1000 })),
      'ZIP_BOMB_SUSPECTED',
    );
  });

  it('enforces the file count limit', async () => {
    const zip = buildRawZip([
      { name: 'a.txt', data: textBytes('a') },
      { name: 'b.txt', data: textBytes('b') },
      { name: 'c.txt', data: textBytes('c') },
    ]);
    await expectRpcError(
      readZip(zip, 'count.zip', limits({ maxFileCount: 2 })),
      'ZIP_TOO_MANY_FILES',
    );
  });

  it('applies the same path and count checks to folder input', async () => {
    const traversal = [
      { path: '../evil.png', size: 1, arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)) },
    ];
    await expectRpcError(readFileEntries(traversal, 'folder'), 'UNSAFE_PATH');

    const many = Array.from({ length: 3 }, (_, index) => ({
      path: `file-${index}.txt`,
      size: 1,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)),
    }));
    await expectRpcError(
      readFileEntries(many, 'folder', limits({ maxFileCount: 2 })),
      'ZIP_TOO_MANY_FILES',
    );
  });
});

describe('malformed ZIP input', () => {
  it('rejects data that is not a ZIP archive', async () => {
    const garbage = new Uint8Array(64).fill(0x41);
    const error = await expectRpcError(readZip(garbage, 'garbage.zip'), 'INVALID_ZIP');
    expect(error.message).toMatch(/end-of-central-directory/i);

    const truncated = buildRawZip([{ name: 'pack.mcmeta', data: textBytes('{}') }]).subarray(0, 10);
    await expectRpcError(readZip(truncated, 'truncated.zip'), 'INVALID_ZIP');
  });

  it('rejects corrupt central directory entries', async () => {
    const zip = buildRawZip([{ name: 'pack.mcmeta', data: textBytes('{}') }]);
    const corrupt = zip.slice();
    const view = new DataView(corrupt.buffer);
    const centralOffset = view.getUint32(corrupt.byteLength - 22 + 16, true);
    corrupt[centralOffset] = 0x00;
    await expectRpcError(readZip(corrupt, 'corrupt.zip'), 'INVALID_ZIP');
  });

  it('does not mutate the input buffer while reading', async () => {
    const zip = await legacyPackZip();
    const before = zip.slice();
    const archive = await readZip(zip, 'fixture.zip');
    expect(archive.files.size).toBeGreaterThan(0);
    expect(Array.from(zip)).toEqual(Array.from(before));
  });
});

describe('ZIP64 directory parsing', () => {
  it('reads ZIP64 size extras instead of leaving 0xffffffff sentinels', () => {
    const size = 4096;
    const entries = readZipDirectory(boundarySizedZip(size));
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry).toBeDefined();
    if (!entry) throw new Error('Expected a ZIP64 directory entry');
    expect(entry.uncompressedSize).toBe(size);
    expect(entry.compressedSize).toBe(0);
    expect(entry.localHeaderOffset).toBe(0);
  });

  it('rejects ZIP64 extras that exceed the safe integer range', () => {
    const extra = zip64Extra(BigInt(Number.MAX_SAFE_INTEGER) + 1n, 0n, 0n);
    const zip = buildRawZip([
      {
        name: 'huge.bin',
        data: textBytes('x'),
        compressedSize: 0xffffffff,
        uncompressedSize: 0xffffffff,
        extra,
      },
    ]);
    expect(() => readZipDirectory(zip)).toThrow(RpcError);
  });
});
