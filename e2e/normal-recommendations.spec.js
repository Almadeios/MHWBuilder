import { expect, test } from '@playwright/test';

test('offers Handicraft 1 through an alternative build search', async({ page }) => {
    test.setTimeout(150000);
    await page.addInitScript(() => {
        const fields = {
            skills: { 'Adrenaline Rush': 1, 'Critical Boost': 5, 'Burst': 1, 'Agitator': 5,
                'Weakness Exploit': 5, 'Antivirus': 3, 'Maximum Might': 3, 'Attack Boost': 5,
                "Gore Magala's Tyranny": 1, "Fulgur Anjanath's Will": 1, "Lord's Soul": 1 },
            weaponSlots: [3, 3, 3], weaponType: 'great_sword_hunting_horn',
            weaponBaseRaw: 100, weaponElementType: 'Water', weaponElementValue: 100,
            setSkillBonus: "Gore Magala's Tyranny", groupSkillBonus: "Lord's Soul"
        };
        Object.entries(fields).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)));
    });
    await page.goto('./');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeEnabled({ timeout: 45000 });
    await page.getByRole('button', { name: 'Explore Recommendations' }).click();
    const recommendation = page.locator('.more-results .skills-search-bubble').filter({ hasText: /^Handicraft\s*1$/ });
    await expect(recommendation).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Check further improvements' })).toBeVisible({ timeout: 15000 });
    await recommendation.click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('skills')).Handicraft)).toBe(1);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeEnabled({ timeout: 45000 });
    await expect(page.getByRole('row', { name: 'View armor set Unnamed Set' }).first()).toBeVisible();
});
