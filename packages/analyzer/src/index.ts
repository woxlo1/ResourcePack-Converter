import {
  formatPackFormat,
  normalizeFormatRange,
  packFormat,
  parsePackFormat,
  type DependencyEdge,
  type DetectionResult,
  type FileClassification,
  type FileKind,
  type PackArchive,
  type PackAnalysis,
  type PackMcmeta,
} from '@rpc/core';
import {
  ALL_VERSIONS,
  getVersionAtOrBefore,
  getVersionById,
  getVersionsByFormat,
  getVersionsInRange,
} from '@rpc/version-registry';

export function decodeText(data: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(data).replace(/^\uFEFF/, '');
}

export function parseJsonBytes(data: Uint8Array): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(decodeText(data)) as unknown };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const ASSET_PATH = /^assets\/([^/]+)\/(.*)$/;
const DATA_PATH = /^data\/([^/]+)\/(.*)$/;

export function classifyPath(path: string): FileClassification {
  const lower = path.toLowerCase();
  const kind = classifyKind(lower, path);
  const assetMatch = ASSET_PATH.exec(path);
  const dataMatch = DATA_PATH.exec(path);
  const namespace = assetMatch?.[1] ?? dataMatch?.[1];
  return { path, kind, size: 0, namespace };
}

function classifyKind(lower: string, path: string): FileKind {
  if (lower === 'pack.mcmeta') return 'pack-mcmeta';
  if (lower === 'pack.png') return 'pack-png';
  if (
    lower.startsWith('optifine/') ||
    lower.includes('/optifine/') ||
    lower.startsWith('cit/') ||
    lower.startsWith('ctm/') ||
    lower.endsWith('.properties')
  ) {
    return 'optifine';
  }

  const asset = ASSET_PATH.exec(path);
  if (asset) {
    const rest = asset[2] ?? '';
    if (rest.startsWith('models/') && rest.endsWith('.json')) return 'model';
    if (rest.startsWith('items/') && rest.endsWith('.json')) return 'item-definition';
    if (rest.startsWith('blockstates/') && rest.endsWith('.json')) return 'blockstate';
    if (rest.startsWith('textures/') && rest.endsWith('.png.mcmeta')) return 'texture-meta';
    if (rest.startsWith('textures/') && rest.endsWith('.png')) return 'texture';
    if (rest === 'sounds.json') return 'sound-definition';
    if (rest.startsWith('sounds/') && rest.endsWith('.ogg')) return 'sound';
    if (rest.startsWith('font/') && rest.endsWith('.json')) return 'font';
    if (rest.startsWith('shaders/')) return 'shader';
    if (rest.startsWith('atlases/') && rest.endsWith('.json')) return 'atlas';
    if (rest.startsWith('lang/') && rest.endsWith('.json')) return 'lang';
    if (rest.startsWith('particles/') && rest.endsWith('.json')) return 'particle';
    if (rest.startsWith('gui/')) return 'gui';
  }
  if (DATA_PATH.test(path)) return 'data';
  return 'unknown';
}

export function collectNamespaces(files: Iterable<string>): string[] {
  const namespaces = new Set<string>();
  for (const path of files) {
    const match = ASSET_PATH.exec(path) ?? DATA_PATH.exec(path);
    if (match?.[1]) namespaces.add(match[1]);
  }
  return [...namespaces].sort();
}

export function countDirectories(files: Iterable<string>): number {
  const directories = new Set<string>();
  for (const path of files) {
    const parts = path.split('/');
    for (let index = 1; index < parts.length; index += 1) {
      directories.add(parts.slice(0, index).join('/'));
    }
  }
  return directories.size;
}

export function readPackMcmeta(archive: PackArchive): {
  mcmeta: PackMcmeta | null;
  error?: string;
  missing: boolean;
} {
  const bytes = archive.files.get('pack.mcmeta');
  if (!bytes) return { mcmeta: null, missing: true };
  const parsed = parseJsonBytes(bytes);
  if (!parsed.ok) return { mcmeta: null, missing: false, error: parsed.error };
  if (!isJsonObject(parsed.value)) {
    return { mcmeta: null, missing: false, error: 'pack.mcmeta root is not a JSON object' };
  }
  const raw = parsed.value;
  const pack = isJsonObject(raw.pack) ? raw.pack : null;
  if (!pack) return { mcmeta: null, missing: false, error: 'pack.mcmeta is missing the "pack" object' };

  const packFormat = parsePackFormat(pack.pack_format);
  const supported = normalizeFormatRange(pack.supported_formats);
  const minFormat = parsePackFormat(pack.min_format);
  const maxFormat = parsePackFormat(pack.max_format);
  const rangeFromMinMax = minFormat && maxFormat ? { min: minFormat, max: maxFormat } : null;
  const overlays = isJsonObject(raw.overlays) && Array.isArray(raw.overlays.entries) ? raw.overlays.entries : undefined;

  return {
    mcmeta: {
      raw,
      description: pack.description,
      packFormat: packFormat ?? undefined,
      supportedFormatRange: rangeFromMinMax ?? supported ?? undefined,
      minFormat: minFormat ?? undefined,
      maxFormat: maxFormat ?? undefined,
      overlays,
    },
    missing: false,
  };
}

