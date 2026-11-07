import { RpcError, type RuleMetadata } from '@rpc/core';
import { getRuleMetadata } from '@rpc/version-registry';

/**
 * Looks up rule metadata declared in version-data/migrations/rules.json.
 * Metadata is the single source of truth for rule ids, names and applicability.
 */
export function requireRuleMetadata(id: string): RuleMetadata {
  const metadata = getRuleMetadata(id);
  if (!metadata) {
    throw new RpcError(
      'INTERNAL',
      'error.internal',
      `Conversion rule metadata is missing for "${id}"`,
      'version-data/migrations/rules.json',
    );
  }
  return metadata;
}
