import { test, expect } from '@playwright/test';

test.describe('Desktop Smoke', () => {
  test('should render core layout', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#root', { state: 'attached' });

    await expect(page.locator('#root')).toBeVisible();

    const toolbar = page.locator('[data-testid="toolbar"]').or(
      page.locator('header').first()
    );
    await expect(toolbar).toBeVisible({ timeout: 30000 });

    const sidebar = page.locator('[data-testid="sidebar"]').or(
      page.locator('aside').first()
    );
    await expect(sidebar).toBeVisible({ timeout: 30000 });
  });
});
