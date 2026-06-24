import { test, expect } from '@playwright/test';

test.describe('Map Page', () => {
  test('loads home page with Silk Road card', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=丝绸之路')).toBeVisible();
    await expect(page.locator('text=7 个地点')).toBeVisible();
  });

  test('navigates to map and shows route', async ({ page }) => {
    await page.goto('/');
    await page.click('text=丝绸之路');
    await page.waitForURL(/\/map\?route=preset-silk-road/);

    // Sidebar should show points
    await expect(page.locator('text=1. 西安')).toBeVisible();
    await expect(page.locator('text=7. 乌鲁木齐')).toBeVisible();
  });

  test('debug page draws route from JSON', async ({ page }) => {
    await page.goto('/debug');

    // Clear default and enter custom coordinates
    await page.fill('textarea', `[
      {"name": "测试A", "lat": 39.9, "lng": 116.4},
      {"name": "测试B", "lat": 34.3, "lng": 108.9}
    ]`);

    await page.click('text=绘制轨迹');

    // Map should update (we can't easily inspect canvas, but no error means success)
    await expect(page.locator('text=JSON 解析错误')).not.toBeVisible();
  });

  test('debug page shows error for invalid JSON', async ({ page }) => {
    await page.goto('/debug');
    await page.fill('textarea', 'not valid json');
    await page.click('text=绘制轨迹');
    await expect(page.locator('text=JSON 解析错误')).toBeVisible();
  });
});
