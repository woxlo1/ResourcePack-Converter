import {
  formatPackFormat,
  type AppliedRuleInfo,
  type ConversionPlan,
  type FileKind,
  type PackAnalysis,
  type PackArchive,
  type PackFormat,
  type PlanAction,
  type PlanItem,
} from '@rpc/core';
import {
  getApplicableRules,
  getVersionAtOrBefore,
  getVersionsByFormat,
} from '@rpc/version-registry';
import { getRuleImplementation } from './rules';

const ACTION_PRIORITY: Record<PlanAction, number> = {
  regenerate: 6,
  convert: 5,
  unsupported: 4,
  drop: 3,
  validate: 2,
  preserve: 1,
};

interface MergedItem {
  path: string;
  kind: FileKind;
  action: PlanAction;
  ruleIds: Set<string>;
  reasons: string[];
}

function mergeItem(
  items: Map<string, MergedItem>,
  next: PlanItem,
): void {
  const existing = items.get(next.path);
  if (!existing) {
    items.set(next.path, {
      path: next.path,
      kind: next.kind,
      action: next.action,
      ruleIds: new Set(next.ruleIds),
      reasons: [next.reason],
    });
    return;
  }
  for (const ruleId of next.ruleIds) existing.ruleIds.add(ruleId);
  if (!existing.reasons.includes(next.reason)) existing.reasons.push(next.reason);
  if (ACTION_PRIORITY[next.action] > ACTION_PRIORITY[existing.action]) {
    existing.action = next.action;
  }
  if (next.kind !== 'unknown') existing.kind = next.kind;
}

function labelForFormat(format: PackFormat | null): string {
  if (!format) return 'unknown';
  const exact = getVersionsByFormat(format)[0];
  if (exact) return exact.label;
  const nearest = getVersionAtOrBefore(format);
  const number = formatPackFormat(format);
  return nearest ? `${number} (nearest ${nearest.label})` : number;
}

function expectedWarningsFor(ruleIds: Iterable<string>): string[] {
  const warnings: string[] = [];
  const add = (message: string): void => {
    if (!warnings.includes(message)) warnings.push(message);
  };
  for (const id of ruleIds) {
    switch (id) {
      case 'rpc:item-model/overrides':
        add('Overrides containing predicates without a verified modern equivalent are preserved and reported as unsupported.');
        break;
      case 'rpc:fonts/legacy-unicode':
        add('Fonts using the removed legacy_unicode provider cannot be regenerated automatically and are preserved.');
        break;
      case 'rpc:shaders/verify-only':
        add('Shader programs are validated but never rewritten automatically.');
        break;
      case 'rpc:textures/png-only':
        add('Non-PNG texture files are reported and preserved because they cannot be converted safely.');
        break;
      case 'rpc:unknown/preserve':
        add('Files that are not recognized as Minecraft resources are copied unchanged.');
        break;
      default:
        break;
    }
  }
  return warnings;
}

export interface PlanOptions {
  preserveUnknownFiles?: boolean;
}

/**
 * Builds a deterministic conversion plan for the requested target format.
 * Every source file receives exactly one action so the UI can show an accurate
 * preview before the conversion starts.
 */
export function createConversionPlan(
  archive: PackArchive,
  analysis: PackAnalysis,
  targetFormat: PackFormat,
  options: PlanOptions = {},
): ConversionPlan {
  const preserveUnknownFiles = options.preserveUnknownFiles ?? true;
  const applicable = getApplicableRules(targetFormat).filter(
    (rule) => rule.id !== 'rpc:unknown/preserve' || preserveUnknownFiles,
  );

  const merged = new Map<string, MergedItem>();
  const usedRuleIds = new Set<string>();

  for (const metadata of applicable) {
    const rule = getRuleImplementation(metadata.id);
    if (!rule) continue;
    let items: PlanItem[];
    try {
      items = rule.plan({
        archiveFiles: archive.files,
        analysis,
        sourceFormat: analysis.detection.format,
        targetFormat,
      });
    } catch {
      continue;
    }
    for (const item of items) {
      mergeItem(merged, item);
      usedRuleIds.add(metadata.id);
    }
  }

  for (const file of analysis.classifications) {
    if (merged.has(file.path)) continue;
    if (file.kind === 'unknown') {
      mergeItem(merged, {
        path: file.path,
        kind: file.kind,
        action: preserveUnknownFiles ? 'preserve' : 'drop',
        ruleIds: preserveUnknownFiles ? ['rpc:unknown/preserve'] : [],
        reason: preserveUnknownFiles
          ? 'Unrecognized file; copied unchanged.'
          : 'Unrecognized file; excluded because unknown-file preservation is disabled.',
      });
      if (preserveUnknownFiles) usedRuleIds.add('rpc:unknown/preserve');
    } else {
      mergeItem(merged, {
        path: file.path,
        kind: file.kind,
        action: 'validate',
        ruleIds: [],
        reason: 'Known resource file; checked by the validator.',
      });
    }
  }

  const items = [...merged.values()]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map<PlanItem>((item) => ({
      path: item.path,
      kind: item.kind,
      action: item.action,
      ruleIds: [...item.ruleIds].sort(),
      reason: item.reasons.join(' '),
    }));

  const filesToConvert = items.filter((item) => item.action === 'convert' || item.action === 'regenerate').length;
  const filesToValidate = items.filter((item) => item.action === 'validate').length;
  const filesPreserved = items.filter((item) => item.action === 'preserve').length;
  const filesUnsupported = items.filter((item) => item.action === 'unsupported' || item.action === 'drop').length;

  const rules: AppliedRuleInfo[] = applicable
    .filter((metadata) => usedRuleIds.has(metadata.id))
    .map((metadata) => ({
      id: metadata.id,
      name: metadata.name,
      description: metadata.description,
      source: metadata.source,
    }));

  return {
    sourceFormat: analysis.detection.format,
    targetFormat,
    sourceLabel: labelForFormat(analysis.detection.format),
    targetLabel: labelForFormat(targetFormat),
    totalFiles: analysis.fileCount,
    filesToConvert,
    filesToValidate,
    filesPreserved,
    filesUnsupported,
    items,
    rules,
    expectedWarnings: expectedWarningsFor(usedRuleIds),
  };
}
