import { test, expect } from "@playwright/test"

test.describe("Map Page", () => {
  test("loads map-first home page with AI workbench", async ({ page }) => {
    await page.goto("/workspace")
    await expect(page.getByRole("tab", { name: "规划" })).toBeVisible()
    await expect(page.getByRole("tab", { name: "地点" })).toBeVisible()
    await expect(page.getByRole("tab", { name: "照片" })).toBeVisible()
    await expect(page.getByRole("tab", { name: "收藏" })).toBeVisible()
    await expect(page.getByRole("textbox", { name: "AI 输入" })).toBeVisible()
    const settingsButton = page.getByRole("button", { name: "地图设置" })
    const mapError = page.getByText("地图加载失败，请检查高德 Key 或网络连接")
    await expect(settingsButton.or(mapError)).toBeVisible()
    await expect(page.getByRole("button", { name: "地图样式" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "定位到默认视图" })).toHaveCount(
      0
    )
  })

  test("keeps the workbench on the left side on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto("/workspace")
    const tablist = page.getByRole("tablist", { name: "AI 工作台工具" })
    await expect(tablist).toBeVisible()
    const box = await tablist.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeLessThan(80)
    expect(box!.y).toBeGreaterThan(600)
  })

  test("tool switching keeps composer text", async ({ page }) => {
    await page.goto("/workspace")
    const composer = page.getByRole("textbox", { name: "AI 输入" })
    await composer.fill("帮我把敦煌多留半天")
    await page.getByRole("tab", { name: "地点" }).click()
    await expect(page.getByText("地点工作区")).toBeVisible()
    await expect(composer).toHaveValue("帮我把敦煌多留半天")
  })

  test("/map preserves route query on redirect", async ({ page }) => {
    await page.goto("/map?route=preset-silk-road")
    await page.waitForURL(/\/workspace\?route=preset-silk-road/)
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
