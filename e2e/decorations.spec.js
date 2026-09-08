import { expect, test } from '@playwright/test';

test('filters and persists decoration inventory on desktop and mobile', async({ page }, testInfo) => {
  await page.goto('./');
  await page.getByRole('tab', { name: 'Decorations', exact: true }).click();
  const search = page.getByLabel('Search decorations by name or skill');
  await search.fill('Attack Boost');
  await expect(page.locator('.decoration-row')).toHaveCount(9);
  await page.getByLabel('Filter slot size').click();
  await page.getByRole('option', { name: 'Level 2', exact: true }).click();
  await expect(page.locator('.decoration-row')).toHaveCount(1);
  const quantity = page.getByLabel('Attack Jewel II 2 owned quantity');
  await quantity.fill('7');
  await page.reload();
  await page.getByRole('tab', { name: 'Decorations', exact: true }).click();
  await search.fill('Attack Jewel II 2');
  await expect(quantity).toHaveValue('7');
  await quantity.fill('0');
  await expect(page.getByText('Not owned', { exact: true })).toBeVisible();
  await page.getByLabel('Owned only').check();
  await expect(page.getByText('No decorations match your filters.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).first().click();
  await page.getByLabel('Filter slot type').click();
  await page.getByRole('option', { name: 'Armor', exact: true }).click();
  await expect(page.locator('.decoration-slot-weapon')).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`decorations-${width}.png`), fullPage: true });
  }
  await page.locator('.custom-decoration-panel summary').click();
  await page.getByLabel('Name', { exact: true }).fill('Test custom jewel');
  await page.getByLabel('Skill', { exact: true }).click();
  await page.getByRole('option', { name: 'Attack Boost', exact: true }).click();
  await page.getByRole('button', { name: 'Add Custom Deco' }).click();
  await search.fill('Test custom jewel');
  await expect(page.getByLabel('Test custom jewel owned quantity')).toHaveValue('99');
  await page.getByRole('button', { name: 'Empty Inventory', exact: true }).click();
  await expect(page.getByLabel('Test custom jewel owned quantity')).toHaveValue('0');
  await page.getByRole('button', { name: 'Fill Inventory', exact: true }).click();
  await expect(page.getByLabel('Test custom jewel owned quantity')).toHaveValue('99');
  await page.getByRole('button', { name: 'Delete Test custom jewel', exact: true }).click();
  await expect(page.getByLabel('Test custom jewel owned quantity')).toHaveCount(0);
});
