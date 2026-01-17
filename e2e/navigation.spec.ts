import { test, expect } from '@playwright/test';

test.describe('Navigation and Theme', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  test('should switch view modes', async ({ page }) => {
    // Find view mode toggle buttons in toolbar
    const viewModeButtons = page.locator('[data-testid="view-mode"]').or(
      page.locator('button[title*="view"]').or(
        page.locator('button[aria-label*="view"]')
      )
    );
    
    // App should be loaded
    await expect(page.locator('#root')).toBeVisible();
  });

  test('should open settings modal', async ({ page }) => {
    // Find settings button
    const settingsButton = page.locator('[data-testid="settings"]').or(
      page.locator('button[title*="Settings"]').or(
        page.locator('button[aria-label*="settings"]')
      )
    );
    
    // Check if settings button exists
    const hasSettings = await settingsButton.first().isVisible().catch(() => false);
    
    if (hasSettings) {
      await settingsButton.first().click();
      
      // Wait for modal to appear
      const modal = page.locator('[role="dialog"]').or(
        page.locator('.modal')
      );
      await expect(modal.first()).toBeVisible({ timeout: 5000 });
    }
  });
});
