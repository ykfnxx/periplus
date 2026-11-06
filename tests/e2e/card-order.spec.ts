import { randomUUID } from "node:crypto"
import { expect, test, type Page } from "@playwright/test"
import type { JourneySnapshot } from "../../modules/data-model/contracts"

async function journeyFixture(page: Page, origin: string) {
  // Keep normal account creation outside the production sign-up rate window.
  await page.waitForTimeout(11_000)
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: origin },
    data: {
      name: "排序作者",
      email: `order-${randomUUID()}@example.test`,
      password: randomUUID(),
    },
  })
  expect(signup.status()).toBe(200)
  const created = await page.request.post("/api/journeys", {
    data: { title: "卡片排序验证", idempotencyKey: randomUUID() },
  })
  expect(created.ok()).toBeTruthy()
  let journey: JourneySnapshot = (await created.json()).journey
  for (const [category, title, date] of [
    ["VISIT", "湖边散步", "2026-10-24"],
    ["MEAL", "一杯热茶", "2026-10-25"],
    ["STAY", "山里的住处", "2026-10-23"],
    ["TRANSIT", "乘车回家", "2026-10-24"],
  ]) {
    const saved = await page.request.post(
      `/api/journeys/${journey.id}/commands`,
      {
        data: {
          expectedRevision: journey.revision,
          idempotencyKey: randomUUID(),
          command: {
            name: "event.add",
            afterEventId: journey.events.at(-1)?.id ?? null,
            content: {
              category,
              title,
              date,
              body: "拖动后仍然保留这段正文。",
              ...(category === "TRANSIT"
                ? {
                    transit: {
                      fromName: "杭州",
                      toName: "上海",
                      transportMode: "TRAIN",
                    },
                  }
                : {}),
            },
          },
        },
      }
    )
    expect(saved.ok()).toBeTruthy()
    journey = (await saved.json()).journey
  }
  await page.goto(`/journeys/${journey.id}`)
  await expect(page.locator(".journal-card-sort")).toHaveCount(4)
  return journey
}

function visibleOrder(page: Page) {
  return page
    .locator(".journal-list [data-record-id]:not([data-dnd-placeholder])")
    .evaluateAll((elements) =>
      elements.map((element) => (element as HTMLElement).dataset.recordId)
    )
}

async function dragSecondAfterThird(page: Page, ids: string[], touch: boolean) {
  const source = page.locator(
    `.journal-list [data-record-id="${ids[1]}"]:not([data-dnd-placeholder])`
  )
  const target = page.locator(
    `.journal-list [data-record-id="${ids[2]}"]:not([data-dnd-placeholder])`
  )
  await page.locator(".journal-list").evaluate((list, items) => {
    const source = list
      .querySelector(`[data-record-id="${items[1]}"]`)!
      .getBoundingClientRect()
    const target = list
      .querySelector(`[data-record-id="${items[2]}"]`)!
      .getBoundingClientRect()
    const bounds = list.getBoundingClientRect()
    list.scrollTop +=
      (source.top + target.bottom) / 2 - (bounds.top + bounds.height / 2)
  }, ids)
  const from = await source.locator(".journal-card-sort").boundingBox()
  const sourceBounds = await source.boundingBox()
  const targetBounds = await target.boundingBox()
  const x = from!.x + from!.width / 2
  const y = from!.y + from!.height / 2
  const destination =
    targetBounds!.y +
    targetBounds!.height / 2 +
    y -
    sourceBounds!.y -
    sourceBounds!.height / 2
  if (touch) {
    const session = await page.context().newCDPSession(page)
    const move = (
      type: "touchStart" | "touchMove" | "touchEnd",
      position: number
    ) =>
      session.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x, y: position, id: 1 }],
      })
    await move("touchStart", y)
    await page.waitForTimeout(650)
    await expect(page.getByRole("menu")).toHaveCount(0)
    await move("touchMove", y + 12)
    await expect(page.locator("[data-dnd-dragging]")).toHaveCount(1)
    for (let step = 1; step <= 12; step++)
      await move("touchMove", y + ((destination - y) * step) / 12)
    await expect
      .poll(() => visibleOrder(page))
      .toEqual([ids[0], ids[2], ids[1], ids[3]])
    await move("touchEnd", destination)
    await session.detach()
  } else {
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y + 12)
    await expect(page.locator("[data-dnd-dragging]")).toHaveCount(1)
    await page.mouse.move(x, destination, { steps: 12 })
    await expect
      .poll(() => visibleOrder(page))
      .toEqual([ids[0], ids[2], ids[1], ids[3]])
    await page.mouse.up()
  }
}

