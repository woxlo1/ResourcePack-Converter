import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { createLegacyPackZip } from './helpers';

test.describe('web conversion workflow', () => {
  test('converts a legacy pack and downloads the ZIP and report', async ({ page }, testInfo) => {
    const zipPath = await createLegacyPackZip(testInfo.outputPath('legacy-pack.zip'));

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'ResourcePack Converter' })).toBeVisible();

    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page.locator('input[type="file"]').first().setInputFiles(zipPath);
    await expect(page.getByRole('heading', { name: 'Pack analysis' })).toBeVisible();
    await expect(page.getByText('1.20 – 1.20.1').first()).toBeVisible();

    await page.getByRole('button', { name: 'Continue to configure' }).first().click();
    await expect(page.getByText('Source format: 15')).toBeVisible();
    await expect(page.getByText('Conversion plan')).toBeVisible();

    await page.getByRole('button', { name: 'Start conversion' }).click();
    await expect(page.getByRole('heading', { name: 'Conversion result' })).toBeVisible({ timeout: 60_000 });

    const summary = await page.locator('body').innerText();
    expect(summary).toMatch(/TOTAL FILES\s+19/);
    expect(summary).toMatch(/SUCCESSFUL\s+17/);
    expect(summary).toMatch(/SKIPPED\s+2/);
    expect(summary).toMatch(/FAILURES\s+0/);

    const zipDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download converted pack' }).click();
    const zipDownload = await zipDownloadPromise;
    expect(zipDownload.suggestedFilename()).toMatch(/^legacy-pack-.+\.zip$/);
    const zipBytes = await readFile((await zipDownload.path()) as string);
    expect(zipBytes.subarray(0, 2).toString()).toBe('PK');

    const output = await JSZip.loadAsync(zipBytes);
    const itemDefinition = JSON.parse(
      await output.file('assets/minecraft/items/diamond_sword.json')!.async('string'),
    ) as { model: { type: string } };
    expect(itemDefinition.model.type).toBe('minecraft:range_dispatch');
    expect(output.file('assets/minecraft/textures/item/diamond_sword.png')).toBeTruthy();
    expect(output.file('assets/minecraft/textures/items/diamond_sword.png')).toBeNull();
    expect(output.file('notes/custom.txt')).toBeTruthy();

    const packMeta = JSON.parse(await output.file('pack.mcmeta')!.async('string')) as {
      pack: { min_format?: unknown; max_format?: unknown; pack_format?: unknown };
    };
    expect(packMeta.pack.min_format ?? packMeta.pack.pack_format).toBeDefined();
    expect(packMeta.pack.max_format).toBeDefined();

    const reportDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download report' }).click();
    const reportDownload = await reportDownloadPromise;
    expect(reportDownload.suggestedFilename()).toMatch(/-report\.html$/);
    const html = await readFile((await reportDownload.path()) as string, 'utf8');
    expect(html).toContain('ResourcePack Converter Report');
    expect(html).toContain('assets/minecraft/items/diamond_sword.json');
  });

  test('switches to Japanese and persists the locale across reloads', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Switch language' }).click();
    await expect(page.getByRole('heading', { name: 'リソースパックを安全に最新化。' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'リソースパックを安全に最新化。' })).toBeVisible();
    await expect(page.getByRole('button', { name: '言語を切り替え' })).toBeVisible();
  });
});
