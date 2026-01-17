import { test, expect } from '@playwright/test';

test.describe('TashanStone App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load the application', async ({ page }) => {
    // Wait for app to fully load
    await expect(page.locator('body')).toBeVisible();
    
    // Check that the main container is rendered
    await expect(page.locator('#root')).toBeVisible();
  });

  test('should display the toolbar', async ({ page }) => {
    // Wait for toolbar to be visible
    const toolbar = page.locator('[data-testid="toolbar"]').or(
      page.locator('.toolbar').or(
        page.locator('header').first()
      )
    );
    await expect(toolbar).toBeVisible({ timeout: 10000 });
  });

  test('should display the sidebar', async ({ page }) => {
    // Wait for sidebar to be visible
    const sidebar = page.locator('[data-testid="sidebar"]').or(
      page.locator('.sidebar').or(
        page.locator('aside').first()
      )
    );
    await expect(sidebar).toBeVisible({ timeout: 10000 });
  });
});
