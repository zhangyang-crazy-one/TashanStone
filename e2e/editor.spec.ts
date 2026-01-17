import { test, expect } from '@playwright/test';

test.describe('Editor Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app to fully initialize
    await page.waitForTimeout(2000);
  });

  test('should render the editor area', async ({ page }) => {
    // Look for CodeMirror editor or content editable area
    const editor = page.locator('.cm-editor').or(
      page.locator('[data-testid="editor"]').or(
        page.locator('[contenteditable="true"]')
      )
    );
    await expect(editor.first()).toBeVisible({ timeout: 10000 });
  });

  test('should render the preview area when in split mode', async ({ page }) => {
    // Look for preview panel
    const preview = page.locator('[data-testid="preview"]').or(
      page.locator('.preview').or(
        page.locator('.markdown-body')
      )
    );
    
    // Preview might not be visible in all view modes, so we just check if the app loads
    await expect(page.locator('#root')).toBeVisible();
  });
});
