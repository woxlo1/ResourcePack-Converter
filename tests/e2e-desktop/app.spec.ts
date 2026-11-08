import { _electron as electron, expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLegacyPackZip } from '../e2e/helpers';

const appDir = join(process.cwd(), 'apps', 'desktop');

function launch() {
  return electron.launch({
    args: ['.', ...(process.env.CI ? ['--no-sandbox'] : [])],
    cwd: appDir,
  });
}

test('desktop app imports, converts and keeps the renderer console clean', async ({ browserName: _browserName }, testInfo) => {
  const zipPath = await createLegacyPackZip(testInfo.outputPath('legacy-pack.zip'));
  const app = await launch();
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await expect(page.getByRole('heading', { name: 'ResourcePack Converter' })).toBeVisible();
    expect(page.url()).toMatch(/^app:\/\/bundle\//);
    expect(await page.evaluate(() => window.rpcDesktop?.kind)).toBe('desktop');

    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page.locator('input[type="file"]').first().setInputFiles(zipPath);
    await expect(page.getByRole('heading', { name: 'Pack analysis' })).toBeVisible();

    await page.getByRole('button', { name: 'Continue to configure' }).first().click();
    await expect(page.getByText('Source format: 15')).toBeVisible();
    await page.getByRole('button', { name: 'Start conversion' }).click();
    await expect(page.getByRole('heading', { name: 'Conversion result' })).toBeVisible({ timeout: 60_000 });

    const summary = await page.locator('body').innerText();
    expect(summary).toMatch(/TOTAL FILES\s+19/);
    expect(summary).toMatch(/SUCCESSFUL\s+17/);
    expect(summary).toMatch(/SKIPPED\s+2/);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test('native bridge saves files, copies text and picks archives', async ({ browserName: _browserName }, testInfo) => {
  const savePath = testInfo.outputPath('saved.zip');
  const zipPath = await createLegacyPackZip(testInfo.outputPath('picked.zip'));
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: 'ResourcePack Converter' })).toBeVisible();

    await app.evaluate(
      ({ dialog }, paths) => {
        const stubbed = dialog as unknown as {
          showSaveDialog: (...args: unknown[]) => Promise<{ canceled: boolean; filePath: string }>;
          showOpenDialog: (...args: unknown[]) => Promise<{ canceled: boolean; filePaths: string[] }>;
        };
        stubbed.showSaveDialog = async (...args: unknown[]) => {
          const options = args.length > 1 ? args[1] : args[0];
          (globalThis as { __rpcDefaultPath?: string }).__rpcDefaultPath = (
            options as { defaultPath?: string }
          ).defaultPath;
          return { canceled: false, filePath: paths.save };
        };
        stubbed.showOpenDialog = async () => ({ canceled: false, filePaths: [paths.zip] });
      },
      { save: savePath, zip: zipPath },
    );

    const saved = await page.evaluate(async () => {
      const data = new Uint8Array([80, 75, 3, 4, 9, 9]);
      return window.rpcDesktop?.saveFile({ fileName: '../escape.zip', data, mimeType: 'application/zip' });
    });
    expect(saved).toBe(true);
    const savedBytes = new Uint8Array(await readFile(savePath));
    expect(Array.from(savedBytes)).toEqual([80, 75, 3, 4, 9, 9]);

    const defaultPath = await app.evaluate(
      () => (globalThis as { __rpcDefaultPath?: string }).__rpcDefaultPath,
    );
    expect(defaultPath?.replace(/\\/g, '/')).toMatch(/\/escape\.zip$/);
    expect(defaultPath?.replace(/\\/g, '/')).not.toContain('../');

    const copied = await page.evaluate(() => window.rpcDesktop?.copyText('bridge test'));
    expect(copied).toBe(true);
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('bridge test');

    const picked = await page.evaluate(async () => {
      const result = await window.rpcDesktop?.pickZipFile();
      return result ? { name: result.name, size: result.data.byteLength } : null;
    });
    expect(picked?.name).toBe('picked.zip');
    expect(picked?.size).toBeGreaterThan(0);
  } finally {
    await app.close();
  }
});