export function detectPackVersion(archive: PackArchive): DetectionResult {
  const { mcmeta, error, missing } = readPackMcmeta(archive);
  const reasons: string[] = [];
  const hasItems = [...archive.files.keys()].some((path) => /^assets\/[^/]+\/items\/.+\.json$/.test(path));
  const hasAtlases = [...archive.files.keys()].some((path) => /^assets\/[^/]+\/atlases\/.+\.json$/.test(path));
  const hasLegacyTextures = [...archive.files.keys()].some((path) =>
    /^assets\/[^/]+\/textures\/(blocks|items)\//.test(path),
  );

  if (mcmeta) {
    const range = mcmeta.supportedFormatRange ?? (mcmeta.packFormat ? { min: mcmeta.packFormat, max: mcmeta.packFormat } : null);
    const exact = mcmeta.packFormat;
    const matched = range ? getVersionsInRange(range) : [];
    if (exact) {
      reasons.push(`pack.mcmeta declares pack_format ${formatPackFormat(exact)}`);
    }
    if (range && (!exact || formatPackFormat(range.min) !== formatPackFormat(range.max))) {
      reasons.push(`pack.mcmeta declares supported formats ${formatPackFormat(range.min)}–${formatPackFormat(range.max)}`);
    }
    if (matched.length === 0 && exact) {
      reasons.push(`pack format ${formatPackFormat(exact)} is newer or older than the bundled version registry`);
    }
    reasons.push('Resource pack formats are independent from data pack formats.');
    return {
      format: exact ?? range?.min ?? null,
      formatRange: range,
      mcmeta,
      matchedVersions: matched,
      confidence: exact && matched.length > 0 ? 'high' : matched.length > 0 ? 'medium' : 'low',
      reasons,
    };
  }

  if (missing) reasons.push('pack.mcmeta is missing');
  else reasons.push(`pack.mcmeta could not be parsed: ${error ?? 'unknown error'}`);

  let implied: ReturnType<typeof packFormat> | null = null;
  let confidence: DetectionResult['confidence'] = 'unknown';
  if (hasItems) {
    implied = packFormat(46);
    confidence = 'medium';
    reasons.push('Found assets/<namespace>/items/, which was introduced in resource pack format 46 (1.21.4).');
  } else if (hasAtlases) {
    implied = packFormat(12);
    confidence = 'medium';
    reasons.push('Found assets/<namespace>/atlases/, which was introduced in resource pack format 12 (1.19.3).');
  } else if (hasLegacyTextures) {
    implied = packFormat(3);
    confidence = 'low';
    reasons.push('Found pre-flattening textures/blocks or textures/items folders, consistent with format 3 or older.');
    confidence = 'medium';
  } else if ([...archive.files.keys()].some((path) => /^assets\/[^/]+\/blockstates\//.test(path))) {
    implied = packFormat(4);
    confidence = 'low';
    reasons.push('Found blockstates but no pack.mcmeta; assuming the flattening-era format 4 or newer.');
  }

  if (!implied) {
    reasons.push('The target format cannot be inferred automatically. Select the target version manually.');
    return {
      format: null,
      formatRange: null,
      mcmeta: null,
      matchedVersions: [],
      confidence: 'unknown',
      reasons,
    };
  }

  const matched = getVersionsByFormat(implied);
  reasons.push(`Inferred pack format ${formatPackFormat(implied)} from the file layout.`);
  return {
    format: implied,
    formatRange: { min: implied, max: implied },
    mcmeta: null,
    matchedVersions: matched,
    confidence,
    reasons,
  };
}

function splitResourceId(value: string, defaultNamespace = 'minecraft'): { namespace: string; path: string } | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const withoutExtension = value.replace(/\.(png|ogg|json|ttf|otf|zip)$/i, '');
  const separator = withoutExtension.indexOf(':');
  if (separator >= 0) {
    const namespace = withoutExtension.slice(0, separator);
    const path = withoutExtension.slice(separator + 1);
    if (!namespace || !path) return null;
    return { namespace, path };
  }
  return { namespace: defaultNamespace, path: withoutExtension };
}

