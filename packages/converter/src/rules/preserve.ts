import type { PlanItem } from '@rpc/core';
import type { ConversionRule, RulePlanContext } from '../rule-types';
import { requireRuleMetadata } from '../metadata';

const preservationRule: ConversionRule = {
  metadata: requireRuleMetadata('rpc:unknown/preserve'),
  plan(context: RulePlanContext) {
    const items: PlanItem[] = [];
    for (const file of context.analysis.unknownFiles) {
      items.push({
        path: file.path,
        kind: 'unknown',
        action: 'preserve',
        ruleIds: [this.metadata.id],
        reason: 'Unrecognized file; copied unchanged and listed in the report.',
      });
    }
    return items;
  },
  apply() {
    // Preservation is the default: the converter already starts from a copy of the archive.
  },
};

export const preservationRules: ConversionRule[] = [preservationRule];
