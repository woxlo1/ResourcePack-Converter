import type { FileClassification, PlanItem } from '@rpc/core';
import type { ConversionRule, RulePlanContext } from '../rule-types';
import { requireRuleMetadata } from '../metadata';

const TEXTURE_ROOT = /^assets\/[^/]+\/textures\//i;

function createValidationRule(
  id: string,
  reason: string,
  matches: (file: FileClassification, files: ReadonlyMap<string, Uint8Array>) => boolean,
): ConversionRule {
  const metadata = requireRuleMetadata(id);
  return {
    metadata,
    plan(context: RulePlanContext) {
      const items: PlanItem[] = [];
      for (const file of context.analysis.classifications) {
        if (!matches(file, context.archiveFiles)) continue;
        items.push({
          path: file.path,
          kind: file.kind,
          action: 'validate',
          ruleIds: [metadata.id],
          reason,
        });
      }
      return items;
    },
    apply() {
      // Validation rules never mutate the archive. The validator package performs the checks.
    },
  };
}

function isNonPngTexture(path: string): boolean {
  if (!TEXTURE_ROOT.test(path)) return false;
  const lower = path.toLowerCase();
  if (lower.endsWith('.png') || lower.endsWith('.png.mcmeta') || lower.endsWith('.mcmeta')) return false;
  return true;
}

export const validationRules: ConversionRule[] = [
  createValidationRule(
    'rpc:fonts/legacy-unicode',
    'Check for removed legacy_unicode font providers.',
    (file) => file.kind === 'font',
  ),
  createValidationRule(
    'rpc:textures/png-only',
    'Check that every file under textures/ is a PNG or PNG metadata file.',
    (file) => isNonPngTexture(file.path),
  ),
  createValidationRule(
    'rpc:fonts/validate',
    'Validate font providers and referenced files.',
    (file) => file.kind === 'font',
  ),
  createValidationRule(
    'rpc:shaders/verify-only',
    'Inspect shader files without rewriting them.',
    (file) => file.kind === 'shader',
  ),
  createValidationRule(
    'rpc:sounds/validate',
    'Validate sounds.json and referenced audio files.',
    (file) => file.kind === 'sound-definition',
  ),
  createValidationRule(
    'rpc:blockstates/validate',
    'Validate blockstates and model references.',
    (file) => file.kind === 'blockstate',
  ),
  createValidationRule(
    'rpc:atlases/validate',
    'Validate atlas definitions.',
    (file) => file.kind === 'atlas',
  ),
  createValidationRule(
    'rpc:textures/validate',
    'Validate PNG signatures and animation metadata.',
    (file) => file.kind === 'texture' || file.kind === 'texture-meta',
  ),
];
