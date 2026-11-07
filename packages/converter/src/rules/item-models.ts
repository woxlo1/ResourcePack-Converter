import {
  isFormatAtLeast,
  packFormat,
  type PackFormat,
  type PlanItem,
} from '@rpc/core';
import type { ConversionRule, RuleContext, RulePlanContext } from '../rule-types';
import { requireRuleMetadata } from '../metadata';
import { cloneRecord, isRecord, jsonBytes, parseJsonObject, resourceRef, yieldToEventLoop } from '../util';

type JsonObject = Record<string, unknown>;

const ITEM_MODEL_PATH = /^assets\/([^/]+)\/models\/item\/(.+)\.json$/;
const MIN_ITEMS_FORMAT = packFormat(46, 0);
const IGNORE_DEFAULT_FORMAT = packFormat(55, 0);

const BOOLEAN_CONDITIONS: Record<string, string> = {
  damaged: 'minecraft:damaged',
  broken: 'minecraft:broken',
  cast: 'minecraft:fishing_rod/cast',
};

const USING_ITEM_PREDICATES = new Set(['pulling', 'blocking', 'throwing']);

const UNSUPPORTED_PREDICATES = new Set([
  'trim_type',
  'firework',
  'level',
  'filled',
  'tooting',
  'brushing',
  'honey_level',
]);

type PullKind = 'crossbow' | 'bow' | 'unknown';

export interface ItemModelConversion {
  itemDefinition: JsonObject;
  warnings: string[];
}

export interface ItemModelFailure {
  unsupportedKeys: string[];
  reason: string;
}

export type ItemModelOutcome = ItemModelConversion | ItemModelFailure | null;

function modelNode(id: string): JsonObject {
  return { type: 'minecraft:model', model: id };
}

function rangeDispatch(
  property: string,
  threshold: number,
  onTrue: JsonObject,
  onFalse: JsonObject,
  extra: JsonObject = {},
): JsonObject {
  return {
    type: 'minecraft:range_dispatch',
    property,
    ...extra,
    entries: [{ threshold, model: onTrue }],
    fallback: onFalse,
  };
}

function conditionDispatch(
  property: string,
  value: boolean,
  onTrue: JsonObject,
  onFalse: JsonObject,
  extra: JsonObject = {},
): JsonObject {
  return {
    type: 'minecraft:condition',
    property,
    ...extra,
    on_true: value ? onTrue : onFalse,
    on_false: value ? onFalse : onTrue,
  };
}

function selectDispatch(
  property: string,
  when: string,
  onMatch: JsonObject,
  onMismatch: JsonObject,
): JsonObject {
  return {
    type: 'minecraft:select',
    property,
    cases: [{ when, model: onMatch }],
    fallback: onMismatch,
  };
}

function normalizeKey(key: string): string {
  return key.startsWith('minecraft:') ? key.slice('minecraft:'.length) : key;
}

export function inferPullKind(itemId: string, model: JsonObject): PullKind {
  const candidates = [itemId];
  if (typeof model.parent === 'string') candidates.push(model.parent);
  if (isRecord(model.textures)) {
    for (const value of Object.values(model.textures)) {
      if (typeof value === 'string') candidates.push(value);
    }
  }
  const joined = candidates.join(' ').toLowerCase();
  if (joined.includes('crossbow')) return 'crossbow';
  if (/(^|[^a-z])bow([^a-z]|$)/.test(joined)) return 'bow';
  return 'unknown';
}

interface WrappedPredicate {
  node: JsonObject;
  warnings: string[];
}

