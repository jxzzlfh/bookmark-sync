/**
 * E2E tests for the bookmark navigation website
 * Uses Playwright for browser automation
 */

import { test, expect } from '@playwright/test';

test.describe('Bookmark Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should display the header with logo and search', async ({ page }) => {
    // Check logo
    await expect(page.locator('text=Bookmark Navigator')).toBeVisible();
    
    // Check search bar
    await expect(page.locator('text=搜索书签...')).toBeVisible();
  });

  test('should display demo bookmarks on home page', async ({ page }) => {
    // Check for folder section
    await expect(page.locator('text=文件夹')).toBeVisible();
    
    // Check for some demo folders
    await expect(page.locator('text=工作')).toBeVisible();
    await expect(page.locator('text=学习资料')).toBeVisible();
    await expect(page.locator('text=娱乐')).toBeVisible();
  });

  test('should navigate to folder when clicked', async ({ page }) => {
    // Click on a folder
    await page.click('text=学习资料');
    
    // Should update breadcrumb
    await expect(page.locator('nav >> text=学习资料')).toBeVisible();
    
    // Should show folder contents
    await expect(page.locator('text=MDN Web Docs')).toBeVisible();
    await expect(page.locator('text=React Documentation')).toBeVisible();
  });

  test('should open search modal with keyboard shortcut', async ({ page }) => {
    // Press Cmd+K or Ctrl+K
    await page.keyboard.press('Control+k');
    
    // Search modal should be visible
    await expect(page.locator('input[placeholder="搜索书签..."]')).toBeVisible();
  });

  test('should search bookmarks', async ({ page }) => {
    // Open search
    await page.click('text=搜索书签...');
    
    // Type search query
    await page.fill('input[placeholder="搜索书签..."]', 'GitHub');
    
    // Should show search results
    await expect(page.locator('.search-result >> text=GitHub')).toBeVisible();
  });

  test('should close search modal with Escape', async ({ page }) => {
    // Open search
    await page.click('text=搜索书签...');
    await expect(page.locator('input[placeholder="搜索书签..."]')).toBeVisible();
    
    // Press Escape
    await page.keyboard.press('Escape');
    
    // Search modal should be hidden
    await expect(page.locator('input[placeholder="搜索书签..."]')).not.toBeVisible();
  });

  test('should navigate back to home via breadcrumb', async ({ page }) => {
    // Navigate to a folder
    await page.click('text=学习资料');
    await expect(page.locator('nav >> text=学习资料')).toBeVisible();
    
    // Click on home in breadcrumb
    await page.click('nav >> text=首页');
    
    // Should be back at home
    await expect(page.locator('h1 >> text=我的书签')).toBeVisible();
  });

  test('should toggle sidebar on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Sidebar should be hidden initially on mobile
    // (This depends on implementation - adjust as needed)
  });
});

test.describe('Bookmark Cards', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should display bookmark favicon', async ({ page }) => {
    // Navigate to a folder with bookmarks
    await page.click('text=工作');
    
    // Check that favicon images are loaded
    const favicon = page.locator('img[alt=""]').first();
    await expect(favicon).toBeVisible();
  });

  test('should open bookmark in new tab when clicked', async ({ page, context }) => {
    // Navigate to folder with links
    await page.click('text=工作');
    
    // Listen for new tab
    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      page.click('text=GitHub'),
    ]);
    
    // Verify new tab URL
    expect(newPage.url()).toContain('github.com');
  });
});

test.describe('Responsive Design', () => {
  test('should adapt layout for mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Header should still be visible
    await expect(page.locator('[data-testid="header"]')).toBeVisible();
    
    // Search should be accessible
    await expect(page.locator('text=搜索书签...')).toBeVisible();
  });

  test('should adapt layout for tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Content should be visible
    await expect(page.locator('text=我的书签')).toBeVisible();
  });

  test('should show full layout on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Sidebar should be visible
    await expect(page.locator('text=全部书签')).toBeVisible();
    
    // Content should be visible
    await expect(page.locator('text=我的书签')).toBeVisible();
  });
});
