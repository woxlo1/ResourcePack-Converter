import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopBridge } from './bridge-types.js';

const bridge: DesktopBridge = {
  kind: 'desktop',
  saveFile: (request) => ipcRenderer.invoke('rpc:save-file', request) as Promise<boolean>,
  copyText: (text) => ipcRenderer.invoke('rpc:copy-text', text) as Promise<boolean>,
  pickZipFile: () => ipcRenderer.invoke('rpc:pick-zip'),
  pickFolder: () => ipcRenderer.invoke('rpc:pick-folder'),
};

contextBridge.exposeInMainWorld('rpcDesktop', bridge);
