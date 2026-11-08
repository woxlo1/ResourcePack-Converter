/** Payloads exchanged between the Electron preload script and the renderer. */

export interface DesktopSaveFileRequest {
  fileName: string;
  data: Uint8Array;
  mimeType: string;
}

export interface DesktopPickedZip {
  name: string;
  data: Uint8Array;
}

export interface DesktopPickedFolderEntry {
  path: string;
  data: Uint8Array;
}

export interface DesktopPickedFolder {
  name: string;
  entries: DesktopPickedFolderEntry[];
}

/** The minimal, audited API exposed on `window.rpcDesktop`. */
export interface DesktopBridge {
  readonly kind: 'desktop';
  saveFile(request: DesktopSaveFileRequest): Promise<boolean>;
  copyText(text: string): Promise<boolean>;
  pickZipFile(): Promise<DesktopPickedZip | null>;
  pickFolder(): Promise<DesktopPickedFolder | null>;
}
