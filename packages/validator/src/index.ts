import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import {
  comparePackFormat,
  formatPackFormat,
  parsePackFormat,
  type FileKind,
  type PackAnalysis,
  type PackArchive,
  type PackFormat,
  type ValidationIssue,
  type ValidationResult,
  type ValidationSummary,
  type ValidationStatus,
} from '@rpc/core';
import atlasSchema from '../../../version-data/schemas/atlas.schema.json';
import blockstateSchema from '../../../version-data/schemas/blockstate.schema.json';
import fontSchema from '../../../version-data/schemas/font.schema.json';
import itemsModelSchema from '../../../version-data/schemas/items-model.schema.json';
import modelSchema from '../../../version-data/schemas/model.schema.json';
import packMcmetaSchema from '../../../version-data/schemas/pack.mcmeta.schema.json';
import soundsSchema from '../../../version-data/schemas/sounds.schema.json';
import textureMcmetaSchema from '../../../version-data/schemas/texture-mcmeta.schema.json';

const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true, validateSchema: false });

function compile(schema: object): ValidateFunction {
  return ajv.compile(schema);
}

const schemas: Record<string, ValidateFunction> = {
  'pack.mcmeta': compile(packMcmetaSchema),
  model: compile(modelSchema),
  'item-definition': compile(itemsModelSchema),
  blockstate: compile(blockstateSchema),
  font: compile(fontSchema),
  'sound-definition': compile(soundsSchema),
  atlas: compile(atlasSchema),
  'texture-meta': compile(textureMcmetaSchema),
};

export interface ValidationOptions {
  targetFormat?: PackFormat;
  maxReferenceWarnings?: number;
}

interface Collector {
  issues: ValidationIssue[];
  add(status: ValidationStatus, code: string, message: string, path?: string, details?: string): void;
}

function createCollector(): Collector {
  const issues: ValidationIssue[] = [];
  return {
    issues,
    add(status, code, message, path, details) {
      issues.push({
        ...(path ? { path } : {}),
        status,
        code,
        message,
        ...(details ? { details } : {}),
      });
    },
  };
}

function decode(data: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(data).replace(/^\uFEFF/, '');
}

function parseJson(data: Uint8Array): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(decode(data)) as unknown };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) return '';
  return errors
    .map((error) => {
      const location = error.instancePath || '/';
      return `${location} ${error.message ?? 'is invalid'}`;
    })
    .join('; ');
}

