import { describe, expect, it } from 'vitest';
import { packFormat } from '@rpc/core';
import { assertNoDuplicatePaths, isSafeArchivePath, normalizeArchivePath } from '@rpc/archive';

describe('safe archive paths', () => {
  it('normalizes harmless paths', () => {
    expect(normalizeArchivePath('assets/minecraft/textures/block/stone.png')).toBe(
      'assets/minecraft/textures/block/stone.png',
    );
    expect(normalizeArchivePath('assets\\minecraft\\pack.mcmeta')).toBe('assets/minecraft/pack.mcmeta');
    expect(normalizeArchivePath('./pack.mcmeta')).toBe('pack.mcmeta');
    expect(normalizeArchivePath('a//b/./c')).toBe('a/b/c');
  });

  it('rejects traversal and absolute paths', () => {
    expect(() => normalizeArchivePath('../evil.txt')).toThrow(/traversal/i);
    expect(() => normalizeArchivePath('a/../../evil.txt')).toThrow(/traversal/i);
    expect(() => normalizeArchivePath('/etc/passwd')).toThrow(/absolute/i);
    expect(() => normalizeArchivePath('C:\\Windows\\win.ini')).toThrow(/absolute/i);
    expect(() => normalizeArchivePath('//server/share/file')).toThrow(/absolute/i);
    expect(isSafeArchivePath('../evil.txt')).toBe(false);
  });

  it('rejects control characters, reserved names and trailing dots', () => {
    expect(() => normalizeArchivePath('bad\u0000name')).toThrow(/control|NUL/i);
    expect(() => normalizeArchivePath('bad\u0007name')).toThrow(/control/i);
    expect(() => normalizeArchivePath('CON')).toThrow(/reserved/i);
    expect(() => normalizeArchivePath('lpt1.txt')).toThrow(/reserved/i);
    expect(() => normalizeArchivePath('file.')).toThrow(/dot or space/i);
    expect(() => normalizeArchivePath('file ')).toThrow(/dot or space/i);
  });

  it('detects case-insensitive duplicates', () => {
    expect(() => assertNoDuplicatePaths(['assets/A.png', 'assets/a.png'])).toThrow(/duplicate/i);
    expect(() => assertNoDuplicatePaths(['assets/a.png', 'assets/b.png'])).not.toThrow();
  });
});

describe('pack format fixture sanity', () => {
  it('uses the expected item model threshold', () => {
    expect(packFormat(46).major).toBe(46);
  });
});