function modelPath(namespace: string, path: string): string {
  return `assets/${namespace}/models/${path}.json`;
}

function texturePath(namespace: string, path: string): string {
  return `assets/${namespace}/textures/${path}.png`;
}

function soundPath(namespace: string, path: string): string {
  return `assets/${namespace}/sounds/${path}.ogg`;
}

function fontPath(namespace: string, path: string): string {
  return `assets/${namespace}/font/${path}`;
}

interface DependencyCollector {
  files: Set<string>;
  edges: DependencyEdge[];
  seen: Set<string>;
}

function addEdge(collector: DependencyCollector, from: string, to: string, kind: DependencyEdge['kind']): void {
  const key = `${kind}|${from}|${to}`;
  if (collector.seen.has(key)) return;
  collector.seen.add(key);
  collector.edges.push({ from, to, kind, exists: collector.files.has(to) });
}

function addDirectoryEdge(collector: DependencyCollector, from: string, prefix: string): void {
  const exists = [...collector.files].some((path) => path.startsWith(prefix));
  const key = `atlas-source|${from}|${prefix}`;
  if (collector.seen.has(key)) return;
  collector.seen.add(key);
  collector.edges.push({ from, to: prefix, kind: 'atlas-source', exists });
}

function collectModelDependencies(path: string, value: unknown, collector: DependencyCollector): void {
  if (!isJsonObject(value)) return;
  if (typeof value.parent === 'string' && value.parent !== 'builtin/generated' && value.parent !== 'builtin/entity') {
    const parent = splitResourceId(value.parent);
    if (parent) addEdge(collector, path, modelPath(parent.namespace, parent.path), 'model-parent');
  }
  if (isJsonObject(value.textures)) {
    for (const texture of Object.values(value.textures)) {
      const raw = typeof texture === 'string' ? texture : isJsonObject(texture) ? texture.sprite : null;
      if (typeof raw !== 'string' || raw.startsWith('#')) continue;
      const resolved = splitResourceId(raw);
      if (resolved) addEdge(collector, path, texturePath(resolved.namespace, resolved.path), 'model-texture');
    }
  }
}

function collectModelReference(value: unknown, collector: DependencyCollector, from: string): void {
  if (typeof value !== 'string') return;
  const resolved = splitResourceId(value);
  if (resolved) addEdge(collector, from, modelPath(resolved.namespace, resolved.path), 'item-definition-model');
}

function walkItemsModel(value: unknown, path: string, collector: DependencyCollector, depth = 0): void {
  if (!isJsonObject(value) || depth > 64) return;
  const type = value.type;
  if (type === 'minecraft:model') {
    collectModelReference(value.model, collector, path);
    return;
  }
  if (type === 'minecraft:composite' && Array.isArray(value.models)) {
    for (const model of value.models) walkItemsModel(model, path, collector, depth + 1);
    return;
  }
  if (type === 'minecraft:condition') {
    walkItemsModel(value.on_true, path, collector, depth + 1);
    walkItemsModel(value.on_false, path, collector, depth + 1);
    return;
  }
  if (type === 'minecraft:select') {
    if (Array.isArray(value.cases)) {
      for (const item of value.cases) {
        if (isJsonObject(item)) walkItemsModel(item.model, path, collector, depth + 1);
      }
    }
    walkItemsModel(value.fallback, path, collector, depth + 1);
    return;
  }
  if (type === 'minecraft:range_dispatch') {
    if (Array.isArray(value.entries)) {
      for (const item of value.entries) {
        if (isJsonObject(item)) walkItemsModel(item.model, path, collector, depth + 1);
      }
    }
    walkItemsModel(value.fallback, path, collector, depth + 1);
    return;
  }
  if (type === 'minecraft:special') {
    collectModelReference(value.base, collector, path);
  }
}

function collectBlockstateDependencies(path: string, value: unknown, collector: DependencyCollector): void {
  if (!isJsonObject(value)) return;
  const addVariant = (variant: unknown): void => {
    const entries = Array.isArray(variant) ? variant : [variant];
    for (const entry of entries) {
      if (!isJsonObject(entry) || typeof entry.model !== 'string') continue;
      const resolved = splitResourceId(entry.model);
      if (resolved) addEdge(collector, path, modelPath(resolved.namespace, resolved.path), 'blockstate-model');
    }
  };
  if (isJsonObject(value.variants)) {
    for (const variant of Object.values(value.variants)) addVariant(variant);
  }
  if (Array.isArray(value.multipart)) {
    for (const part of value.multipart) {
      if (isJsonObject(part)) addVariant(part.apply);
    }
  }
}

