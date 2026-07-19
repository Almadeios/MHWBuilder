import { expect, test } from '@playwright/test';

const selectAgitator = async page => {
  await page.getByLabel('Search Skills').fill('Agitator');
  await page.getByRole('button', { name: 'Agitator', exact: true }).click();
};

test('runs an armor search through the module worker', async({ page }) => {
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));

  await page.goto('./');
  await selectAgitator(page);
  await page.getByRole('button', { name: 'Search', exact: true }).click();

  await expect(page.getByText(/Results for Agitator/)).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/Search failed:/)).toHaveCount(0);
  expect(runtimeErrors.filter(message => (/worker|import statement|module/i).test(message))).toEqual([]);
});

test('cancels an active armor search cleanly', async({ page }) => {
  await page.goto('./');
  await selectAgitator(page);

  const searchButton = page.getByRole('button', { name: 'Search', exact: true });
  await searchButton.click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  await expect(searchButton).toBeEnabled();
  await expect(page.getByText(/Search failed:/)).toHaveCount(0);
});

test('bounds targeted recommendation exploration', async({ page }) => {
  await page.goto('./');
  await selectAgitator(page);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText(/Results for Agitator/)).toBeVisible({ timeout: 30000 });

  const startedAt = Date.now();
  await page.getByRole('button', { name: 'Explore Recommendations' }).click();
  await expect(page.getByRole('status').filter({
    hasText: 'Checking bonus improvements'
  })).toBeVisible();
  const auditStatus = page.getByRole('status').filter({
    hasText: /Bonus check complete|bonus improvement.*found/
  });
  await expect(auditStatus).toBeVisible({ timeout: 70000 });
  await expect(auditStatus).not.toContainText(/Unresolved:.*Agitator/);
  await expect(page.getByText(/Structurally available bonus paths/)).toHaveCount(0);

  expect(Date.now() - startedAt).toBeLessThan(70000);
});

test('opens the discoverable builder help', async({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Open builder help' }).click();

  await expect(page.getByRole('dialog', { name: 'Builder Help' })).toBeVisible();
  await expect(page.getByRole('heading', {
    name: 'Skills, Set Bonuses, and Group Skills'
  })).toBeVisible();
});

test('opens a shared set as a preview without changing pages or auto-saving it', async({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('updatedIds', 'true');
    localStorage.setItem('savedSets', JSON.stringify([
      { id: 'legacy', name: 'Sazeeaid', armorNames: [], decoNames: [] },
      { id: 'keep', name: 'My Real Set', armorNames: [], decoNames: [], damageProfile: {} }
    ]));
  });
  await page.goto('./?set=851-148-827-869-1278-843_312-260&name=Shared%20Test');

  await expect(page.getByRole('dialog', { name: 'Shared Test' })).toBeVisible();
  await expect(page.locator('#simple-tab-0')).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('savedSets'))
    .map(set => set.name))).toEqual(['My Real Set']);
  await expect(page).toHaveURL('http://127.0.0.1:4180/MHWBuilder/');

  const pngDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save as PNG' }).click();
  expect((await pngDownload).suggestedFilename()).toBe('shared-test.png');

  await page.getByRole('button', { name: 'Save to My Sets' }).click();
  await expect(page.getByRole('dialog', { name: 'Shared Test' })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('savedSets'))
    .map(set => set.name))).toEqual(['My Real Set', 'Shared Test']);
});
