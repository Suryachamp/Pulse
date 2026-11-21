import { expect, test } from '@playwright/test';
import { registerWorkspace } from './helpers';

test('mobile navigation drawer works and pages fit the screen', async ({ page }) => {
  await registerWorkspace(page);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Customers' }).click();
  await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
});
