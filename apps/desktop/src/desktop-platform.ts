import type { PlatformAdapter } from '@rpc/ui';
import { createWebPlatform } from '@rpc/ui';
import type { DesktopBridge } from '../electron/bridge-types';

declare global {
  interface Window {
    rpcDesktop?: DesktopBridge;
  }
}

function toArrayBuffer(data: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

/**
 * Desktop platform adapter. Every privileged operation goes through the
 * audited preload bridge; when the bridge is missing (for example when the
 * renderer is opened in a browser) it falls back to the web implementation.
 */
export function createDesktopPlatform(): PlatformAdapter {
  const bridge = window.rpcDesktop;
  if (!bridge) return createWebPlatform();

  return {
    kind: 'desktop',
    saveFile: ({ fileName, data, mimeType }) =>
      bridge.saveFile({ fileName, data, mimeType }),
    copyText: (text) => bridge.copyText(text),
    async pickZipFile() {
      const picked = await bridge.pickZipFile();
      return picked ? { name: picked.name, data: toArrayBuffer(picked.data) } : null;
    },
    async pickFolder() {
      const picked = await bridge.pickFolder();
      return picked
        ? {
            name: picked.name,
            entries: picked.entries.map((entry) => ({
              path: entry.path,
              data: toArrayBuffer(entry.data),
            })),
          }
        : null;
    },
  };
}
