import {
  comparePackFormat,
  formatPackFormat,
  packFormat,
  parsePackFormat,
  RpcError,
  type FormatRange,
  type MinecraftVersionInfo,
  type PackFormat,
  type RuleMetadata,
} from '@rpc/core';
import legacyVersions from '../../../version-data/versions/legacy.json';
import modernVersions from '../../../version-data/versions/modern.json';
import currentVersions from '../../../version-data/versions/current.json';
import futureVersions from '../../../version-data/versions/future.json';
import rawRules from '../../../version-data/migrations/rules.json';

interface RawVersionEntry {
  id: string;
  label: string;
  versions: string[];
  resourcePackFormat: unknown;
  dataPackFormat?: unknown;
  notes?: string[];
  migrationRuleIds?: string[];
  source: string;
}

interface RawVersionFile {
  versions: RawVersionEntry[];
}

interface RawRule {
  id: string;
  name: string;
  description: string;
  kind: RuleMetadata['kind'];
  introducedIn: unknown;
  appliesFrom?: unknown;
  appliesTo?: unknown;
  source: string;
}

export interface VersionInfo extends MinecraftVersionInfo {
  migrationRuleIds: string[];
}

function coerceFormat(value: unknown, context: string): PackFormat {
  const parsed = parsePackFormat(value);
  if (parsed) return parsed;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const major = record.major;
    const minor = record.minor ?? 0;
    if (typeof major === 'number' && Number.isFinite(major) && major >= 0) {
      return packFormat(Math.trunc(major), typeof minor === 'number' && minor >= 0 ? Math.trunc(minor) : 0);
    }
  }
  throw new RpcError('INTERNAL', 'error.internal', `Invalid pack format in version data: ${context}`);
}

function normalizeVersion(entry: RawVersionEntry): VersionInfo {
  return {
    id: entry.id,
    label: entry.label,
    versions: [...entry.versions],
    resourcePackFormat: coerceFormat(entry.resourcePackFormat, entry.id),
    dataPackFormat: entry.dataPackFormat === undefined ? undefined : coerceFormat(entry.dataPackFormat, `${entry.id} data`),
    notes: entry.notes ? [...entry.notes] : [],
    migrationRuleIds: entry.migrationRuleIds ? [...entry.migrationRuleIds] : [],
    source: entry.source,
  };
}

const versionFiles = [legacyVersions, modernVersions, currentVersions, futureVersions] as RawVersionFile[];

export const ALL_VERSIONS: VersionInfo[] = versionFiles
  .flatMap((file) => file.versions.map(normalizeVersion))
  .sort((a, b) => comparePackFormat(a.resourcePackFormat, b.resourcePackFormat));

const versionById = new Map<string, VersionInfo>();
const versionByRelease = new Map<string, VersionInfo>();
for (const version of ALL_VERSIONS) {
  versionById.set(version.id, version);
  for (const release of version.versions) versionByRelease.set(release, version);
}

export const LATEST_VERSION: VersionInfo = ALL_VERSIONS[ALL_VERSIONS.length - 1] as VersionInfo;
export const EARLIEST_VERSION: VersionInfo = ALL_VERSIONS[0] as VersionInfo;

export function getVersionById(id: string): VersionInfo | undefined {
  return versionById.get(id) ?? versionByRelease.get(id);
}

export function resolveVersion(id: string): VersionInfo {
  const version = getVersionById(id);
  if (!version) {
    throw new RpcError('TARGET_VERSION_UNKNOWN', 'error.unknownTargetVersion', `Unknown target version: ${id}`, id);
  }
  return version;
}

export function getVersionsByFormat(format: PackFormat): VersionInfo[] {
  return ALL_VERSIONS.filter((version) => comparePackFormat(version.resourcePackFormat, format) === 0);
}

export function getVersionsInRange(range: FormatRange): VersionInfo[] {
  return ALL_VERSIONS.filter(
    (version) =>
      comparePackFormat(version.resourcePackFormat, range.min) >= 0 &&
      comparePackFormat(version.resourcePackFormat, range.max) <= 0,
  );
}

export function getVersionAtOrBefore(format: PackFormat): VersionInfo | undefined {
  let match: VersionInfo | undefined;
  for (const version of ALL_VERSIONS) {
    if (comparePackFormat(version.resourcePackFormat, format) <= 0) match = version;
    else break;
  }
  return match;
}

export function getVersionAtOrAfter(format: PackFormat): VersionInfo | undefined {
  return ALL_VERSIONS.find((version) => comparePackFormat(version.resourcePackFormat, format) >= 0);
}

export function describeFormat(format: PackFormat | null): string {
  if (!format) return 'unknown';
  const versions = getVersionsByFormat(format);
  const number = formatPackFormat(format);
  if (versions.length === 0) return number;
  return `${number} (${versions.map((version) => version.label).join(', ')})`;
}

export function formatVersionRange(version: VersionInfo): string {
  return `${formatPackFormat(version.resourcePackFormat)} / ${version.label}`;
}

export const RULE_METADATA: RuleMetadata[] = (rawRules as { rules: RawRule[] }).rules
  .map((rule) => ({
    id: rule.id,
    name: rule.name,
    description: rule.description,
    kind: rule.kind,
    introducedIn: coerceFormat(rule.introducedIn, `${rule.id} introducedIn`),
    appliesFrom: rule.appliesFrom === undefined || rule.appliesFrom === null
      ? undefined
      : coerceFormat(rule.appliesFrom, `${rule.id} appliesFrom`),
    appliesTo: rule.appliesTo === undefined || rule.appliesTo === null
      ? undefined
      : coerceFormat(rule.appliesTo, `${rule.id} appliesTo`),
    source: rule.source,
  }))
  .sort((a, b) => comparePackFormat(a.introducedIn, b.introducedIn));

const ruleById = new Map(RULE_METADATA.map((rule) => [rule.id, rule]));

export function getRuleMetadata(id: string): RuleMetadata | undefined {
  return ruleById.get(id);
}

export function isRuleApplicable(rule: RuleMetadata, targetFormat: PackFormat): boolean {
  if (comparePackFormat(targetFormat, rule.introducedIn) < 0) return false;
  if (rule.appliesFrom && comparePackFormat(targetFormat, rule.appliesFrom) < 0) return false;
  if (rule.appliesTo && comparePackFormat(targetFormat, rule.appliesTo) > 0) return false;
  return true;
}

export function getApplicableConversionRules(targetFormat: PackFormat): RuleMetadata[] {
  return RULE_METADATA.filter((rule) => rule.kind === 'conversion' && isRuleApplicable(rule, targetFormat));
}

export function getApplicableRules(targetFormat: PackFormat, kind?: RuleMetadata['kind']): RuleMetadata[] {
  return RULE_METADATA.filter(
    (rule) => isRuleApplicable(rule, targetFormat) && (kind === undefined || rule.kind === kind),
  );
}

export function versionSupportsItemsDefinitions(version: VersionInfo): boolean {
  return comparePackFormat(version.resourcePackFormat, packFormat(46)) >= 0;
}
