import type { PlanItem } from '@rpc/core';
import type { ConversionRule, RuleContext, RulePlanContext } from '../rule-types';
import { requireRuleMetadata } from '../metadata';
import { cloneRecord, isRecord, jsonBytes, parseJsonObject, yieldToEventLoop } from '../util';

const LEGACY_FOLDER = /^assets\/([^/]+)\/textures\/(blocks|items)\/(.+)$/;
const TEXTURE_REFERENCE = /^((?:[a-z0-9_.-]+:)?)(blocks|items)\/(.+)$/i;

function renamedPath(path: string): { path: string; from: string; to: string } | null {
  const match = LEGACY_FOLDER.exec(path);
  if (!match) return null;
  const namespace = match[1] as string;
  const folder = match[2] as string;
  const rest = match[3] as string;
  const replacement = folder === 'blocks' ? 'block' : 'item';
  return {
    path: `assets/${namespace}/textures/${replacement}/${rest}`,
    from: folder,
    to: replacement,
  };
}

function textureReferencePath(namespace: string, folder: string, rest: string): string {
  return `assets/${namespace}/textures/${folder}/${rest}.png`;
}

/** Rewrites model texture references that point at a renamed texture folder. */
function updateModelReferences(context: RuleContext): number {
  let updated = 0;
  for (const [path, bytes] of [...context.files]) {
    if (!/^assets\/[^/]+\/models\/.+\.json$/.test(path)) continue;
    const parsed = parseJsonObject(bytes);
    if (!parsed || !isRecord(parsed.textures)) continue;
    const model = cloneRecord(parsed);
    const textures = model.textures;
    if (!isRecord(textures)) continue;
    let changed = false;
    for (const [key, value] of Object.entries(textures)) {
      if (typeof value !== 'string' || value.startsWith('#')) continue;
      const match = TEXTURE_REFERENCE.exec(value);
      if (!match) continue;
      const prefix = match[1] ?? '';
      const folder = match[2] as string;
      const rest = match[3] as string;
      const namespace = prefix.length > 0 ? prefix.slice(0, -1) : 'minecraft';
      const replacement = folder.toLowerCase() === 'blocks' ? 'block' : 'item';
      const target = textureReferencePath(namespace, replacement, rest);
      if (!context.files.has(target)) continue;
      textures[key] = `${prefix}${replacement}/${rest}`;
      changed = true;
    }
    if (changed) {
      context.files.set(path, jsonBytes(model));
      updated += 1;
    }
  }
  return updated;
}

const textureFolderRule: ConversionRule = {
  metadata: requireRuleMetadata('rpc:textures/folder-rename'),
  plan(context: RulePlanContext) {
    const items: PlanItem[] = [];
    for (const path of context.archiveFiles.keys()) {
      const rename = renamedPath(path);
      if (!rename) continue;
      items.push({
        path,
        kind: 'texture' as const,
        action: 'convert' as const,
        ruleIds: [this.metadata.id],
        reason: `Rename textures/${rename.from} to textures/${rename.to}.`,
      });
    }
    return items;
  },
  async apply(context: RuleContext) {
    const paths = [...context.files.keys()].sort();
    let renamed = 0;
    let skipped = 0;
    for (const path of paths) {
      context.throwIfCancelled();
      await yieldToEventLoop();
      const rename = renamedPath(path);
      if (!rename) continue;
      if (context.files.has(rename.path)) {
        skipped += 1;
        context.addResult({
          ruleId: this.metadata.id,
          ruleName: this.metadata.name,
          status: 'WARNING',
          file: path,
          message: `Texture folder was not renamed because ${rename.path} already exists.`,
        });
        continue;
      }
      const data = context.files.get(path);
      if (!data) continue;
      context.files.delete(path);
      context.files.set(rename.path, data);
      renamed += 1;
      context.addResult({
        ruleId: this.metadata.id,
        ruleName: this.metadata.name,
        status: 'SUCCESS',
        file: path,
        message: `Renamed textures/${rename.from} to textures/${rename.to}.`,
        before: path,
        after: rename.path,
      });
    }
    const references = updateModelReferences(context);
    if (references > 0) {
      context.log('INFO', `Updated texture folder references in ${references} model file(s).`);
    }
    if (renamed === 0 && skipped === 0) {
      context.log('DEBUG', 'No legacy texture folders needed renaming.');
    }
  },
};

export const textureFolderRules: ConversionRule[] = [textureFolderRule];
