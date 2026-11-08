import type { FolderEntry } from './worker-protocol';

export interface SourceFile {
  file: File;
  /** Path relative to the selected root, using forward slashes. */
  path: string;
}

export interface FolderBundle {
  name: string;
  entries: FolderEntry[];
}

export function isZipFile(file: File): boolean {
  return /\.zip$/i.test(file.name);
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.?\//, '');
}

async function bundleFromSources(sources: SourceFile[], fallbackName = 'resourcepack'): Promise<FolderBundle> {
  const cleaned = sources
    .map((source) => ({ ...source, path: normalizePath(source.path) }))
    .filter((source) => source.path.length > 0 && !source.path.endsWith('/'));
  if (cleaned.length === 0) throw new Error('The selected folder does not contain any files.');

  const segments = cleaned.map((source) => source.path.split('/'));
  const firstSegment = segments[0]?.[0];
  const hasCommonRoot =
    Boolean(firstSegment) &&
    segments.every((parts) => parts.length > 1 && parts[0] === firstSegment);
  const root = hasCommonRoot ? (firstSegment as string) : fallbackName;

  const entries = await Promise.all(
    cleaned.map(async (source) => ({
      path: hasCommonRoot ? source.path.slice((firstSegment as string).length + 1) : source.path,
      data: await source.file.arrayBuffer(),
    })),
  );
  return { name: root, entries };
}

/** Reads a `<input type="file" webkitdirectory>` selection into in-memory entries. */
export async function folderBundleFromFiles(files: File[]): Promise<FolderBundle> {
  const sources: SourceFile[] = files.map((file) => {
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    return {
      file,
      path: relative && relative.length > 0 ? relative : file.name,
    };
  });
  return bundleFromSources(sources);
}

function readDirectoryEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });
}

function readFileEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

async function collectDirectory(entry: FileSystemDirectoryEntry, prefix: string): Promise<SourceFile[]> {
  const reader = entry.createReader();
  const children: FileSystemEntry[] = [];
  for (;;) {
    const batch = await readDirectoryEntries(reader);
    if (batch.length === 0) break;
    children.push(...batch);
  }

  const result: SourceFile[] = [];
  for (const child of children) {
    const path = prefix ? `${prefix}/${child.name}` : child.name;
    if (child.isDirectory) {
      result.push(...(await collectDirectory(child as FileSystemDirectoryEntry, path)));
    } else if (child.isFile) {
      result.push({ file: await readFileEntry(child as FileSystemFileEntry), path });
    }
  }
  return result;
}

/**
 * Reads a drag-and-drop payload. A single dropped folder is traversed
 * recursively; otherwise the dropped files are treated as a flat pack root.
 */
export async function folderBundleFromDrop(dataTransfer: DataTransfer): Promise<FolderBundle | null> {
  const roots: FileSystemEntry[] = [];
  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) roots.push(entry);
  }

  const root = roots[0];
  if (roots.length === 1 && root?.isDirectory) {
    const sources = await collectDirectory(root as FileSystemDirectoryEntry, '');
    return bundleFromSources(sources, root.name);
  }

  const files = Array.from(dataTransfer.files);
  if (files.length === 0) return null;
  return folderBundleFromFiles(files);
}
