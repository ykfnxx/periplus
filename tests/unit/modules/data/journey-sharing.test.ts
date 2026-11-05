// @vitest-environment node
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { prisma } from "@/modules/data/db/prisma"
import { setTestAuthContext } from "@/modules/auth/server/context"
import { createJourney } from "@/modules/data/journeys/journey-repository"
import { mutateRecordingJourney } from "@/modules/data/journeys/recording-service"
import { uploadResource } from "@/modules/data/assets/asset-service"
import { deleteAsset } from "@/modules/data/assets/asset-repository"
import { assetOperator } from "@/modules/data/assets/object-storage"
import {
  getSharePreview,
  getPublicShare,
} from "@/modules/data/sharing/share-service"
import { GET, PUT, DELETE } from "@/app/api/journeys/[id]/share/route"
import { GET as publicPhoto } from "@/app/api/shares/[token]/photos/[assetId]/route"
import { GET as privatePhoto } from "@/app/api/assets/[id]/file/route"
import { eventFixture, journeyFixture } from "@/tests/fixtures/journey"
import { eventWeatherInput } from "@/modules/data/weather/weather-input"
import type {
  JourneySnapshot,
  ShareStatus,
} from "@/modules/data-model/contracts"

const owner = { userId: `share-owner-${randomUUID()}`, role: "user" as const }
const member = { userId: `share-member-${randomUUID()}`, role: "user" as const }
const outsider = {
  userId: `share-other-${randomUUID()}`,
  role: "user" as const,
}
const admin = { userId: `share-admin-${randomUUID()}`, role: "admin" as const }
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=",
  "base64"
)
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const request = (body?: unknown, method = "PUT") =>
  new NextRequest("http://localhost/api/share", {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  })
async function image() {
  return (
    await uploadResource(owner, {
      uploadId: randomUUID(),
      mimeType: "image/png",
      originalName: "private-filename-sentinel.png",
      source: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(png))
          controller.close()
        },
      }),
    })
  ).asset
}
async function saved() {
  const photo = await image(),
    receipt = await image()
  const journey = journeyFixture(owner.userId, randomUUID())
  const event = eventFixture(randomUUID(), owner.userId)
  Object.assign(event, {
    title: "湖边",
    body: "完整正文",
    date: "2026-10-24",
    time: "16:40",
    timeZone: "Asia/Shanghai",
    startAt: "2026-10-24T08:40:00.000Z",
    endAt: "2026-10-24T10:10:00.000Z",
    bookingReference: "private-booking-sentinel",
    location: {
      name: "西湖",
      address: null,
      coordinates: { lat: 30.25, lng: 120.15, coordinateSystem: "WGS84" },
    },
    photos: [
      {
        assetId: photo.id,
        url: "/private-original-url-sentinel",
        caption: "落日",
        location: null,
        isCover: true,
        source: event.source,
        canEdit: true,
      },
    ],
    receipts: [
      {
        id: randomUUID(),
        assetId: receipt.id,
        url: "/private-receipt-sentinel",
        source: event.source,
        canEdit: true,
        merchant: "private-merchant-sentinel",
        date: null,
        total: "0",
        currency: "CNY",
        items: [],
      },
    ],
  })
  const earlier = {
    ...eventFixture(randomUUID(), owner.userId),
    date: "2026-10-23",
    category: "MEAL" as const,
    title: "稍后补记",
  }
  journey.events = [event, earlier]
  await createJourney(owner, {
    journey,
    operation: "test",
    idempotencyKey: randomUUID(),
    patch: [],
    inversePatch: [],
  })
  await prisma.journeyMember.create({
    data: { journeyId: journey.id, userId: member.userId },
  })
  return { journey, photo, receipt }
}
function write(journey: JourneySnapshot, version = 0, includeCosts = false) {
  return {
    expectedRevision: journey.revision,
    expectedShareVersion: version,
    includeCosts,
    idempotencyKey: randomUUID(),
  }
}
async function publish(
  journey: JourneySnapshot,
  version = 0,
  includeCosts = false
) {
  const response = await PUT(
    request(write(journey, version, includeCosts)),
    params(journey.id)
  )
  expect(response.status, await response.clone().text()).toBe(200)
  return response.json() as Promise<ShareStatus>
}
const token = (status: ShareStatus) => status.url!.split("/").at(-1)!
const photoRequest = (token: string, assetId: string, range?: string) =>
  publicPhoto(
    new Request("http://localhost/image", { headers: range ? { range } : {} }),
    { params: Promise.resolve({ token, assetId }) }
  )
beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "test")
  await prisma.user.createMany({
    data: [owner, member, outsider, admin].map((context) => ({
      id: context.userId,
      name: "显示署名",
      email: `${context.userId}@example.test`,
      role: context.role,
      emailVerified: true,
    })),
  })
})
beforeEach(() => setTestAuthContext(owner))
afterAll(() => {
  setTestAuthContext(undefined)
  vi.unstubAllEnvs()
})

describe("Journey sharing with PostgreSQL and real object storage", () => {
  it("publishes ordered, minimal data with costs and internal fields removed", async () => {
    const { journey, photo, receipt } = await saved()
    const status = await publish(journey)
    const shared = await getPublicShare(token(status))
    expect(shared!.document.events.map((event) => event.id)).toEqual(
      journey.events.map((event) => event.id)
    )
    expect(shared!.document.events[0].timeLabel).toBe("16:40–18:10")
    expect(shared!.document.events[0].costs).toEqual([])
    const serialized = JSON.stringify(shared)
    for (const forbidden of [
      owner.userId,
      "private-",
      "canEdit",
      "bookingReference",
      "storageKey",
      receipt.id,
    ])
      expect(serialized).not.toContain(forbidden)
    expect(shared!.photoUrls[photo.id]).toContain(
      `/api/shares/${token(status)}/photos/`
    )
    expect(
      (await prisma.journey.findUniqueOrThrow({ where: { id: journey.id } }))
        .revision
    ).toBe(1)
    expect(
      (await prisma.asset.findUniqueOrThrow({ where: { id: photo.id } }))
        .visibility
    ).toBe("PRIVATE")
  })
  it("permits anonymous whitelisted photos while private and management routes require login", async () => {
    const { journey, photo, receipt } = await saved(),
      published = await publish(journey)
    setTestAuthContext(null)
    expect(
      (await GET(request(undefined, "GET"), params(journey.id))).status
    ).toBe(401)
    expect(
      (
        await privatePhoto(
          new NextRequest("http://localhost/image"),
          params(photo.id)
        )
      ).status
    ).toBe(401)
    const response = await photoRequest(token(published), photo.id)
    expect(response.status).toBe(200)
    expect(Buffer.from(await response.arrayBuffer())).toEqual(png)
    expect(response.headers.get("cache-control")).toContain("no-store")
    expect((await photoRequest(token(published), receipt.id)).status).toBe(404)
    expect(
      (await photoRequest("unknown", photo.id)).headers.get("cache-control")
    ).toContain("no-store")
  })
  it("denies ordinary members and outsiders but allows administrators", async () => {
    const { journey } = await saved()
    for (const context of [member, outsider]) {
      setTestAuthContext(context)
      expect(
        (await PUT(request(write(journey)), params(journey.id))).status
      ).toBe(403)
      expect(
        (await GET(request(undefined, "GET"), params(journey.id))).status
      ).toBe(403)
    }
    setTestAuthContext(admin)
    expect(
      (await PUT(request(write(journey)), params(journey.id))).status
    ).toBe(200)
  })
  it("freezes content until an explicit same-URL update and preserves decimal zero cost", async () => {
    const { journey } = await saved(),
      first = await publish(journey)
    const changed = (
      await mutateRecordingJourney(owner, journey.id, {
        expectedRevision: 1,
        idempotencyKey: randomUUID(),
        command: {
          name: "event.update",
          eventId: journey.events[0]!.id,
          patch: { body: "新的正文" },
        },
      })
    ).journey
    expect((await getPublicShare(token(first)))!.document.events[0].body).toBe(
      "完整正文"
    )
    const updated = await publish(changed, first.version, true)
    expect(updated.url).toBe(first.url)
    expect(
      (await getPublicShare(token(first)))!.document.events[0]
    ).toMatchObject({ body: "新的正文", costs: ["¥0"] })
  })
  it("reconciles duplicate writes without issuing another token and rejects key reuse", async () => {
    const { journey } = await saved(),
      input = write(journey)
    const first = await PUT(request(input), params(journey.id))
    const second = await PUT(request(input), params(journey.id))
    expect(await second.json()).toEqual(await first.json())
    expect(
      (await PUT(request({ ...input, includeCosts: true }), params(journey.id)))
        .status
    ).toBe(409)
  })
  it("serializes concurrent first publications", async () => {
    const { journey } = await saved()
    const results = await Promise.all([
      PUT(request(write(journey)), params(journey.id)),
      PUT(request(write(journey)), params(journey.id)),
    ])
    expect(results.map((response) => response.status).sort()).toEqual([
      200, 409,
    ])
    expect(
      await prisma.journeyShare.count({ where: { journeyId: journey.id } })
    ).toBe(1)
  })
  it("revokes both page and image, rejects late updates, and rotates the next token", async () => {
    const { journey, photo } = await saved(),
      first = await publish(journey)
    const input = {
      expectedShareVersion: first.version,
      idempotencyKey: randomUUID(),
    }
    const stopped = await DELETE(request(input, "DELETE"), params(journey.id))
    expect(stopped.status).toBe(200)
    expect(
      (await DELETE(request(input, "DELETE"), params(journey.id))).status
    ).toBe(200)
    expect(await getPublicShare(token(first))).toBeNull()
    expect((await photoRequest(token(first), photo.id)).status).toBe(404)
    expect(
      (await PUT(request(write(journey, first.version)), params(journey.id)))
        .status
    ).toBe(409)
    const next = await publish(journey, (await stopped.json()).version)
    expect(next.url).not.toBe(first.url)
    expect(await getPublicShare(token(first))).toBeNull()
  })
  it("retains a published photo after private detachment and soft deletion", async () => {
    const { journey, photo } = await saved(),
      first = await publish(journey)
    const current = (
      await mutateRecordingJourney(owner, journey.id, {
        expectedRevision: 1,
        idempotencyKey: randomUUID(),
        command: {
          name: "photos.set",
          eventId: journey.events[0]!.id,
          photos: [],
          coverAssetId: null,
        },
      })
    ).journey
    await deleteAsset(owner, photo.id)
    expect((await photoRequest(token(first), photo.id)).status).toBe(200)
    await publish(current, first.version)
    expect((await photoRequest(token(first), photo.id)).status).toBe(404)
  })
  it("preserves the previous snapshot on stale source revisions or missing new files", async () => {
    const { journey, photo } = await saved(),
      first = await publish(journey)
    const extra = await image()
    const current = (
      await mutateRecordingJourney(owner, journey.id, {
        expectedRevision: 1,
        idempotencyKey: randomUUID(),
        command: {
          name: "photos.set",
          eventId: journey.events[0]!.id,
          photos: [
            { assetId: photo.id, caption: "落日" },
            { assetId: extra.id, caption: "缺失" },
          ],
          coverAssetId: photo.id,
        },
      })
    ).journey
    expect(
      (await PUT(request(write(journey, first.version)), params(journey.id)))
        .status
    ).toBe(409)
    await assetOperator().delete(extra.storageKey)
    expect(
      (await PUT(request(write(current, first.version)), params(journey.id)))
        .status
    ).toBe(400)
    expect(
      (await getPublicShare(token(first)))!.document.events[0].photos
    ).toHaveLength(1)
    expect((await photoRequest(token(first), photo.id)).status).toBe(200)
  })
  it("freezes available matching weather without querying providers", async () => {
    const { journey } = await saved(),
      event = journey.events[0]!
    const weather = {
      provider: "open-meteo",
      precision: "HOURLY",
      weatherCode: 2,
      temperatureC: 20,
      matchedAt: event.startAt,
      fetchedAt: "2026-10-29T00:00:00.000Z",
    }
    await prisma.eventWeather.create({
      data: {
        journeyId: journey.id,
        eventId: event.id,
        inputKey: eventWeatherInput(event)!.key,
        queryJson: "{}",
        resultJson: JSON.stringify(weather),
        fetchedAt: new Date(),
      },
    })
    const first = await publish(journey)
    await prisma.eventWeather.update({
      where: {
        journeyId_eventId: { journeyId: journey.id, eventId: event.id },
      },
      data: { resultJson: JSON.stringify({ ...weather, temperatureC: 25 }) },
    })
    expect(
      (await getPublicShare(token(first)))!.document.events[0].weather
    ).toMatchObject({ temperatureC: 20 })
    const preview = await getSharePreview(owner, journey.id, false)
    expect(preview.document.events[0].weather).toMatchObject({
      temperatureC: 25,
    })
  })
  it("serves byte ranges and rejects an empty Journey", async () => {
    const { journey, photo } = await saved(),
      first = await publish(journey)
    const range = await photoRequest(token(first), photo.id, "bytes=0-7")
    expect(range.status).toBe(206)
    expect(Buffer.from(await range.arrayBuffer())).toEqual(png.subarray(0, 8))
    expect(
      (await photoRequest(token(first), photo.id, "bytes=99999-")).status
    ).toBe(416)
    const empty = journeyFixture(owner.userId, randomUUID())
    await createJourney(owner, {
      journey: empty,
      operation: "test",
      idempotencyKey: randomUUID(),
      patch: [],
      inversePatch: [],
    })
    expect((await PUT(request(write(empty)), params(empty.id))).status).toBe(
      400
    )
  })
})
