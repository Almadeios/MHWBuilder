import { expect, test } from '@playwright/test';

test('keeps search controls usable on desktop and mobile', async({ page }, testInfo) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Desired skills' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Weapon setup' })).toBeVisible();
  await page.getByLabel('Search Skills').fill('Agitator');
  await page.getByRole('button', { name: 'Agitator', exact: true }).click();
  await expect(page.getByText('1 selected', { exact: true })).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.getByLabel('Base Raw')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`search-${width}.png`), fullPage: true });
  }
  await page.getByLabel('Base Raw').fill('257');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText(/Results for Agitator/)).toBeVisible({ timeout: 30000 });
  await page.getByRole('row', { name: 'View armor set Unnamed Set' }).first().click();
  await expect(page.getByRole('heading', { name: 'Selected build' })).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.locator('.results').screenshot({ path: testInfo.outputPath(`results-${width}.png`) });
  }
  await page.getByRole('button', { name: 'Explore Recommendations' }).click();
  await expect(page.getByRole('heading', { name: 'Build improvements' })).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.locator('.more-results').screenshot({ path: testInfo.outputPath(`improvements-${width}.png`) });
  }
});
