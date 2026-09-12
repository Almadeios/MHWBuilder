import { expect, test } from '@playwright/test';

test('creates and removes unrestricted custom charms', async({ page }, testInfo) => {
  await page.goto('./');
  await page.getByRole('tab', { name: 'Charm Creator', exact: true }).click();
  await expect(page.getByText('Suggested Legal Charms')).toHaveCount(0);
  const add = page.getByRole('button', { name: 'Add Custom Talisman' });
  await expect(add).toBeDisabled();
  await page.getByLabel('Talisman Name').fill('My attack charm');
  await page.getByLabel('Skill 1', { exact: true }).click();
  await page.getByRole('option', { name: 'Attack Boost', exact: true }).click();
  await page.getByLabel('Skill 2', { exact: true }).click();
  await page.getByRole('option', { name: 'Handicraft', exact: true }).click();
  await page.getByLabel('Skill 3', { exact: true }).click();
  await page.getByRole('option', { name: 'Wide-Range', exact: true }).click();
  await page.getByLabel('Armor Slots', { exact: true }).click();
  await page.getByRole('option', { name: '1-0-0', exact: true }).click();
  await expect(add).toBeEnabled();
  await add.click();
  await expect(page.locator('.saved-charm-card')).toContainText('My attack charm');
  await expect(page.locator('.saved-charm-card')).toContainText('Handicraft 1 / Wide-Range 1');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`charms-${width}.png`), fullPage: true });
  }
  await page.reload();
  await page.getByRole('tab', { name: 'Charm Creator', exact: true }).click();
  await expect(page.locator('.saved-charm-card')).toContainText('My attack charm');
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.locator('.saved-charm-card')).toHaveCount(0);
});