function collectSoundDependencies(path: string, value: unknown, collector: DependencyCollector): void {
  if (!isJsonObject(value)) return;
  for (const event of Object.values(value)) {
    if (!isJsonObject(event) || !Array.isArray(event.sounds)) continue;
    for (const sound of event.sounds) {
      let name: unknown;
      let type: unknown;
      if (typeof sound === 'string') {
        name = sound;
      } else if (isJsonObject(sound)) {
        name = sound.name;
        type = sound.type;
      }
      if (type === 'event' || typeof name !== 'string') continue;
      const resolved = splitResourceId(name);
      if (resolved) addEdge(collector, path, soundPath(resolved.namespace, resolved.path), 'sound-file');
    }
  }
}

function collectFontDependencies(path: string, value: unknown, collector: DependencyCollector): void {
  if (!isJsonObject(value) || !Array.isArray(value.providers)) return;
  for (const provider of value.providers) {
    if (!isJsonObject(provider)) continue;
    const file = typeof provider.file === 'string' ? provider.file : null;
    if (file) {
      const resolved = splitResourceId(file);
      if (resolved) {
        const resolvedPath = /\.(png)$/i.test(file)
          ? texturePath(resolved.namespace, resolved.path)
          : fontPath(resolved.namespace, resolved.path);
        addEdge(collector, path, resolvedPath, 'font-file');
      }
    }
    const hexFile = typeof provider.hex_file === 'string' ? provider.hex_file : null;
    if (hexFile) {
      const resolved = splitResourceId(hexFile);
      if (resolved) addEdge(collector, path, fontPath(resolved.namespace, resolved.path), 'font-file');
    }
  }
}

function collectAtlasDependencies(path: string, value: unknown, collector: DependencyCollector): void {
  if (!isJsonObject(value) || !Array.isArray(value.sources)) return;
  for (const source of value.sources) {
    if (!isJsonObject(source)) continue;
    if (typeof source.resource === 'string') {
      const resolved = splitResourceId(source.resource);
      if (resolved) addEdge(collector, path, texturePath(resolved.namespace, resolved.path), 'atlas-source');
    }
    if (typeof source.source === 'string') {
      const resolved = splitResourceId(source.source);
      if (resolved) {
        const directory = `assets/${resolved.namespace}/textures/${resolved.path.replace(/\/$/, '')}/`;
        addDirectoryEdge(collector, path, directory);
      }
    }
    if (Array.isArray(source.textures)) {
      for (const texture of source.textures) {
        if (typeof texture !== 'string') continue;
        const resolved = splitResourceId(texture);
        if (resolved) addEdge(collector, path, texturePath(resolved.namespace, resolved.path), 'atlas-source');
      }
    }
    if (typeof source.palette_key === 'string') {
      const resolved = splitResourceId(source.palette_key);
      if (resolved) addEdge(collector, path, texturePath(resolved.namespace, resolved.path), 'atlas-source');
    }
    if (isJsonObject(source.permutations)) {
      for (const permutation of Object.values(source.permutations)) {
        if (typeof permutation !== 'string') continue;
        const resolved = splitResourceId(permutation);
        if (resolved) addEdge(collector, path, texturePath(resolved.namespace, resolved.path), 'atlas-source');
      }
    }
  }
}

export function analyzeDependencies(
  archive: PackArchive,
  classifications: FileClassification[],
): { edges: DependencyEdge[]; missingReferences: DependencyEdge[] } {
  const collector: DependencyCollector = {
    files: new Set(archive.files.keys()),
    edges: [],
    seen: new Set(),
  };

  for (const classification of classifications) {
    const data = archive.files.get(classification.path);
    if (!data) continue;
    switch (classification.kind) {
      case 'model': {
        const parsed = parseJsonBytes(data);
        if (parsed.ok) collectModelDependencies(classification.path, parsed.value, collector);
        break;
      }
      case 'blockstate': {
        const parsed = parseJsonBytes(data);
        if (parsed.ok) collectBlockstateDependencies(classification.path, parsed.value, collector);
        break;
      }
      case 'item-definition': {
        const parsed = parseJsonBytes(data);
        if (parsed.ok && isJsonObject(parsed.value)) walkItemsModel(parsed.value.model, classification.path, collector);
        break;
      }
      case 'sound-definition': {
        const parsed = parseJsonBytes(data);
        if (parsed.ok) collectSoundDependencies(classification.path, parsed.value, collector);
        break;
      }
      case 'font': {
        const parsed = parseJsonBytes(data);
        if (parsed.ok) collectFontDependencies(classification.path, parsed.value, collector);
        break;
      }
      case 'atlas': {
        const parsed = parseJsonBytes(data);
        if (parsed.ok) collectAtlasDependencies(classification.path, parsed.value, collector);
        break;
      }
      default:
        break;
    }
  }

  const missingReferences = collector.edges.filter(
    (edge) => !edge.exists && !isGameProvidedTarget(edge.to),
  );
  return { edges: collector.edges, missingReferences };
}