function validateJsonValue(schemaId: string, value: unknown): string[] {
  const validate = schemas[schemaId];
  if (!validate) return [];
  if (validate(value)) return [];
  return [formatAjvErrors(validate.errors)];
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

function isOgg(data: Uint8Array): boolean {
  return (
    data.length >= 4 &&
    data[0] === 0x4f &&
    data[1] === 0x67 &&
    data[2] === 0x67 &&
    data[3] === 0x53
  );
}

interface PngInfo {
  width: number;
  height: number;
}

function readPngInfo(data: Uint8Array): PngInfo | null {
  if (!isPng(data) || data.length < 24) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const length = view.getUint32(8, false);
  const type = String.fromCharCode(data[12] ?? 0, data[13] ?? 0, data[14] ?? 0, data[15] ?? 0);
  if (type !== 'IHDR' || length < 13) return null;
  return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
}

function validatePng(collector: Collector, path: string, data: Uint8Array): void {
  if (!isPng(data)) {
    collector.add('ERROR', 'PNG_SIGNATURE', 'File does not start with a valid PNG signature.', path);
    return;
  }
  const info = readPngInfo(data);
  if (!info) {
    collector.add('ERROR', 'PNG_HEADER', 'PNG IHDR chunk could not be read.', path);
    return;
  }
  if (info.width <= 0 || info.height <= 0) {
    collector.add('ERROR', 'PNG_DIMENSIONS', 'PNG has invalid dimensions.', path, `${info.width}x${info.height}`);
    return;
  }
  collector.add('PASS', 'PNG_OK', 'PNG signature and IHDR chunk are valid.', path, `${info.width}x${info.height}`);
}

function validateTextureMcmeta(
  collector: Collector,
  path: string,
  data: Uint8Array,
  files: ReadonlyMap<string, Uint8Array>,
): void {
  const parsed = parseJson(data);
  if (!parsed.ok) {
    collector.add('ERROR', 'TEXTURE_MCMETA_JSON', 'Texture metadata is not valid JSON.', path, parsed.error);
    return;
  }
  const errors = validateJsonValue('texture-meta', parsed.value);
  if (errors.length > 0) {
    collector.add('ERROR', 'TEXTURE_MCMETA_SCHEMA', 'Texture metadata does not match the schema.', path, errors.join('; '));
  }
  if (!isRecord(parsed.value) || !isRecord(parsed.value.animation)) {
    collector.add('PASS', 'TEXTURE_MCMETA_OK', 'Texture metadata is valid.', path);
    return;
  }
  const animation = parsed.value.animation;
  const texturePath = path.replace(/\.mcmeta$/i, '');
  const texture = files.get(texturePath);
  const info = texture ? readPngInfo(texture) : null;
  if (!info) {
    collector.add('WARNING', 'TEXTURE_MCMETA_MISSING_PNG', 'Animation metadata has no matching PNG texture.', path, texturePath);
    return;
  }
  const frameHeight = typeof animation.height === 'number' && animation.height > 0 ? animation.height : info.width;
  if (frameHeight <= 0 || info.height % frameHeight !== 0) {
    collector.add(
      'WARNING',
      'TEXTURE_ANIMATION_DIMENSIONS',
      'Animated texture height is not a multiple of the frame height.',
      path,
      `${info.width}x${info.height}, frame height ${frameHeight}`,
    );
    return;
  }
  const frameCount = info.height / frameHeight;
  if (Array.isArray(animation.frames)) {
    for (const frame of animation.frames) {
      const index = typeof frame === 'number' ? frame : isRecord(frame) ? frame.index : undefined;
      if (typeof index === 'number' && (index < 0 || index >= frameCount)) {
        collector.add(
          'WARNING',
          'TEXTURE_ANIMATION_FRAME',
          `Animation frame index ${index} is outside the ${frameCount} available frames.`,
          path,
        );
        break;
      }
    }
  }
  collector.add('PASS', 'TEXTURE_MCMETA_OK', 'Animation metadata is valid.', path);
}

function validateShader(collector: Collector, path: string, data: Uint8Array): void {
  const lower = path.toLowerCase();
  if (lower.endsWith('.json')) {
    const parsed = parseJson(data);
    if (!parsed.ok) {
      collector.add('ERROR', 'SHADER_JSON', 'Shader definition is not valid JSON.', path, parsed.error);
      return;
    }
    collector.add('PASS', 'SHADER_JSON_OK', 'Shader definition JSON is valid (not rewritten).', path);
    return;
  }
  const text = decode(data);
  if (text.trim().length === 0) {
    collector.add('ERROR', 'SHADER_EMPTY', 'Shader source is empty.', path);
    return;
  }
  const counts = { '{': 0, '}': 0, '(': 0, ')': 0, '[': 0, ']': 0 };
  let inLineComment = false;
  let inBlockComment = false;
  let inString = false;
  let quote = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (inLineComment) {
      if (char === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }
    if (inString) {
      if (char === '\\') {
        index += 1;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }
    if (char === '/' && next === '/') {
      inLineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      continue;
    }
    if (char === '{' || char === '}' || char === '(' || char === ')' || char === '[' || char === ']') {
      counts[char] += 1;
    }
  }
  if (counts['{'] !== counts['}'] || counts['('] !== counts[')'] || counts['['] !== counts[']']) {
    collector.add(
      'ERROR',
      'SHADER_SYNTAX',
      'Shader source has unbalanced braces, parentheses or brackets.',
      path,
      `{ ${counts['{']}/${counts['}']}, ( ${counts['(']}/${counts[')']}, [ ${counts['[']}/${counts[']']} ]`,
    );
    return;
  }
  collector.add('PASS', 'SHADER_SYNTAX_OK', 'Shader source passed the structural check (not rewritten).', path);
}

function validateLang(collector: Collector, path: string, data: Uint8Array): void {
  const parsed = parseJson(data);
  if (!parsed.ok) {
    collector.add('ERROR', 'LANG_JSON', 'Language file is not valid JSON.', path, parsed.error);
    return;
  }
  if (!isRecord(parsed.value)) {
    collector.add('ERROR', 'LANG_SCHEMA', 'Language file must contain a JSON object.', path);
    return;
  }
  const invalid = Object.entries(parsed.value).find(([, value]) => typeof value !== 'string');
  if (invalid) {
    collector.add('WARNING', 'LANG_VALUE', `Language value for "${invalid[0]}" is not a string.`, path);
    return;
  }
  collector.add('PASS', 'LANG_OK', 'Language file is valid.', path);
}

function validatePackMcmeta(
  collector: Collector,
  archive: PackArchive,
  analysis: PackAnalysis,
  targetFormat: PackFormat | undefined,
): void {
  const bytes = archive.files.get('pack.mcmeta');
  if (!bytes) {
    if (!analysis.hasPackMcmeta && analysis.detection.mcmeta === null && analysis.detection.format !== null) {
      collector.add('WARNING', 'PACK_MCMETA_MISSING', 'pack.mcmeta is missing; the client cannot read pack metadata.', 'pack.mcmeta');
    } else if (!analysis.hasPackMcmeta) {
      collector.add('ERROR', 'PACK_MCMETA_MISSING', 'pack.mcmeta is missing.', 'pack.mcmeta');
    }
    return;
  }
  const parsed = parseJson(bytes);
  if (!parsed.ok) {
    collector.add('ERROR', 'PACK_MCMETA_JSON', 'pack.mcmeta is not valid JSON.', 'pack.mcmeta', parsed.error);
    return;
  }
  const errors = validateJsonValue('pack.mcmeta', parsed.value);
  if (errors.length > 0) {
    collector.add('ERROR', 'PACK_MCMETA_SCHEMA', 'pack.mcmeta does not match the schema.', 'pack.mcmeta', errors.join('; '));
  }
  if (!isRecord(parsed.value) || !isRecord(parsed.value.pack)) {
    collector.add('ERROR', 'PACK_MCMETA_PACK', 'pack.mcmeta has no "pack" object.', 'pack.mcmeta');
    return;
  }
  const pack = parsed.value.pack;
  const packFormat = parsePackFormat(pack.pack_format);
  const minFormat = parsePackFormat(pack.min_format);
  const maxFormat = parsePackFormat(pack.max_format);
  const supported = pack.supported_formats;

  if (minFormat && maxFormat && comparePackFormat(minFormat, maxFormat) > 0) {
    collector.add('ERROR', 'PACK_MCMETA_RANGE', 'min_format is greater than max_format.', 'pack.mcmeta');
  }

  if (targetFormat) {
    const requiresMinMax = targetFormat.major >= 69;
    if (requiresMinMax) {
      if (!minFormat || !maxFormat) {
        collector.add('ERROR', 'PACK_MCMETA_MIN_MAX', 'Resource pack format 69+ requires min_format and max_format.', 'pack.mcmeta');
      } else if (comparePackFormat(minFormat, targetFormat) !== 0 || comparePackFormat(maxFormat, targetFormat) !== 0) {
        collector.add(
          'WARNING',
          'PACK_MCMETA_TARGET',
          `min_format/max_format do not match the selected target ${formatPackFormat(targetFormat)}.`,
          'pack.mcmeta',
          `${formatPackFormat(minFormat)}–${formatPackFormat(maxFormat)}`,
        );
      }
      if (pack.pack_format !== undefined) {
        collector.add('WARNING', 'PACK_MCMETA_PACK_FORMAT', 'pack_format is deprecated for resource pack format 69+.', 'pack.mcmeta');
      }
      if (supported !== undefined) {
        collector.add('WARNING', 'PACK_MCMETA_SUPPORTED_FORMATS', 'supported_formats is not used for resource pack format 69+.', 'pack.mcmeta');
      }
    } else {
      if (pack.pack_format === undefined) {
        collector.add('ERROR', 'PACK_MCMETA_PACK_FORMAT', 'pack_format is missing.', 'pack.mcmeta');
      } else if (packFormat && comparePackFormat(packFormat, targetFormat) !== 0) {
        collector.add(
          'WARNING',
          'PACK_MCMETA_TARGET',
          `pack_format does not match the selected target ${formatPackFormat(targetFormat)}.`,
          'pack.mcmeta',
          formatPackFormat(packFormat),
        );
      }
      if (minFormat || maxFormat) {
        collector.add('WARNING', 'PACK_MCMETA_MIN_MAX', 'min_format/max_format are not understood by resource pack formats below 69.', 'pack.mcmeta');
      }
    }
  }

  if (isRecord(parsed.value.overlays) && Array.isArray(parsed.value.overlays.entries)) {
    for (const entry of parsed.value.overlays.entries) {
      if (!isRecord(entry) || typeof entry.directory !== 'string') continue;
      const prefix = `${entry.directory.replace(/\/$/, '')}/`;
      const exists = [...archive.files.keys()].some((path) => path.startsWith(prefix));
      if (!exists) {
        collector.add('WARNING', 'PACK_OVERLAY_MISSING', `Overlay directory "${entry.directory}" does not exist.`, 'pack.mcmeta');
      }
      if (targetFormat && targetFormat.major >= 69 && entry.formats !== undefined && entry.min_format === undefined) {
        collector.add('WARNING', 'PACK_OVERLAY_FORMATS', `Overlay "${entry.directory}" still uses formats instead of min_format/max_format.`, 'pack.mcmeta');
      }
    }
  }

  collector.add('PASS', 'PACK_MCMETA_OK', 'pack.mcmeta is valid.', 'pack.mcmeta');
}

function validateFont(
  collector: Collector,
  path: string,
  data: Uint8Array,
  targetFormat: PackFormat | undefined,
): void {
  const parsed = parseJson(data);
  if (!parsed.ok) {
    collector.add('ERROR', 'FONT_JSON', 'Font file is not valid JSON.', path, parsed.error);
    return;
  }
  const errors = validateJsonValue('font', parsed.value);
  if (errors.length > 0) {
    collector.add('ERROR', 'FONT_SCHEMA', 'Font file does not match the schema.', path, errors.join('; '));
  }
  if (!isRecord(parsed.value) || !Array.isArray(parsed.value.providers)) return;
  for (const provider of parsed.value.providers) {
    if (!isRecord(provider)) continue;
    const type = provider.type;
    if (type === 'legacy_unicode' && targetFormat && targetFormat.major >= 15) {
      collector.add(
        'ERROR',
        'FONT_LEGACY_UNICODE',
        'The legacy_unicode provider was removed in resource pack format 15 and cannot be regenerated.',
        path,
      );
    }
    if (type === 'ttf') {
      const shift = provider.shift;
      if (Array.isArray(shift)) {
        for (const value of shift) {
          if (typeof value === 'number' && (value < -512 || value > 512)) {
            collector.add(
              'ERROR',
              'FONT_TTF_SHIFT',
              'TTF provider shift must be between -512 and 512 for resource pack format 32+.',
              path,
              String(value),
            );
            break;
          }
        }
      }
    }
  }
  collector.add('PASS', 'FONT_OK', 'Font providers are structurally valid.', path);
}

function validateSoundDefinition(collector: Collector, path: string, data: Uint8Array): void {
  const parsed = parseJson(data);
  if (!parsed.ok) {
    collector.add('ERROR', 'SOUNDS_JSON', 'sounds.json is not valid JSON.', path, parsed.error);
    return;
  }
  const errors = validateJsonValue('sound-definition', parsed.value);
  if (errors.length > 0) {
    collector.add('ERROR', 'SOUNDS_SCHEMA', 'sounds.json does not match the schema.', path, errors.join('; '));
  }
  collector.add('PASS', 'SOUNDS_OK', 'sounds.json is structurally valid.', path);
}

function validateBlockstate(collector: Collector, path: string, data: Uint8Array): void {
  const parsed = parseJson(data);
  if (!parsed.ok) {
    collector.add('ERROR', 'BLOCKSTATE_JSON', 'Blockstate file is not valid JSON.', path, parsed.error);
    return;
  }
  const errors = validateJsonValue('blockstate', parsed.value);
  if (errors.length > 0) {
    collector.add('ERROR', 'BLOCKSTATE_SCHEMA', 'Blockstate file does not match the schema.', path, errors.join('; '));
  }
  collector.add('PASS', 'BLOCKSTATE_OK', 'Blockstate structure is valid.', path);
}

function validateAtlas(collector: Collector, path: string, data: Uint8Array): void {
  const parsed = parseJson(data);
  if (!parsed.ok) {
    collector.add('ERROR', 'ATLAS_JSON', 'Atlas file is not valid JSON.', path, parsed.error);
    return;
  }
  const errors = validateJsonValue('atlas', parsed.value);
  if (errors.length > 0) {
    collector.add('ERROR', 'ATLAS_SCHEMA', 'Atlas file does not match the schema.', path, errors.join('; '));
  }
  collector.add('PASS', 'ATLAS_OK', 'Atlas structure is valid.', path);
}

function validateModel(collector: Collector, path: string, data: Uint8Array): void {
  const parsed = parseJson(data);
  if (!parsed.ok) {
    collector.add('ERROR', 'MODEL_JSON', 'Model file is not valid JSON.', path, parsed.error);
    return;
  }
  const errors = validateJsonValue('model', parsed.value);
  if (errors.length > 0) {
    collector.add('ERROR', 'MODEL_SCHEMA', 'Model file does not match the schema.', path, errors.join('; '));
  }
  collector.add('PASS', 'MODEL_OK', 'Model structure is valid.', path);
}

function walkItemsModel(
  collector: Collector,
  path: string,
  node: unknown,
  depth = 0,
): void {
  if (depth > 64) {
    collector.add('ERROR', 'ITEMS_MODEL_DEPTH', 'Items model tree is too deeply nested.', path);
    return;
  }
  if (!isRecord(node)) {
    collector.add('ERROR', 'ITEMS_MODEL_NODE', 'Items model node is not an object.', path);
    return;
  }
  const type = node.type;
  switch (type) {
    case 'minecraft:model':
      if (typeof node.model !== 'string') {
        collector.add('ERROR', 'ITEMS_MODEL_REFERENCE', 'minecraft:model is missing a model reference.', path);
      }
      return;
    case 'minecraft:composite':
      if (!Array.isArray(node.models)) {
        collector.add('ERROR', 'ITEMS_MODEL_COMPOSITE', 'minecraft:composite is missing models.', path);
        return;
      }
      for (const child of node.models) walkItemsModel(collector, path, child, depth + 1);
      return;
    case 'minecraft:condition':
      if (typeof node.property !== 'string') {
        collector.add('ERROR', 'ITEMS_MODEL_CONDITION', 'minecraft:condition is missing property.', path);
      }
      walkItemsModel(collector, path, node.on_true, depth + 1);
      walkItemsModel(collector, path, node.on_false, depth + 1);
      return;
    case 'minecraft:select':
      if (typeof node.property !== 'string') {
        collector.add('ERROR', 'ITEMS_MODEL_SELECT', 'minecraft:select is missing property.', path);
      }
      if (Array.isArray(node.cases)) {
        for (const item of node.cases) {
          if (isRecord(item)) walkItemsModel(collector, path, item.model, depth + 1);
        }
      }
      if (node.fallback !== undefined) walkItemsModel(collector, path, node.fallback, depth + 1);
      return;
    case 'minecraft:range_dispatch':
      if (typeof node.property !== 'string') {
        collector.add('ERROR', 'ITEMS_MODEL_RANGE', 'minecraft:range_dispatch is missing property.', path);
      }
      if (Array.isArray(node.entries)) {
        for (const entry of node.entries) {
          if (isRecord(entry)) {
            if (typeof entry.threshold !== 'number') {
              collector.add('ERROR', 'ITEMS_MODEL_THRESHOLD', 'range_dispatch entry is missing a numeric threshold.', path);
            }
            walkItemsModel(collector, path, entry.model, depth + 1);
          }
        }
      }
      if (node.fallback !== undefined) walkItemsModel(collector, path, node.fallback, depth + 1);
      return;
    case 'minecraft:special':
      if (typeof node.base !== 'string') {
        collector.add('WARNING', 'ITEMS_MODEL_SPECIAL_BASE', 'minecraft:special has no base model.', path);
      }
      return;
    case 'minecraft:empty':
    case 'minecraft:bundle/selected_item':
      return;
    default:
      collector.add('ERROR', 'ITEMS_MODEL_TYPE', `Unknown items model type "${String(type)}".`, path);
  }
}

function validateItemDefinition(collector: Collector, path: string, data: Uint8Array): void {
  const parsed = parseJson(data);
  if (!parsed.ok) {
    collector.add('ERROR', 'ITEMS_DEFINITION_JSON', 'Items model definition is not valid JSON.', path, parsed.error);
    return;
  }
  const errors = validateJsonValue('item-definition', parsed.value);
  if (errors.length > 0) {
    collector.add('ERROR', 'ITEMS_DEFINITION_SCHEMA', 'Items model definition does not match the schema.', path, errors.join('; '));
  }
  if (isRecord(parsed.value)) walkItemsModel(collector, path, parsed.value.model);
  collector.add('PASS', 'ITEMS_DEFINITION_OK', 'Items model definition is structurally valid.', path);
}

function validateParticle(collector: Collector, path: string, data: Uint8Array): void {
  const parsed = parseJson(data);
  if (!parsed.ok) {
    collector.add('ERROR', 'PARTICLE_JSON', 'Particle definition is not valid JSON.', path, parsed.error);
    return;
  }
  if (!isRecord(parsed.value)) {
    collector.add('ERROR', 'PARTICLE_SCHEMA', 'Particle definition must be a JSON object.', path);
    return;
  }
  if (parsed.value.textures !== undefined) {
    if (!Array.isArray(parsed.value.textures) || parsed.value.textures.some((value) => typeof value !== 'string')) {
      collector.add('WARNING', 'PARTICLE_TEXTURES', 'Particle textures must be an array of texture ids.', path);
      return;
    }
  }
  collector.add('PASS', 'PARTICLE_OK', 'Particle definition is valid.', path);
}

function validateReferences(
  collector: Collector,
  analysis: PackAnalysis,
  maxReferenceWarnings: number,
): void {
  const missing = analysis.missingReferences;
  const limited = missing.slice(0, maxReferenceWarnings);
  for (const edge of limited) {
    collector.add(
      'WARNING',
      `MISSING_REFERENCE_${edge.kind.toUpperCase().replace(/-/g, '_')}`,
      `Referenced resource does not exist: ${edge.to}`,
      edge.from,
    );
  }
  if (missing.length > limited.length) {
    collector.add(
      'WARNING',
      'MISSING_REFERENCES_TRUNCATED',
      `${missing.length - limited.length} additional missing references were omitted from the report.`,
    );
  }
}

function validateTargetTextures(
  collector: Collector,
  archive: PackArchive,
  targetFormat: PackFormat | undefined,
): void {
  if (!targetFormat || targetFormat.major < 22) return;
  for (const [path, data] of archive.files) {
    if (!/^assets\/[^/]+\/textures\//i.test(path)) continue;
    const lower = path.toLowerCase();
    if (lower.endsWith('.png') || lower.endsWith('.png.mcmeta') || lower.endsWith('.mcmeta')) continue;
    collector.add(
      'ERROR',
      'TEXTURE_NOT_PNG',
      'Resource pack format 22+ only supports .png texture files.',
      path,
      `${data.byteLength} bytes`,
    );
  }
}

function kindValidator(kind: FileKind): ((collector: Collector, path: string, data: Uint8Array) => void) | null {
  switch (kind) {
    case 'model':
      return validateModel;
    case 'item-definition':
      return validateItemDefinition;
    case 'blockstate':
      return validateBlockstate;
    case 'font':
      return null; // handled separately because it needs the target format
    case 'sound-definition':
      return validateSoundDefinition;
    case 'atlas':
      return validateAtlas;
    case 'particle':
      return validateParticle;
    case 'lang':
      return validateLang;
    case 'shader':
      return validateShader;
    case 'texture-meta':
      return null; // handled separately because it cross-checks the PNG
    default:
      return null;
  }
}

function summarize(issues: ValidationIssue[]): ValidationSummary {
  const summary: ValidationSummary = { pass: 0, warning: 0, error: 0, notChecked: 0 };
  for (const issue of issues) {
    switch (issue.status) {
      case 'PASS':
        summary.pass += 1;
        break;
      case 'WARNING':
        summary.warning += 1;
        break;
      case 'ERROR':
        summary.error += 1;
        break;
      case 'NOT_CHECKED':
        summary.notChecked += 1;
        break;
    }
  }
  return summary;
}

/**
 * Validates a resource pack after conversion. Validation never mutates files and
 * never re-encodes images or audio.
 */
export function validateArchive(
  archive: PackArchive,
  analysis: PackAnalysis,
  options: ValidationOptions = {},
): ValidationResult {
  const collector = createCollector();
  const maxReferenceWarnings = options.maxReferenceWarnings ?? 500;

  validatePackMcmeta(collector, archive, analysis, options.targetFormat);

  for (const classification of analysis.classifications) {
    const data = archive.files.get(classification.path);
    if (!data) continue;
    const { path, kind } = classification;

    if (kind === 'pack-png') {
      validatePng(collector, path, data);
      continue;
    }
    if (kind === 'texture') {
      validatePng(collector, path, data);
      continue;
    }
    if (kind === 'sound') {
      if (!isOgg(data)) {
        collector.add('ERROR', 'OGG_SIGNATURE', 'Sound file does not start with a valid Ogg signature.', path);
      } else {
        collector.add('PASS', 'OGG_OK', 'Ogg signature is valid.', path);
      }
      continue;
    }
    if (kind === 'font') {
      validateFont(collector, path, data, options.targetFormat);
      continue;
    }
    if (kind === 'texture-meta') {
      validateTextureMcmeta(collector, path, data, archive.files);
      continue;
    }
    if (kind === 'pack-mcmeta') continue;

    const validator = kindValidator(kind);
    if (validator) {
      validator(collector, path, data);
      continue;
    }

    if (kind === 'unknown' || kind === 'optifine' || kind === 'gui' || kind === 'data') {
      collector.add('NOT_CHECKED', 'NOT_AUTOMATIC', 'This file is preserved without automatic validation.', path);
    }
  }

  validateTargetTextures(collector, archive, options.targetFormat);
  validateReferences(collector, analysis, maxReferenceWarnings);

  const issues = collector.issues;
  return { issues, summary: summarize(issues) };
}

export function hasValidationErrors(result: ValidationResult): boolean {
  return result.summary.error > 0;
}

export { isPng, isOgg, readPngInfo };
