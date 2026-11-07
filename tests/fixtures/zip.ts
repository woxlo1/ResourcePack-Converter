const encoder = new TextEncoder();

export interface RawZipEntry {
  name: string;
  data?: Uint8Array;
  flags?: number;
  method?: number;
  compressedSize?: number;
  uncompressedSize?: number;
  extra?: Uint8Array;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

/**
 * Builds a ZIP with stored entries and a hand-written central directory. Used to
 * exercise the pre-decompression security checks with feature combinations that
 * JSZip cannot produce (duplicates, encryption flags, ZIP64 extras).
 */
export function buildRawZip(entries: RawZipEntry[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = entry.data ?? new Uint8Array(0);
    const compressedSize = entry.compressedSize ?? data.length;
    const uncompressedSize = entry.uncompressedSize ?? data.length;

    const local = new Uint8Array(30 + name.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, entry.flags ?? 0, true);
    localView.setUint16(8, entry.method ?? 0, true);
    localView.setUint32(18, compressedSize, true);
    localView.setUint32(22, uncompressedSize, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    localParts.push(local);

    const extra = entry.extra ?? new Uint8Array(0);
    const central = new Uint8Array(46 + name.length + extra.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, entry.flags ?? 0, true);
    centralView.setUint16(10, entry.method ?? 0, true);
    centralView.setUint32(20, compressedSize, true);
    centralView.setUint32(24, uncompressedSize, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint16(30, extra.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    central.set(extra, 46 + name.length);
    centralParts.push(central);

    offset += local.length;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, centralOffset, true);

  return concat([...localParts, ...centralParts, eocd]);
}

/** Builds a ZIP64 extra field carrying uncompressed, compressed and offset values. */
export function zip64Extra(uncompressed: bigint, compressed: bigint, localOffset: bigint): Uint8Array {
  const extra = new Uint8Array(4 + 24);
  const view = new DataView(extra.buffer);
  view.setUint16(0, 0x0001, true);
  view.setUint16(2, 24, true);
  view.setBigUint64(4, uncompressed, true);
  view.setBigUint64(12, compressed, true);
  view.setBigUint64(20, localOffset, true);
  return extra;
}

export function boundarySizedZip(size: number): Uint8Array {
  return buildRawZip([
    {
      name: 'pack.mcmeta',
      data: new Uint8Array(size),
      compressedSize: 0xffffffff,
      uncompressedSize: 0xffffffff,
      extra: zip64Extra(BigInt(size), 0n, 0n),
    },
  ]);
}