test("card order persists for pointer and keyboard moves without sorting dates", async ({
  page,
  baseURL,
  isMobile,
}) => {
  const journey = await journeyFixture(page, baseURL!)
  const ids = journey.events.map((event) => event.id)
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/commands") &&
      response.request().postDataJSON()?.command?.name === "event.move"
  )
  await dragSecondAfterThird(page, ids, isMobile)
  expect((await saved).ok()).toBeTruthy()
  await page.reload()
  await expect
    .poll(() => visibleOrder(page))
    .toEqual([ids[0], ids[2], ids[1], ids[3]])
  const handle = page.locator(
    `.journal-list [data-record-id="${ids[1]}"]:not([data-dnd-placeholder]) .journal-card-sort`
  )
  await handle.focus()
  await page.keyboard.press("Space")
  await expect(
    page.locator(
      `.journal-list [data-record-id="${ids[1]}"]:not([data-dnd-placeholder])`
    )
  ).toHaveAttribute("data-dragging", "true")
  await expect(
    page.locator('[aria-live="polite"]').filter({ hasText: "已提起“一杯热茶”" })
  ).toHaveCount(1)
  await page.keyboard.press("ArrowUp")
  await page.keyboard.press("Escape")
  await expect
    .poll(() => visibleOrder(page))
    .toEqual([ids[0], ids[2], ids[1], ids[3]])
  await expect(page.locator("[data-dnd-dropping]")).toHaveCount(0)
  await handle.focus()
  await page.keyboard.press("Space")
  await page.keyboard.press("ArrowUp")
  const keyboardSave = page.waitForResponse(
    (response) =>
      response.url().endsWith("/commands") &&
      response.request().postDataJSON()?.command?.name === "event.move"
  )
  await page.keyboard.press("Space")
  expect((await keyboardSave).ok()).toBeTruthy()
  await expect(handle).toBeFocused()
  await page.reload()
  await expect.poll(() => visibleOrder(page)).toEqual(ids)
  const persisted: JourneySnapshot = await (
    await page.request.get(`/api/journeys/${journey.id}`)
  ).json()
  expect(
    persisted.events.map(({ id, date, body }) => ({ id, date, body }))
  ).toEqual(journey.events.map(({ id, date, body }) => ({ id, date, body })))
})

test("a failed order write restores the confirmed order and allows a retry", async ({
  page,
  baseURL,
  isMobile,
}) => {
  const journey = await journeyFixture(page, baseURL!)
  const ids = journey.events.map((event) => event.id)
  await page.route("**/api/journeys/*/commands", async (route) => {
    if (route.request().postDataJSON().command.name === "event.move")
      await route.fulfill({ status: 500, json: { error: "排序保存失败" } })
    else await route.continue()
  })
  await dragSecondAfterThird(page, ids, isMobile)
  await expect(
    page.getByRole("alert").filter({ hasText: "排序保存失败" })
  ).toBeVisible()
  await expect.poll(() => visibleOrder(page)).toEqual(ids)
  await page.unroute("**/api/journeys/*/commands")
  await page.getByRole("button", { name: "重新读取", exact: true }).click()
  await expect(
    page.getByRole("alert").filter({ hasText: "排序保存失败" })
  ).toHaveCount(0)
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/commands") &&
      response.request().postDataJSON()?.command?.name === "event.move"
  )
  await dragSecondAfterThird(page, ids, isMobile)
  expect((await saved).ok()).toBeTruthy()
  await page.reload()
  await expect
    .poll(() => visibleOrder(page))
    .toEqual([ids[0], ids[2], ids[1], ids[3]])
})
