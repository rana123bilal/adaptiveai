import { expect, test } from '@playwright/test';

test('the frontend reaches the real local Worker', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Better answers.');
  await page.getByRole('button', { name: 'Check API connection' }).click();
  await expect(page.getByRole('status')).toHaveText('API connected. Gemini and Supabase are not connected yet.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('a network failure offers a retry instead of a false success', async ({ page }) => {
  await page.route('**/api/v1/health', (route) => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: 'Check API connection' }).click();
  await expect(page.getByRole('status')).toContainText('API unavailable.');
  await expect(page.getByRole('button', { name: 'Check API connection' })).toBeEnabled();
});
