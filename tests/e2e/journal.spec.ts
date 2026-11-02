import { randomUUID } from "node:crypto"
import { expect, test } from "@playwright/test"
import type { JourneySnapshot } from "../../modules/data-model/contracts"

test("normal accounts save photos, reopen content and collaborate without sharing edit rights", async ({
  page,
  browser,
  baseURL,
  isMobile,
}) => {
  const id = randomUUID()
  const password = `ci-${randomUUID()}`
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  // Keep sequential viewport runs outside the production sign-up rate window.
  if (isMobile) await page.waitForTimeout(11_000)
  const ready = await page.request.get("/api/health")
  expect(ready.status()).toBe(200)
  expect((await ready.json()).status).toBe("ready")
  if (process.env.CI_IMAGE_SHA)
    expect((await ready.json()).version).toBe(process.env.CI_IMAGE_SHA)
  expect((await page.request.get("/api/journeys")).status()).toBe(401)

  await page.goto("/")
  await page.getByRole("button", { name: "注册", exact: true }).click()
  await page.getByLabel("名称", { exact: true }).fill("CI 作者")
  await page
    .getByLabel("邮箱", { exact: true })
    .fill(`owner-${id}@example.test`)
  await page.getByLabel("密码", { exact: true }).fill(password)
  await page.getByRole("button", { name: "注册", exact: true }).click()
  await page.getByRole("button", { name: "新建游记", exact: true }).click()
  await page.getByLabel("旅程名称", { exact: true }).fill("CI 真实记录")
  await page.getByRole("button", { name: "开始记录", exact: true }).click()
  await expect(page).toHaveURL(/\/journeys\/[^/]+$/)
  const journeyId = new URL(page.url()).pathname.split("/").at(-1)!
  const read = async (): Promise<JourneySnapshot> => {
    const response = await page.request.get(`/api/journeys/${journeyId}`)
    expect(response.status()).toBe(200)
    return response.json()
  }
  await page.getByRole("button", { name: "添加记录", exact: true }).click()
  const form = page.locator(".journal-composer")
  await form
    .getByRole("textbox", { name: "记录标题", exact: true })
    .fill("湖边的下午")
  await form
    .getByRole("textbox", { name: "记录正文", exact: true })
    .fill("保存后刷新，文字和照片仍属于同一条记录。")
  await form.getByLabel("开始时间", { exact: true }).fill("14:30")
  await form.locator('input[type="file"]').setInputFiles({
    name: "lake.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=",
      "base64"
    ),
  })
  await form.getByRole("button", { name: "保存", exact: true }).click()
  await expect(form.getByRole("status").last()).toHaveText("已保存")
  await expect.poll(async () => (await read()).events[0]?.photos.length).toBe(1)
  await expect(form.getByText("上传中…", { exact: true })).toHaveCount(0)
  await form.getByRole("button", { name: "取消", exact: true }).click()
  await expect(form).toHaveCount(0)
  const saved = await read()
  const event = saved.events[0]!
  expect(event.time).toBe("14:30")
  expect(event.startAt).toBeTruthy()
  expect(event.source.name).toBe("CI 作者")
  const photo = event.photos[0]!
  expect(photo.source.name).toBe("CI 作者")
  expect((await page.request.get(photo.url)).status()).toBe(200)
  await page.reload()
  const card = page.locator(`[data-record-id="${event.id}"]`)
  await expect(card).toContainText("湖边的下午")
  expect((await read()).events[0]).toMatchObject({
    id: event.id,
    body: event.body,
    startAt: event.startAt,
    photos: event.photos,
  })

  const friend = await browser.newContext({ baseURL })
  try {
    const signup = await friend.request.post("/api/auth/sign-up/email", {
      headers: { Origin: baseURL! },
      data: { name: "CI 同行者", email: `friend-${id}@example.test`, password },
    })
    expect(signup.ok()).toBeTruthy()
    expect(
      (await friend.request.get(`/api/journeys/${journeyId}`)).status()
    ).toBe(404)
    expect((await friend.request.get(photo.url)).status()).toBe(403)
    const invite = await page.request.post(
      `/api/journeys/${journeyId}/invitations`,
      { data: {} }
    )
    expect(invite.ok()).toBeTruthy()
    const url = new URL((await invite.json()).url)
    const joined = await friend.newPage()
    await joined.goto(url.pathname)
    await joined.getByRole("button", { name: "加入旅程", exact: true }).click()
    await expect(joined).toHaveURL(new RegExp(`/journeys/${journeyId}$`))
    const current: JourneySnapshot = await (
      await friend.request.get(`/api/journeys/${journeyId}`)
    ).json()
    expect(current.role).toBe("MEMBER")
    expect(current.events[0]!.canEdit).toBe(false)
    expect((await friend.request.get(photo.url)).status()).toBe(200)
    const denied = await friend.request.post(
      `/api/journeys/${journeyId}/commands`,
      {
        data: {
          expectedRevision: current.revision,
          idempotencyKey: randomUUID(),
          command: {
            name: "event.update",
            eventId: event.id,
            patch: { body: "不应保存" },
          },
        },
      }
    )
    expect(denied.status()).toBe(403)
    const add = await friend.request.post(
      `/api/journeys/${journeyId}/commands`,
      {
        data: {
          expectedRevision: current.revision,
          idempotencyKey: randomUUID(),
          command: {
            name: "event.add",
            afterEventId: event.id,
            content: {
              title: "同行者补记",
              body: "各自保留署名。",
              date: event.date,
              category: "VISIT",
            },
          },
        },
      }
    )
    expect(add.ok()).toBeTruthy()
    await page.reload()
    const final = await read()
    expect(final.events[0]!.body).toBe(event.body)
    expect(final.events[0]!.photos).toEqual(event.photos)
    expect(final.events[1]!.source.name).toBe("CI 同行者")
  } finally {
    await friend.close()
  }
  await page.getByRole("button", { name: "时间轴", exact: true }).click()
  const selected = page.locator(".journal-timeline-item[aria-current]")
  await selected.focus()
  await page.keyboard.press("Home")
  await expect(selected).toHaveAttribute("id", `timeline-${event.id}`)
  await selected.click()
  if (isMobile) {
    await page
      .getByRole("button", { name: "全屏阅读事件", exact: true })
      .click()
    await expect(page.locator(".journal-mobile-curtain")).toHaveAttribute(
      "data-fullscreen",
      "true"
    )
    await expect(page.locator(".journal-curtain-detail")).toContainText(
      event.body
    )
  }
  expect(errors).toEqual([])
})
