import { expect, test } from '@playwright/test';

test('settings remain usable on desktop and mobile', async({ page }, testInfo) => {
  await page.goto('./');
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Label decorations by skill name', { exact: true }).check();
  await page.reload();
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Label decorations by skill name', { exact: true })).toBeChecked();
  await expect(page.locator('.settings-equipment-title')).toHaveCount(6);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`settings-${width}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: 'Factory Reset', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
