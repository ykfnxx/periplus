import { randomUUID } from "node:crypto"
import { expect, test } from "@playwright/test"
import type {
  JourneySnapshot,
  ShareStatus,
} from "../../modules/data-model/contracts"

test("anonymous photos cannot bypass share revocation through the image optimizer", async ({
  request,
  browser,
  baseURL,
}) => {
  const signup = await request.post("/api/auth/sign-up/email", {
    headers: { Origin: baseURL! },
    data: {
      name: "CI 分享作者",
      email: `share-${randomUUID()}@example.test`,
      password: randomUUID(),
    },
  })
  expect(signup.ok()).toBeTruthy()
  const created = await request.post("/api/journeys", {
    data: { title: "分享验证", idempotencyKey: randomUUID() },
  })
  expect(created.ok()).toBeTruthy()
  let journey: JourneySnapshot = (await created.json()).journey
  const uploaded = await request.post("/api/photos", {
    multipart: {
      uploadId: randomUUID(),
      file: {
        name: "share.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=",
          "base64"
        ),
      },
    },
  })
  expect(uploaded.ok()).toBeTruthy()
  const assetId: string = (await uploaded.json()).id
  const saved = await request.post(`/api/journeys/${journey.id}/commands`, {
    data: {
      expectedRevision: journey.revision,
      idempotencyKey: randomUUID(),
      command: {
        name: "event.add",
        afterEventId: null,
        content: {
          category: "VISIT",
          date: "2026-10-24",
          title: "公开的一页",
          body: "读者无需登录。",
        },
      },
    },
  })
  expect(saved.ok()).toBeTruthy()
  const added = await saved.json()
  journey = added.journey
  const attached = await request.post(`/api/journeys/${journey.id}/commands`, {
    data: {
      expectedRevision: journey.revision,
      idempotencyKey: randomUUID(),
      command: {
        name: "photos.set",
        eventId: added.eventId,
        photos: [{ assetId, caption: "分享照片" }],
        coverAssetId: assetId,
      },
    },
  })
  expect(attached.ok()).toBeTruthy()
  journey = (await attached.json()).journey
  const endpoint = `/api/journeys/${journey.id}/share`
  const published = await request.put(endpoint, {
    data: {
      expectedRevision: journey.revision,
      expectedShareVersion: 0,
      includeCosts: false,
      idempotencyKey: randomUUID(),
    },
  })
  expect(published.ok()).toBeTruthy()
  const share: ShareStatus = await published.json()
  const token = new URL(share.url!).pathname.split("/").at(-1)!
  const photo = `/api/shares/${token}/photos/${assetId}`
  const optimized = `/_next/image?url=${encodeURIComponent(photo)}&w=640&q=75`
  const anonymous = await browser.newContext({ baseURL })
  try {
    const page = await anonymous.newPage()
    expect((await page.goto(share.url!))!.status()).toBe(200)
    await expect(page.locator(".share-body")).toHaveText("读者无需登录。")
    const image = await anonymous.request.get(photo)
    expect(image.status()).toBe(200)
    expect(image.headers()["cache-control"]).toContain("no-store")
    expect((await anonymous.request.get(optimized)).status()).toBe(404)
    expect(
      (await anonymous.request.get(`/api/assets/${assetId}/file`)).status()
    ).toBe(401)
    const revoked = await request.delete(endpoint, {
      data: {
        expectedShareVersion: share.version,
        idempotencyKey: randomUUID(),
      },
    })
    expect(revoked.ok()).toBeTruthy()
    expect((await anonymous.request.get(share.url!)).status()).toBe(404)
    expect((await anonymous.request.get(photo)).status()).toBe(404)
    const blocked = await anonymous.request.get(optimized)
    expect(blocked.status()).toBe(404)
    expect(blocked.headers()["content-type"]).not.toMatch(/^image\//)
  } finally {
    await anonymous.close()
  }
})
