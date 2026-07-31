import { test, expect, type Page } from "@playwright/test"

async function signIn(page: Page) {
  await page.goto("/")
  await page.getByRole("button", { name: "登录", exact: true }).click()
  await page.getByLabel("邮箱", { exact: true }).fill("user1@periplus.local")
  await page.getByLabel("密码", { exact: true }).fill("periplus123")
  await page.getByRole("button", { name: "登录", exact: true }).click()
  await page.waitForURL("**/workspace")
}

async function loadSilkRoadJourney(page: Page) {
  await signIn(page)
  await page.goto("/workspace?journey=preset-silk-road")
  await expect(page.getByRole("heading", { name: "丝绸之路" })).toBeVisible()
}

test.describe("Journey workspace", () => {
  test("renders the JourneyEvent overview after authentication", async ({
    page,
  }) => {
    await loadSilkRoadJourney(page)

    await expect(page.getByRole("tablist", { name: "行程范围" })).toBeVisible()
    await expect(page.getByRole("tab", { name: "总览" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    await expect(
      page.getByRole("button", { name: "查看城市 西安" })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "选择交通事件 交通" })
    ).toHaveCount(6)
  })

  test("keeps the workspace on the left side on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await loadSilkRoadJourney(page)

    const workspace = page.getByRole("region", { name: "旅行规划工作台" })
    await expect(workspace).toBeVisible()
    const box = await workspace.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeLessThan(80)
    expect(box!.width).toBeLessThan(900)
  })

  test("switches from SECTION overview to its child event scope", async ({
    page,
  }) => {
    await loadSilkRoadJourney(page)
    await page.getByRole("tab", { name: "西安", exact: true }).click()

    await expect(
      page.getByRole("tab", { name: "西安", exact: true })
    ).toHaveAttribute("aria-selected", "true")
    await expect(
      page.getByRole("button", { name: "选择事件 西安城墙" })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "交通事件 出租车" })
    ).toBeVisible()
  })

  test("/map preserves the journey query on redirect", async ({ page }) => {
    await signIn(page)
    await page.goto("/map?journey=preset-silk-road")
    await page.waitForURL(/\/workspace\?journey=preset-silk-road/)
    await expect(page.getByRole("heading", { name: "丝绸之路" })).toBeVisible()
  })

  test("debug page draws journey events from JSON", async ({ page }) => {
    await page.goto("/debug")
    await page.fill(
      "textarea",
      `[
      {"name": "测试A", "lat": 39.9, "lng": 116.4},
      {"name": "测试B", "lat": 34.3, "lng": 108.9}
    ]`
    )

    await page.click("text=绘制轨迹")
    await expect(page.locator("text=JSON 解析错误")).not.toBeVisible()
  })

  test("debug page shows error for invalid JSON", async ({ page }) => {
    await page.goto("/debug")
    await page.fill("textarea", "not valid json")
    await page.click("text=绘制轨迹")
    await expect(page.locator("text=JSON 解析错误")).toBeVisible()
  })
})
