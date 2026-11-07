import { describe, expect, it } from 'vitest';
import {
  comparePackFormat,
  formatPackFormat,
  normalizeFormatRange,
  packFormat,
  parsePackFormat,
  sanitizeFileNameBase,
  containsControlCharacters,
} from '@rpc/core';
import {
  ALL_VERSIONS,
  getApplicableRules,
  getVersionById,
  isRuleApplicable,
  RULE_METADATA,
} from '@rpc/version-registry';

describe('pack formats', () => {
  it('parses integers, single-element arrays and major/minor arrays', () => {
    expect(parsePackFormat(46)).toEqual({ major: 46, minor: 0 });
    expect(parsePackFormat([69])).toEqual({ major: 69, minor: 0 });
    expect(parsePackFormat([69, 1])).toEqual({ major: 69, minor: 1 });
    expect(parsePackFormat('46')).toBeNull();
    expect(parsePackFormat(-1)).toBeNull();
    expect(parsePackFormat([1, 2, 3])).toBeNull();
  });

  it('formats and compares major/minor formats', () => {
    expect(formatPackFormat(packFormat(46))).toBe('46');
    expect(formatPackFormat(packFormat(69, 1))).toBe('69.1');
    expect(comparePackFormat(packFormat(69, 0), packFormat(69, 1))).toBe(-1);
    expect(comparePackFormat(packFormat(70, 0), packFormat(69, 9))).toBe(1);
    expect(comparePackFormat(packFormat(46), packFormat(46))).toBe(0);
  });

  it('normalizes format ranges and rejects inverted ranges', () => {
    expect(normalizeFormatRange([4, 46])).toEqual({ min: packFormat(4), max: packFormat(46) });
    expect(normalizeFormatRange({ min_inclusive: 4, max_inclusive: 46 })).toEqual({
      min: packFormat(4),
      max: packFormat(46),
    });
    expect(normalizeFormatRange({ min_inclusive: 46, max_inclusive: 4 })).toBeNull();
    expect(normalizeFormatRange('nope')).toBeNull();
  });
});

describe('version registry', () => {
  it('contains the documented resource pack format history', () => {
    const formats = ALL_VERSIONS.map((version) => formatPackFormat(version.resourcePackFormat));
    expect(formats).toContain('1');
    expect(formats).toContain('15');
    expect(formats).toContain('46');
    expect(formats).toContain('69');
    expect(formats).toContain('97.1');
  });

  it('resolves versions and their resource pack formats', () => {
    expect(formatPackFormat(getVersionById('1.21.4')?.resourcePackFormat ?? packFormat(-1))).toBe('46');
    expect(formatPackFormat(getVersionById('1.21.10')?.resourcePackFormat ?? packFormat(-1))).toBe('69');
    expect(getVersionById('1.20.1')?.label).toContain('1.20');
  });

  it('applies min/max format rules only for target format 69 and newer', () => {
    const for46 = getApplicableRules(packFormat(46)).map((rule) => rule.id);
    const for69 = getApplicableRules(packFormat(69)).map((rule) => rule.id);
    expect(for46).toContain('rpc:item-model/overrides');
    expect(for46).not.toContain('rpc:pack-mcmeta/min-max-format');
    expect(for69).toContain('rpc:pack-mcmeta/min-max-format');
  });

  it('keeps rule metadata in a stable, sorted order', () => {
    const ids = RULE_METADATA.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    const minMax = RULE_METADATA.find((rule) => rule.id === 'rpc:pack-mcmeta/min-max-format');
    expect(minMax).toBeDefined();
    expect(isRuleApplicable(minMax!, packFormat(68))).toBe(false);
    expect(isRuleApplicable(minMax!, packFormat(69))).toBe(true);
  });
});

describe('file name sanitization', () => {
  it('removes path separators and control characters', () => {
    expect(sanitizeFileNameBase('my:pack<>?.zip')).toBe('my_pack___.zip');
    expect(sanitizeFileNameBase('   ')).toBe('resourcepack');
    expect(containsControlCharacters('ok')).toBe(false);
    expect(containsControlCharacters('bad\u0001name')).toBe(true);
  });
});