function wrapPredicate(
  rawKey: string,
  rawValue: unknown,
  onTrue: JsonObject,
  onFalse: JsonObject,
  targetFormat: PackFormat,
  pullKind: PullKind,
): WrappedPredicate | null {
  const key = normalizeKey(rawKey);
  const warnings: string[] = [];

  if (key === 'lefthanded') {
    if (typeof rawValue !== 'boolean') return null;
    return {
      node: selectDispatch('minecraft:main_hand', rawValue ? 'left' : 'right', onTrue, onFalse),
      warnings,
    };
  }

  if (key === 'charged') {
    if (typeof rawValue !== 'boolean') return null;
    const extra: JsonObject = { component: 'minecraft:charged_projectiles' };
    if (isFormatAtLeast(targetFormat, IGNORE_DEFAULT_FORMAT)) extra.ignore_default = true;
    return {
      node: conditionDispatch('minecraft:has_component', rawValue, onTrue, onFalse, extra),
      warnings,
    };
  }

  const booleanProperty = BOOLEAN_CONDITIONS[key];
  if (booleanProperty) {
    if (typeof rawValue !== 'boolean') return null;
    return { node: conditionDispatch(booleanProperty, rawValue, onTrue, onFalse), warnings };
  }

  if (USING_ITEM_PREDICATES.has(key)) {
    if (typeof rawValue !== 'boolean') return null;
    warnings.push(`The legacy "${key}" predicate was approximated with minecraft:using_item.`);
    return { node: conditionDispatch('minecraft:using_item', rawValue, onTrue, onFalse), warnings };
  }

  if (key === 'pull') {
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) return null;
    if (pullKind === 'crossbow') {
      return {
        node: rangeDispatch('minecraft:crossbow/pull', rawValue, onTrue, onFalse),
        warnings,
      };
    }
    if (pullKind === 'unknown') {
      warnings.push('Could not confirm the item is a bow; the pull predicate uses minecraft:use_duration with scale 0.05.');
    }
    return {
      node: rangeDispatch('minecraft:use_duration', rawValue, onTrue, onFalse, { scale: 0.05 }),
      warnings,
    };
  }

  if (key === 'custom_model_data') {
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) return null;
    return {
      node: rangeDispatch('minecraft:custom_model_data', rawValue, onTrue, onFalse, { index: 0 }),
      warnings,
    };
  }

  if (key === 'damage') {
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) return null;
    return {
      node: rangeDispatch('minecraft:damage', rawValue, onTrue, onFalse, { normalize: true }),
      warnings,
    };
  }

  if (key === 'cooldown') {
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) return null;
    return { node: rangeDispatch('minecraft:cooldown', rawValue, onTrue, onFalse), warnings };
  }

  if (key === 'angle') {
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) return null;
    warnings.push('The legacy angle predicate was mapped to a compass pointing at world spawn.');
    return {
      node: rangeDispatch('minecraft:compass', rawValue, onTrue, onFalse, { target: 'spawn' }),
      warnings,
    };
  }

  if (key === 'time') {
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) return null;
    return {
      node: rangeDispatch('minecraft:time', rawValue, onTrue, onFalse, { source: 'daytime' }),
      warnings,
    };
  }

  if (UNSUPPORTED_PREDICATES.has(key)) return null;
  return null;
}

const SUPPORTED_PREDICATES = new Set([
  'lefthanded',
  'charged',
  'pull',
  'custom_model_data',
  'damage',
  'cooldown',
  'angle',
  'time',
  ...Object.keys(BOOLEAN_CONDITIONS),
  ...USING_ITEM_PREDICATES,
]);

function unsupportedKeysOf(predicate: JsonObject): string[] {
  return Object.keys(predicate).filter((key) => !SUPPORTED_PREDICATES.has(normalizeKey(key)));
}

/**
 * Converts a legacy model overrides array into a modern items model definition.
 * Returns null when the model has no overrides and a failure object when any
 * predicate cannot be represented faithfully.
 */
export function convertItemModel(
  model: JsonObject,
  itemId: string,
  namespace: string,
  targetFormat: PackFormat,
): ItemModelOutcome {
  const overrides = model.overrides;
  if (!Array.isArray(overrides) || overrides.length === 0) return null;
  if (!isFormatAtLeast(targetFormat, MIN_ITEMS_FORMAT)) {
    return { unsupportedKeys: [], reason: 'items model definitions require resource pack format 46 or newer' };
  }

  const baseId = `${namespace}:item/${itemId}`;
  const pullKind = inferPullKind(itemId, model);
  const warnings: string[] = [];
  let node = modelNode(baseId);

  for (const entry of overrides) {
    if (!isRecord(entry)) {
      return { unsupportedKeys: [], reason: 'An override entry is not a JSON object' };
    }
    const predicate = entry.predicate;
    const overrideModel = entry.model;
    if (!isRecord(predicate) || typeof overrideModel !== 'string') {
      return { unsupportedKeys: [], reason: 'An override entry is missing a predicate or model reference' };
    }
    const keys = Object.keys(predicate);
    if (keys.length === 0) {
      return { unsupportedKeys: [], reason: 'An override predicate is empty' };
    }

    let wrapped = modelNode(resourceRef(overrideModel, namespace));
    for (const key of [...keys].reverse()) {
      const result = wrapPredicate(key, predicate[key], wrapped, node, targetFormat, pullKind);
      if (!result) {
        return {
          unsupportedKeys: unsupportedKeysOf(predicate).length > 0 ? unsupportedKeysOf(predicate) : [key],
          reason: `Predicate "${key}" has no verified modern equivalent`,
        };
      }
      warnings.push(...result.warnings);
      wrapped = result.node;
    }
    node = wrapped;
  }

  return {
    itemDefinition: { model: node },
    warnings: [...new Set(warnings)],
  };
}

