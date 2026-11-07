import { RpcError } from '@rpc/core';
import type { ConversionRule } from '../rule-types';
import { packMcmetaRules } from './pack-mcmeta';
import { textureFolderRules } from './texture-folders';
import { itemModelRules } from './item-models';
import { validationRules } from './validation-rules';
import { preservationRules } from './preserve';

export const ALL_RULES: ConversionRule[] = [
  ...packMcmetaRules,
  ...textureFolderRules,
  ...itemModelRules,
  ...validationRules,
  ...preservationRules,
];

const ruleById = new Map<string, ConversionRule>();
for (const rule of ALL_RULES) {
  const existing = ruleById.get(rule.metadata.id);
  if (existing) {
    throw new RpcError(
      'INTERNAL',
      'error.internal',
      `Duplicate conversion rule implementation for "${rule.metadata.id}"`,
    );
  }
  ruleById.set(rule.metadata.id, rule);
}

export function getRuleImplementation(id: string): ConversionRule | undefined {
  return ruleById.get(id);
}

export const IMPLEMENTED_RULE_IDS: string[] = [...ruleById.keys()].sort();

export * from './pack-mcmeta';
export * from './texture-folders';
export * from './item-models';