/**
 * The game ships the `minecraft` namespace itself, so a pack may legitimately
 * reference built-in models, textures or sounds without shipping them. Only
 * references into custom namespaces must resolve inside the pack.
 */
function isGameProvidedTarget(path: string): boolean {
  return path.startsWith('assets/minecraft/');
}

function isPng(data: Uint8Array): boolean {
  return (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[4] === 0x0d &&
    data[5] === 0x0a &&
    data[6] === 0x1a &&
    data[7] === 0x0a
  );
}

export function analyzeArchive(archive: PackArchive, zipSize = 0): PackAnalysis {
  const classifications: FileClassification[] = [];
  let jsonCount = 0;
  let pngCount = 0;
  let oggCount = 0;
  let modelCount = 0;
  let itemDefinitionCount = 0;
  let blockstateCount = 0;
  let textureCount = 0;
  let soundCount = 0;
  let fontCount = 0;
  let shaderCount = 0;
  let unknownCount = 0;

  for (const [path, data] of archive.files) {
    const classification = classifyPath(path);
    classification.size = data.byteLength;
    classifications.push(classification);
    const lower = path.toLowerCase();
    if (lower.endsWith('.json')) jsonCount += 1;
    if (lower.endsWith('.png') && isPng(data)) pngCount += 1;
    if (lower.endsWith('.ogg')) oggCount += 1;
    switch (classification.kind) {
      case 'model':
        modelCount += 1;
        break;
      case 'item-definition':
        itemDefinitionCount += 1;
        break;
      case 'blockstate':
        blockstateCount += 1;
        break;
      case 'texture':
        textureCount += 1;
        break;
      case 'sound':
        soundCount += 1;
        break;
      case 'font':
        fontCount += 1;
        break;
      case 'shader':
        shaderCount += 1;
        break;
      case 'unknown':
        unknownCount += 1;
        break;
      default:
        break;
    }
  }

  classifications.sort((a, b) => a.path.localeCompare(b.path));
  const detection = detectPackVersion(archive);
  const { edges, missingReferences } = analyzeDependencies(archive, classifications);

  return {
    name: archive.name,
    fileCount: archive.files.size,
    directoryCount: countDirectories(archive.files.keys()),
    totalUncompressedSize: archive.totalUncompressedSize,
    zipSize,
    jsonCount,
    pngCount,
    oggCount,
    modelCount,
    itemDefinitionCount,
    blockstateCount,
    textureCount,
    soundCount,
    fontCount,
    shaderCount,
    unknownCount,
    namespaces: collectNamespaces(archive.files.keys()),
    hasPackMcmeta: archive.files.has('pack.mcmeta'),
    hasPackPng: archive.files.has('pack.png'),
    detection,
    classifications,
    unknownFiles: classifications.filter((file) => file.kind === 'unknown'),
    dependencies: edges,
    missingReferences,
  };
}

export function describeDetectedSource(analysis: PackAnalysis): string {
  const detection = analysis.detection;
  if (detection.format) {
    const version = getVersionsByFormat(detection.format)[0];
    if (version) return `${version.label} (format ${formatPackFormat(detection.format)})`;
    const nearest = getVersionAtOrBefore(detection.format);
    if (nearest) return `format ${formatPackFormat(detection.format)} (nearest known: ${nearest.label})`;
    return `format ${formatPackFormat(detection.format)}`;
  }
  return 'unknown';
}

export function findVersionByRelease(release: string): ReturnType<typeof getVersionById> {
  return getVersionById(release);
}

export function knownFormats(): string {
  return ALL_VERSIONS.map((version) => formatPackFormat(version.resourcePackFormat)).join(', ');
}
