import { randomUUID } from "node:crypto"
import { expect, test, type Page } from "@playwright/test"
import type { JourneySnapshot } from "../../modules/data-model/contracts"

const image = {
  name: "retained.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=",
    "base64"
  ),
}
async function crossBreakpoint(page: Page) {
  const viewport = page.viewportSize()!
  await page.setViewportSize({
    width: viewport.width < 768 ? 1440 : 390,
    height: 900,
  })
  await expect(
    page.getByRole("textbox", { name: "记录正文", exact: true })
  ).toHaveValue("跨断点保留的输入")
  await expect(
    page.getByLabel("移除待上传照片 retained.png", { exact: true })
  ).toBeVisible()
  await page.setViewportSize(viewport)
  await expect(
    page.getByRole("textbox", { name: "记录正文", exact: true })
  ).toHaveValue("跨断点保留的输入")
}

test("keeps editing state across breakpoints and confirms a lost response without another update", async ({
  page,
  baseURL,
}) => {
  await page.waitForTimeout(11_000)
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: baseURL! },
    data: {
      name: "恢复验证",
      email: `recovery-${randomUUID()}@example.test`,
      password: randomUUID(),
    },
  })
  expect(signup.ok()).toBeTruthy()
  const created = await page.request.post("/api/journeys", {
    data: { title: "编辑恢复验证", idempotencyKey: randomUUID() },
  })
  let journey: JourneySnapshot = (await created.json()).journey
  const commands = `/api/journeys/${journey.id}/commands`
  const added = await page.request.post(commands, {
    data: {
      expectedRevision: journey.revision,
      idempotencyKey: randomUUID(),
      command: {
        name: "event.add",
        afterEventId: null,
        content: {
          title: "湖边散步",
          body: "原文",
          category: "VISIT",
          date: "2026-11-14",
        },
      },
    },
  })
  journey = (await added.json()).journey
  const read = async (): Promise<JourneySnapshot> =>
    (await page.request.get(`/api/journeys/${journey.id}`)).json()
  await page.goto(`/journeys/${journey.id}`)
  await page.getByRole("button", { name: "编辑湖边散步", exact: true }).click()
  await page
    .getByRole("textbox", { name: "记录正文", exact: true })
    .fill("跨断点保留的输入")
  await page.locator(".journal-composer input[type=file]").setInputFiles(image)
  await crossBreakpoint(page)
  await page.getByLabel("移除待上传照片 retained.png", { exact: true }).click()
  const requests: unknown[] = []
  await page.route(`**${commands}`, async (route) => {
    requests.push(route.request().postDataJSON())
    if (requests.length === 1) {
      await route.fetch()
      await route.abort("failed")
    } else await route.continue()
  })
  await page.getByRole("button", { name: "保存", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "确认上次保存", exact: true })
  ).toBeVisible()
  await expect
    .poll(async () => (await read()).revision)
    .toBe(journey.revision + 1)
  await page.getByRole("button", { name: "确认上次保存", exact: true }).click()
  await expect(page.getByText("已确认保存", { exact: true })).toBeVisible()
  expect(requests).toHaveLength(2)
  expect(requests[1]).toEqual(requests[0])
  expect((await read()).revision).toBe(journey.revision + 1)
  await page.getByRole("button", { name: "取消", exact: true }).click()

  await page.getByRole("button", { name: "添加记录", exact: true }).click()
  await page
    .getByRole("textbox", { name: "记录标题", exact: true })
    .fill("保留的本机草稿")
  await page
    .getByRole("textbox", { name: "记录正文", exact: true })
    .fill("跨断点保留的输入")
  await page.locator(".journal-composer input[type=file]").setInputFiles(image)
  await crossBreakpoint(page)
  await page.getByRole("button", { name: "返回", exact: true }).click()
  await page.goto("/drafts")
  await expect(
    page.getByRole("button", { name: /保留的本机草稿/ })
  ).toHaveCount(1)
  await page.getByRole("button", { name: /保留的本机草稿/ }).click()
  await expect(
    page.getByRole("textbox", { name: "记录正文", exact: true })
  ).toHaveValue("跨断点保留的输入")
  await expect(
    page.getByLabel("移除待上传照片 retained.png", { exact: true })
  ).toBeVisible()

  await page.goto(`/journeys/${journey.id}`)
  await page.getByRole("button", { name: "旅程操作", exact: true }).click()
  await page.getByRole("button", { name: "拍账单", exact: true }).click()
  await page.locator("input[type=file]").last().setInputFiles(image)
  await page.route("**/api/receipts/extract", (route) =>
    route.fulfill({ status: 503, json: { error: "识别暂不可用" } })
  )
  await page.getByRole("button", { name: "识别", exact: true }).click()
  await page.getByLabel("店名", { exact: true }).fill("断点后的核对商家")
  const viewport = page.viewportSize()!
  await page.setViewportSize({
    width: viewport.width < 768 ? 1440 : 390,
    height: 900,
  })
  await expect(page.getByLabel("店名", { exact: true })).toHaveValue(
    "断点后的核对商家"
  )
  await expect(
    page.getByRole("img", { name: "账单原图", exact: true })
  ).toBeVisible()
  await page.setViewportSize(viewport)
  await expect(page.getByLabel("店名", { exact: true })).toHaveValue(
    "断点后的核对商家"
  )
})
