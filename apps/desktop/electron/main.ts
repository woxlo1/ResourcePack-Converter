import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  net,
  protocol,
  session,
  shell,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from 'electron';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, normalize, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  isAllowedClipboardText,
  isTrustedSenderUrl,
  MAX_PICK_FILES,
  MAX_PICK_FILE_BYTES,
  MAX_PICK_TOTAL_BYTES,
  parseSaveRequest,
  resolveRendererPath,
} from './security.js';

const APP_SCHEME = 'app';
const APP_HOST = 'bundle';
const devServerUrl = process.env.RPC_DEV_SERVER_URL;
const rendererDir = join(__dirname, '..', 'dist');

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

function isTrustedEvent(event: IpcMainInvokeEvent): boolean {
  return isTrustedSenderUrl(event.senderFrame?.url ?? event.sender.getURL(), devServerUrl);
}

function windowFor(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

function saveFilters(fileName: string): SaveDialogOptions['filters'] {
  switch (extname(fileName).toLowerCase()) {
    case '.zip':
      return [{ name: 'ZIP archive', extensions: ['zip'] }];
    case '.json':
      return [{ name: 'JSON', extensions: ['json'] }];
    case '.html':
      return [{ name: 'HTML', extensions: ['html', 'htm'] }];
    case '.txt':
      return [{ name: 'Text', extensions: ['txt'] }];
    case '.csv':
      return [{ name: 'CSV', extensions: ['csv'] }];
    default:
      return [{ name: 'All files', extensions: ['*'] }];
  }
}

async function handleSaveFile(event: IpcMainInvokeEvent, input: unknown): Promise<boolean> {
  if (!isTrustedEvent(event)) return false;
  const request = parseSaveRequest(input);
  if (!request) return false;

  const options: SaveDialogOptions = {
    title: 'Save file',
    defaultPath: join(app.getPath('downloads'), request.fileName),
    filters: saveFilters(request.fileName),
  };
  const win = windowFor(event);
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return false;

  await writeFile(result.filePath, Buffer.from(request.data));
  return true;
}

function handleCopyText(event: IpcMainInvokeEvent, text: unknown): boolean {
  if (!isTrustedEvent(event) || !isAllowedClipboardText(text)) return false;
  clipboard.writeText(text);
  return true;
}

function zipDialogOptions(): OpenDialogOptions {
  return {
    title: 'Choose a resource pack ZIP',
    properties: ['openFile'],
    filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
  };
}

async function handlePickZip(event: IpcMainInvokeEvent): Promise<{ name: string; data: Uint8Array } | null> {
  if (!isTrustedEvent(event)) return null;
  const win = windowFor(event);
  const result = win
    ? await dialog.showOpenDialog(win, zipDialogOptions())
    : await dialog.showOpenDialog(zipDialogOptions());
  const filePath = result.filePaths[0];
  if (result.canceled || !filePath) return null;

  const info = await stat(filePath);
  if (!info.isFile() || info.size <= 0 || info.size > MAX_PICK_FILE_BYTES) {
    throw new Error('The selected ZIP is empty or larger than the 512 MB import limit.');
  }
  const data = await readFile(filePath);
  return { name: basename(filePath), data: new Uint8Array(data) };
}

async function handlePickFolder(
  event: IpcMainInvokeEvent,
): Promise<{ name: string; entries: { path: string; data: Uint8Array }[] } | null> {
  if (!isTrustedEvent(event)) return null;
  const win = windowFor(event);
  const options: OpenDialogOptions = {
    title: 'Choose a resource pack folder',
    properties: ['openDirectory'],
  };
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options);
  const root = result.filePaths[0];
  if (result.canceled || !root) return null;

  const entries: { path: string; data: Uint8Array }[] = [];
  let totalBytes = 0;

  const walk = async (directory: string, prefix: string): Promise<void> => {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      // Symlinks are skipped so a picker can never read outside the chosen root.
      if (child.isSymbolicLink()) continue;
      const fullPath = join(directory, child.name);
      const relativePath = prefix ? `${prefix}/${child.name}` : child.name;
      if (child.isDirectory()) {
        await walk(fullPath, relativePath);
        continue;
      }
      if (!child.isFile()) continue;

      if (entries.length >= MAX_PICK_FILES) {
        throw new Error(`The selected folder contains more than ${MAX_PICK_FILES} files.`);
      }
      const info = await stat(fullPath);
      totalBytes += info.size;
      if (totalBytes > MAX_PICK_TOTAL_BYTES) {
        throw new Error('The selected folder is larger than the 512 MB import limit.');
      }
      entries.push({ path: relativePath, data: new Uint8Array(await readFile(fullPath)) });
    }
  };

  await walk(root, '');
  if (entries.length === 0) throw new Error('The selected folder does not contain any files.');
  return { name: basename(root), entries };
}

async function registerAppProtocol(): Promise<void> {
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== APP_HOST) return new Response('Not found', { status: 404 });

    const resolved = resolveRendererPath(rendererDir, url.pathname);
    if (!resolved) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(normalize(resolved)).toString());
  });
}

function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [{ role: 'quit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        ...(devServerUrl
          ? ([{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }] as MenuItemConstructorOptions[])
          : []),
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Project website',
          click: () => {
            void shell.openExternal('https://github.com/woxlo1/ResourcePack-Converter');
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#0f1216',
    title: 'ResourcePack Converter',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedSenderUrl(url, devServerUrl)) event.preventDefault();
  });

  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadURL(`${APP_SCHEME}://${APP_HOST}/index.html`);
  }
  return win;
}

app.setAppUserModelId('com.woxlo.resourcepackconverter');

app.whenReady().then(async () => {
  await registerAppProtocol();
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);

  ipcMain.handle('rpc:save-file', handleSaveFile);
  ipcMain.handle('rpc:copy-text', handleCopyText);
  ipcMain.handle('rpc:pick-zip', handlePickZip);
  ipcMain.handle('rpc:pick-folder', handlePickFolder);

  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
