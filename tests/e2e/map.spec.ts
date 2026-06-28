import { test, expect } from "@playwright/test"

test.describe("Map Page", () => {
  test("loads map-first home page with left workbench", async ({ page }) => {
    await page.goto("/")
    await expect(
      page.getByRole("searchbox", { name: "搜索地点、路线、标签或备注" })
    ).toBeVisible()
    await expect(page.getByRole("tab", { name: "探索" })).toBeVisible()
    await expect(page.getByRole("tab", { name: "计划" })).toBeVisible()
    await expect(page.getByRole("tab", { name: "收藏" })).toBeVisible()
    await expect(page.getByRole("button", { name: "地图样式" })).toBeDisabled()
  })

  test("keeps the workbench on the left side on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto("/")
    const tablist = page.getByRole("tablist", { name: "Periplus 工作台" })
    await expect(tablist).toBeVisible()
    const box = await tablist.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeLessThan(80)
    expect(box!.y).toBeLessThan(120)
  })

  test("/map preserves route query on redirect", async ({ page }) => {
    await page.goto("/map?route=preset-silk-road")
    await page.waitForURL(/\/\?route=preset-silk-road/)
    await expect(page.getByText("丝绸之路")).toBeVisible()
  })

  test("debug page draws route from JSON", async ({ page }) => {
    await page.goto("/debug")

    // Clear default and enter custom coordinates
    await page.fill(
      "textarea",
      `[
      {"name": "测试A", "lat": 39.9, "lng": 116.4},
      {"name": "测试B", "lat": 34.3, "lng": 108.9}
    ]`
    )

    await page.click("text=绘制轨迹")

    // Map should update (we can't easily inspect canvas, but no error means success)
    await expect(page.locator("text=JSON 解析错误")).not.toBeVisible()
  })

  test("debug page shows error for invalid JSON", async ({ page }) => {
    await page.goto("/debug")
    await page.fill("textarea", "not valid json")
    await page.click("text=绘制轨迹")
    await expect(page.locator("text=JSON 解析错误")).toBeVisible()
  })
})
