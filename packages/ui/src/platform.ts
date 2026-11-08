export interface SaveFileOptions {
  fileName: string;
  data: Uint8Array;
  mimeType: string;
}

export interface PlatformAdapter {
  kind: 'web' | 'desktop';
  saveFile(options: SaveFileOptions): Promise<boolean>;
  copyText(text: string): Promise<boolean>;
}

function fallbackCopy(text: string): boolean {
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    return copied;
  } catch {
    return false;
  }
}

/** Browser platform adapter: downloads files and uses the Clipboard API. */
export function createWebPlatform(): PlatformAdapter {
  return {
    kind: 'web',
    async saveFile({ fileName, data, mimeType }: SaveFileOptions): Promise<boolean> {
      const blob = new Blob([data as unknown as BlobPart], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2_000);
      return true;
    },
    async copyText(text: string): Promise<boolean> {
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch {
          return fallbackCopy(text);
        }
      }
      return fallbackCopy(text);
    },
  };
}