function itemPathFor(namespace: string, itemId: string): string {
  return `assets/${namespace}/items/${itemId}.json`;
}

interface ItemModelFile {
  path: string;
  namespace: string;
  itemId: string;
  model: JsonObject;
}

function collectItemModels(files: ReadonlyMap<string, Uint8Array>): ItemModelFile[] {
  const result: ItemModelFile[] = [];
  for (const path of [...files.keys()].sort()) {
    const match = ITEM_MODEL_PATH.exec(path);
    if (!match) continue;
    const namespace = match[1] as string;
    const itemId = match[2] as string;
    const bytes = files.get(path);
    if (!bytes) continue;
    const parsed = parseJsonObject(bytes);
    if (!parsed) continue;
    result.push({ path, namespace, itemId, model: parsed });
  }
  return result;
}

const itemModelRule: ConversionRule = {
  metadata: requireRuleMetadata('rpc:item-model/overrides'),
  plan(context: RulePlanContext) {
    const items: PlanItem[] = [];
    for (const file of collectItemModels(context.archiveFiles)) {
      if (!Array.isArray(file.model.overrides) || file.model.overrides.length === 0) continue;
      const target = itemPathFor(file.namespace, file.itemId);
      if (context.archiveFiles.has(target)) {
        items.push({
          path: file.path,
          kind: 'model',
          action: 'validate',
          ruleIds: [this.metadata.id],
          reason: `${target} already exists, so this model is preserved with a warning.`,
        });
        continue;
      }
      const outcome = convertItemModel(file.model, file.itemId, file.namespace, context.targetFormat);
      if (outcome === null) continue;
      if ('reason' in outcome) {
        items.push({
          path: file.path,
          kind: 'model',
          action: 'unsupported',
          ruleIds: [this.metadata.id],
          reason: outcome.reason,
        });
        continue;
      }
      items.push({
        path: file.path,
        kind: 'model',
        action: 'convert',
        ruleIds: [this.metadata.id],
        reason: `Create ${target} from legacy model overrides.`,
      });
    }
    return items;
  },
  apply(context: RuleContext) {
    return applyItemModels(context);
  },
};

async function applyItemModels(context: RuleContext): Promise<void> {
  const metadata = itemModelRule.metadata;
  for (const file of collectItemModels(context.files)) {
    context.throwIfCancelled();
    await yieldToEventLoop();
    if (!Array.isArray(file.model.overrides) || file.model.overrides.length === 0) continue;
    const target = itemPathFor(file.namespace, file.itemId);
    if (context.files.has(target)) {
      context.addResult({
        ruleId: metadata.id,
        ruleName: metadata.name,
        status: 'WARNING',
        file: file.path,
        message: `${target} already exists; the model was left untouched.`,
      });
      continue;
    }

    const outcome = convertItemModel(file.model, file.itemId, file.namespace, context.targetFormat);
    if (outcome === null) continue;
    if ('reason' in outcome) {
      context.addResult({
        ruleId: metadata.id,
        ruleName: metadata.name,
        status: 'UNSUPPORTED',
        file: file.path,
        message: outcome.reason,
        details: outcome.unsupportedKeys.length > 0
          ? `Unsupported predicates: ${outcome.unsupportedKeys.join(', ')}`
          : undefined,
        before: file.model.overrides,
      });
      continue;
    }

    const updated = cloneRecord(file.model);
    delete updated.overrides;
    context.files.set(file.path, jsonBytes(updated));
    context.files.set(target, jsonBytes(outcome.itemDefinition));

    context.addResult({
      ruleId: metadata.id,
      ruleName: metadata.name,
      status: 'SUCCESS',
      file: file.path,
      message: `Removed legacy overrides and created ${target}.`,
      before: file.model.overrides,
      after: outcome.itemDefinition,
    });
    context.addResult({
      ruleId: metadata.id,
      ruleName: metadata.name,
      status: 'SUCCESS',
      file: target,
      message: 'Created from legacy item model overrides.',
    });
    for (const warning of outcome.warnings) {
      context.addResult({
        ruleId: metadata.id,
        ruleName: metadata.name,
        status: 'WARNING',
        file: file.path,
        message: warning,
      });
    }
  }
}

export const itemModelRules: ConversionRule[] = [itemModelRule];

