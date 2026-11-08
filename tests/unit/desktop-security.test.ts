import { describe, expect, it } from 'vitest';
import {
  isAllowedClipboardText,
  isTrustedSenderUrl,
  parseSaveRequest,
  resolveRendererPath,
  sanitizeFileName,
} from '../../apps/desktop/electron/security';

describe('desktop IPC security', () => {
  it('reduces untrusted file names to a single safe segment', () => {
    expect(sanitizeFileName('pack.zip')).toBe('pack.zip');
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('C:\\Windows\\evil.zip')).toBe('evil.zip');
    expect(sanitizeFileName('name<>.json')).toBe('name__.json');
    expect(sanitizeFileName('trailing. ')).toBe('trailing');
    expect(sanitizeFileName('CON')).toBeNull();
    expect(sanitizeFileName('..')).toBeNull();
    expect(sanitizeFileName('')).toBeNull();
    expect(sanitizeFileName(42)).toBeNull();
  });

  it('validates save payloads and normalizes MIME types', () => {
    const data = new Uint8Array([1, 2, 3]);
    const parsed = parseSaveRequest({ fileName: 'pack.zip', data, mimeType: 'application/zip' });
    expect(parsed?.fileName).toBe('pack.zip');
    expect(parsed?.data).toBe(data);
    expect(parsed?.mimeType).toBe('application/zip');

    expect(parseSaveRequest({ fileName: '../x.zip', data })?.fileName).toBe('x.zip');
    expect(parseSaveRequest({ fileName: 'x.zip', data: new Uint8Array() })).toBeNull();
    expect(parseSaveRequest({ fileName: 'x.zip', data: 'not bytes' })).toBeNull();
    expect(parseSaveRequest(null)).toBeNull();

    const fallback = parseSaveRequest({ fileName: 'x.txt', data, mimeType: 'not a mime' });
    expect(fallback?.mimeType).toBe('application/octet-stream');
  });

  it('limits clipboard payloads', () => {
    expect(isAllowedClipboardText('report')).toBe(true);
    expect(isAllowedClipboardText('')).toBe(true);
    expect(isAllowedClipboardText(10)).toBe(false);
    expect(isAllowedClipboardText('x'.repeat(8 * 1024 * 1024 + 1))).toBe(false);
  });

  it('only trusts the packaged origin and the configured dev server', () => {
    expect(isTrustedSenderUrl('app://bundle/index.html')).toBe(true);
    expect(isTrustedSenderUrl('http://127.0.0.1:5173/', 'http://127.0.0.1:5173/')).toBe(true);
    expect(isTrustedSenderUrl('http://127.0.0.1:5173/assets/app.js', 'http://127.0.0.1:5173')).toBe(true);
    expect(isTrustedSenderUrl('http://127.0.0.1:5173/', undefined)).toBe(false);
    expect(isTrustedSenderUrl('https://evil.example/app://bundle/')).toBe(false);
    expect(isTrustedSenderUrl(null)).toBe(false);
  });

  it('resolves renderer paths without escaping the bundle directory', () => {
    expect(resolveRendererPath('C:/app/dist', '/index.html')).toBe('C:/app/dist/index.html');
    expect(resolveRendererPath('C:/app/dist', '/')).toBe('C:/app/dist/index.html');
    expect(resolveRendererPath('C:/app/dist', '/assets/index.js')).toBe('C:/app/dist/assets/index.js');
    expect(resolveRendererPath('C:/app/dist', '/../secret')).toBeNull();
    expect(resolveRendererPath('C:/app/dist', '/%2e%2e/secret')).toBeNull();
    expect(resolveRendererPath('C:/app/dist', '/..%5Csecret')).toBeNull();
    expect(resolveRendererPath('C:/app/dist', '/file.txt:stream')).toBeNull();
  });
});
