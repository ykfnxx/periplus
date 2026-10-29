// @vitest-environment node
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import {
  GET as listJourneys,
  POST as createJourney,
} from "@/app/api/journeys/route"
import { GET as readAtlas } from "@/app/api/journeys/map/route"
import type { JourneyAtlas } from "@/modules/data-model/contracts"
import { GET as readJourney } from "@/app/api/journeys/[id]/route"
import { POST as command } from "@/app/api/journeys/[id]/commands/route"
import { GET as listPhotos, POST as uploadPhoto } from "@/app/api/photos/route"
import { DELETE as deletePhoto } from "@/app/api/photos/[id]/route"
import { GET as readPhoto } from "@/app/api/photos/[id]/file/route"
import { setTestAuthContext } from "@/modules/auth/server/context"
import {
  journeySnapshotSchema,
  journeyMutationResultSchema,
  type JourneyCommand,
  type JourneySnapshot,
  type JourneyMutation,
} from "@/modules/data-model/contracts"
import { prisma } from "@/modules/data/db/prisma"
import { createJourney as persistJourney } from "@/modules/data/journeys/journey-repository"
import { transitJourneyFixture } from "@/tests/fixtures/journey"
import { assetOperator } from "@/modules/data/assets/object-storage"

const ownerId = `recording-owner-${randomUUID()}`
const otherId = `recording-other-${randomUUID()}`
const owner = { userId: ownerId, role: "user" as const }
const other = { userId: otherId, role: "user" as const }
const uploadedAssetIds = new Set<string>()
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=",
  "base64"
)

function json(body: unknown) {
  return new NextRequest("http://localhost/api/journeys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

async function newJourney(title = "海边的周末") {
  const response = await createJourney(
    json({ idempotencyKey: randomUUID(), title })
  )
  expect(response.status).toBe(201)
  return journeyMutationResultSchema.parse(await response.json()).journey
}

async function write(
  journey: JourneySnapshot,
  action: JourneyCommand,
  key = randomUUID()
) {
  const response = await command(
    json({
      expectedRevision: journey.revision,
      idempotencyKey: key,
      command: action,
    }),
    params(journey.id)
  )
  expect(response.status, JSON.stringify(await response.clone().json())).toBe(
    200
  )
  return journeyMutationResultSchema.parse(await response.json())
}

async function reopen(id: string) {
  const response = await readJourney(
    new NextRequest("http://localhost/api/journeys"),
    params(id)
  )
  expect(response.status).toBe(200)
  return journeySnapshotSchema.parse(await response.json())
}

async function upload(
  uploadId = randomUUID(),
  name = "photo.png",
  bytes = png
) {
  const formData = new FormData()
  formData.set(
    "file",
    new File([new Uint8Array(bytes)], name, { type: "image/png" })
  )
  formData.set("uploadId", uploadId)
  return uploadPhoto({
    formData: async () => formData,
  } as unknown as NextRequest)
}

async function photo(uploadId = randomUUID()) {
  const response = await upload(uploadId)
  expect(response.status).toBe(201)
  const dto = (await response.json()) as {
    id: string
    lat: number | null
    lng: number | null
  }
  uploadedAssetIds.add(dto.id)
  expect(dto).toMatchObject({ lat: null, lng: null })
  return dto
}

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "test")
  await prisma.user.createMany({
    data: [ownerId, otherId].map((id) => ({
      id,
      name: id,
      email: `${id}@example.test`,
      emailVerified: true,
    })),
  })
})
beforeEach(() => setTestAuthContext(owner))
afterAll(async () => {
  setTestAuthContext(undefined)
  const assets = await prisma.asset.findMany({
    where: { id: { in: [...uploadedAssetIds] } },
  })
  await Promise.all(
    assets.map((asset) =>
      assetOperator()
        .delete(asset.storageKey)
        .catch(() => undefined)
    )
  )
  vi.unstubAllEnvs()
})

describe.sequential("manual recording API and durable event identity", () => {
  it("projects only the current author's albums and preserves source and effective photo location", async () => {
    setTestAuthContext(other)
    const foreign = await newJourney("另一位作者的游记")
    setTestAuthContext(owner)
    let journey = await newJourney("相册投影")
    const location = {
      name: "事件地点",
      address: null,
      coordinates: {
        lat: 30.2,
        lng: 120.1,
        coordinateSystem: "GCJ02" as const,
      },
    }
    const override = {
      ...location,
      name: "照片独立地点",
      coordinates: { ...location.coordinates, lat: 30.3 },
    }
    const added = await write(journey, {
      name: "event.add",
      afterEventId: null,
      content: { body: "真实经历", location },
    })
    journey = added.journey
    const first = await photo(),
      second = await photo()
    journey = (
      await write(journey, {
        name: "photos.set",
        eventId: added.eventId!,
        photos: [
          { assetId: first.id, caption: "继承事件" },
          { assetId: second.id, caption: "独立位置" },
        ],
        coverAssetId: first.id,
      })
    ).journey
    journey = (
      await write(journey, {
        name: "photo.update",
        eventId: added.eventId!,
        assetId: second.id,
        patch: { location: override },
      })
    ).journey
    const response = await readAtlas()
    expect(response.status).toBe(200)
    const atlas = (await response.json()) as JourneyAtlas
    expect(atlas.journeys.some((item) => item.id === foreign.id)).toBe(false)
    expect(
      atlas.journeys.find((item) => item.id === journey.id)?.photoCount
    ).toBe(2)
    expect(
      atlas.photos.filter((item) => item.journeyId === journey.id)
    ).toMatchObject([
      {
        assetId: first.id,
        eventId: added.eventId,
        journeyTitle: "相册投影",
        location,
      },
      { assetId: second.id, eventId: added.eventId, location: override },
    ])
    const removed = await write(journey, {
      name: "event.remove",
      eventId: added.eventId!,
    })
    const refreshed = (await (await readAtlas()).json()) as JourneyAtlas
    expect(
      refreshed.photos.some((item) => item.eventId === added.eventId)
    ).toBe(false)
    expect(removed.journey.events).toHaveLength(0)
  })

  it("requires authentication for the personal map feed", async () => {
    setTestAuthContext(null)
    expect((await readAtlas()).status).toBe(401)
  })

  it.each(["location", "mode"] as const)(
    "edits all event categories and invalidates changed %s without dropping records",
    async (change) => {
      const initial = transitJourneyFixture(ownerId, randomUUID())
      await persistJourney(owner, {
        journey: initial,
        operation: "fixture",
        idempotencyKey: randomUUID(),
        patch: [],
        inversePatch: [],
      })
      let current = await reopen(initial.id)
      expect(current.events.map((event) => event.category)).toEqual([
        "VISIT",
        "TRANSIT",
        "MEAL",
      ])
      const transitId = current.events[1]!.id
      const route = current.events[1]!.transit!.route
      current = (
        await write(current, {
          name: "event.update",
          eventId: transitId,
          patch: { body: "沿湖步行" },
        })
      ).journey
      expect(current.events[1]!.transit!.route).toEqual(route)
      current = (
        await write(current, {
          name: "event.add",
          afterEventId: current.events.at(-1)!.id,
          content: { body: "稍后补记" },
        })
      ).journey
      const ids = current.events.map((event) => event.id)
      current = (
        await write(
          current,
          change === "location"
            ? {
                name: "event.update",
                eventId: ids[0]!,
                patch: {
                  location: {
                    name: "湖边入口",
                    address: null,
                    coordinates: {
                      lat: 30.26,
                      lng: 120.16,
                      coordinateSystem: "GCJ02",
                    },
                  },
                },
              }
            : {
                name: "event.update",
                eventId: transitId,
                patch: { transit: { requestMode: "DRIVE" } },
              }
        )
      ).journey
      expect(current.events.map((event) => event.id)).toEqual(ids)
      expect(current.events[1]).toMatchObject({
        body: "沿湖步行",
        transit: { routeState: "ROUTE_STALE" },
      })
      expect(current.events[1]!.transit).not.toHaveProperty("route")
      expect(current.events.at(-1)).toMatchObject({
        body: "稍后补记",
        date: null,
        location: null,
      })
      expect(await reopen(initial.id)).toEqual(current)
    }
  )

  it("saves text and three no-GPS photos, enriches and reorders, then restores the exact document", async () => {
    let journey = await newJourney()
    const added = await write(journey, {
      name: "event.add",
      afterEventId: null,
      content: { body: "傍晚去了海边，风很大。" },
    })
    journey = added.journey
    const eventId = added.eventId!
    expect(journey.events[0]).toMatchObject({
      id: eventId,
      category: null,
      date: null,
      time: null,
      location: null,
    })
    const photos = await Promise.all([photo(), photo(), photo()])
    journey = (
      await write(journey, {
        name: "photos.set",
        eventId,
        photos: photos.map((item, index) => ({
          assetId: item.id,
          caption: `海边 ${index + 1}`,
        })),
        coverAssetId: photos[1]!.id,
      })
    ).journey
    const second = await write(journey, {
      name: "event.add",
      afterEventId: eventId,
      content: { body: "下一段经历" },
    })
    journey = second.journey
    journey = (
      await write(journey, {
        name: "event.update",
        eventId,
        patch: {
          category: "ACTIVITY",
          date: "2026-10-18",
          location: { name: "海边", address: null, coordinates: null },
        },
      })
    ).journey
    journey = (
      await write(journey, {
        name: "event.move",
        eventId: second.eventId!,
        afterEventId: null,
      })
    ).journey
    journey = (
      await write(journey, {
        name: "event.update",
        eventId,
        patch: {
          location: {
            name: "海边",
            address: "海滨步道",
            coordinates: { lat: 24.4, lng: 118.1, coordinateSystem: "WGS84" },
          },
        },
      })
    ).journey
    expect(journey.events.map((event) => event.id)).toEqual([
      second.eventId,
      eventId,
    ])
    expect(journey.events[1]!.photos.map((item) => item.assetId)).toEqual(
      photos.map((item) => item.id)
    )
    expect(journey.events[1]!.photos[1]!.isCover).toBe(true)
    expect(await reopen(journey.id)).toEqual(journey)
    const summaries = (await (await listJourneys()).json()) as Array<{
      id: string
      photoCount: number
      coverUrl: string
    }>
    expect(summaries.find((item) => item.id === journey.id)).toMatchObject({
      photoCount: 3,
      coverUrl: `/api/assets/${photos[1]!.id}/file`,
    })
    const listedPhotos = (await (await listPhotos()).json()) as Array<{
      id: string
      lat: number | null
    }>
    expect(
      photos.every((item) =>
        listedPhotos.some(
          (listed) => listed.id === item.id && listed.lat === null
        )
      )
    ).toBe(true)
    expect(
      await prisma.journeyEvent.findUnique({ where: { id: eventId } })
    ).toMatchObject({
      sourceUserId: ownerId,
      journeyId: journey.id,
    })
  })

  it("replays creation and a lost command reply without a duplicate or overwriting later edits", async () => {
    const createInput = { idempotencyKey: randomUUID(), title: "重试旅程" }
    const first = journeyMutationResultSchema.parse(
      await (await createJourney(json(createInput))).json()
    )
    const repeated = journeyMutationResultSchema.parse(
      await (await createJourney(json(createInput))).json()
    )
    expect(repeated).toEqual({ ...first, replayed: true })
    const createConflict = await createJourney(
      json({ ...createInput, title: "不同内容" })
    )
    expect(createConflict.status).toBe(409)
    const request: JourneyMutation = {
      expectedRevision: first.journey.revision,
      idempotencyKey: randomUUID(),
      command: {
        name: "event.add",
        afterEventId: null,
        content: { body: "原文" },
      },
    }
    const original = journeyMutationResultSchema.parse(
      await (await command(json(request), params(first.journey.id))).json()
    )
    const edited = await write(original.journey, {
      name: "event.update",
      eventId: original.eventId!,
      patch: { body: "继续写的新内容" },
    })
    const replayed = journeyMutationResultSchema.parse(
      await (await command(json(request), params(first.journey.id))).json()
    )
    expect(replayed).toEqual({ ...original, replayed: true })
    expect((await reopen(first.journey.id)).events).toEqual(
      edited.journey.events
    )
    expect(
      await prisma.journeyEvent.count({
        where: { journeyId: first.journey.id },
      })
    ).toBe(1)
    const collision = await command(
      json({
        ...request,
        command: { ...request.command, content: { body: "替换内容" } },
      }),
      params(first.journey.id)
    )
    expect(collision.status).toBe(409)
    expect(await collision.json()).toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    })
  })

  it("keeps uploads idempotent, rejects key reuse, and protects private no-GPS files", async () => {
    const uploadId = randomUUID()
    const first = await photo(uploadId)
    const repeated = await upload(uploadId)
    expect(repeated.status).toBe(200)
    expect(await repeated.json()).toMatchObject({
      id: first.id,
      lat: null,
      lng: null,
    })
    expect(await prisma.asset.count({ where: { ownerId, uploadId } })).toBe(1)
    const conflict = await upload(uploadId, "different.png")
    expect(conflict.status).toBe(409)
    const file = await readPhoto(
      new NextRequest("http://localhost/api/photos"),
      params(first.id)
    )
    expect(file.status).toBe(200)
    expect(Buffer.from(await file.arrayBuffer())).toEqual(png)
    setTestAuthContext(other)
    expect(
      (
        await readPhoto(
          new NextRequest("http://localhost/api/photos"),
          params(first.id)
        )
      ).status
    ).toBe(403)
  })

  it("edits photo order and captions, moves and detaches without deleting original media", async () => {
    let journey = await newJourney()
    const first = await write(journey, {
      name: "event.add",
      afterEventId: null,
      content: { body: "第一段" },
    })
    const second = await write(first.journey, {
      name: "event.add",
      afterEventId: first.eventId!,
      content: { body: "第二段" },
    })
    journey = second.journey
    const [a, b] = await Promise.all([photo(), photo()])
    journey = (
      await write(journey, {
        name: "photos.set",
        eventId: first.eventId!,
        photos: [
          { assetId: a.id, caption: "甲" },
          { assetId: b.id, caption: "乙" },
        ],
        coverAssetId: a.id,
      })
    ).journey
    journey = (
      await write(journey, {
        name: "photos.set",
        eventId: first.eventId!,
        photos: [
          { assetId: b.id, caption: "乙的新说明" },
          { assetId: a.id, caption: "甲" },
        ],
        coverAssetId: a.id,
      })
    ).journey
    expect(journey.events[0]!.photos.map((item) => item.assetId)).toEqual([
      b.id,
      a.id,
    ])
    journey = (
      await write(journey, {
        name: "photo.move",
        assetId: b.id,
        fromEventId: first.eventId!,
        toEventId: second.eventId!,
        afterAssetId: null,
      })
    ).journey
    expect(journey.events[1]!.photos).toMatchObject([
      { assetId: b.id, caption: "乙的新说明" },
    ])
    expect(
      (
        await deletePhoto(
          new NextRequest("http://localhost/api/photos"),
          params(b.id)
        )
      ).status
    ).toBe(409)
    journey = (
      await write(journey, {
        name: "photos.set",
        eventId: first.eventId!,
        photos: [],
        coverAssetId: null,
      })
    ).journey
    expect(
      await prisma.asset.findUnique({ where: { id: a.id } })
    ).toMatchObject({ deletedAt: null })
    expect(
      (
        await deletePhoto(
          new NextRequest("http://localhost/api/photos"),
          params(a.id)
        )
      ).status
    ).toBe(200)
    journey = (
      await write(journey, { name: "event.remove", eventId: second.eventId! })
    ).journey
    expect(journey.events.map((event) => event.id)).toEqual([first.eventId])
    expect(
      await prisma.asset.findUnique({ where: { id: b.id } })
    ).toMatchObject({ deletedAt: null })
    expect(
      (
        await deletePhoto(
          new NextRequest("http://localhost/api/photos"),
          params(b.id)
        )
      ).status
    ).toBe(200)
    expect(await reopen(journey.id)).toEqual(journey)
  })

  it("rejects invalid facts, stale writes, foreign anchors and private assets without advancing the head", async () => {
    const first = await write(await newJourney(), {
      name: "event.add",
      afterEventId: null,
      content: {},
    })
    let journey = first.journey
    const invalid: JourneyCommand[] = [
      {
        name: "event.add",
        afterEventId: null,
        content: { category: "STAY", hotel: { checkInNote: "late" } },
      },
      {
        name: "event.add",
        afterEventId: null,
        content: { category: "TRANSIT", transit: { notes: "incomplete" } },
      },
      {
        name: "event.add",
        afterEventId: null,
        content: {
          transit: {
            fromEventId: "from",
            toEventId: "to",
            transportMode: "WALK",
          },
        },
      },
      {
        name: "event.update",
        eventId: first.eventId!,
        patch: { date: "2026-02-30" },
      },
      {
        name: "event.update",
        eventId: first.eventId!,
        patch: { time: "10:30" },
      },
      {
        name: "event.update",
        eventId: first.eventId!,
        patch: { timeZone: "Not/AZone" },
      },
      {
        name: "event.move",
        eventId: first.eventId!,
        afterEventId: first.eventId!,
      },
      {
        name: "event.move",
        eventId: first.eventId!,
        afterEventId: "foreign-anchor",
      },
    ]
    for (const action of invalid) {
      const result = await command(
        json({
          expectedRevision: journey.revision,
          idempotencyKey: randomUUID(),
          command: action,
        }),
        params(journey.id)
      )
      expect(result.status).toBe(400)
    }
    const stale = await command(
      json({
        expectedRevision: 1,
        idempotencyKey: randomUUID(),
        command: {
          name: "event.update",
          eventId: first.eventId,
          patch: { body: "stale" },
        },
      }),
      params(journey.id)
    )
    expect(stale.status).toBe(409)
    expect(await stale.json()).toMatchObject({ code: "REVISION_CONFLICT" })
    setTestAuthContext(other)
    expect(
      (
        await readJourney(
          new NextRequest("http://localhost/api/journeys"),
          params(journey.id)
        )
      ).status
    ).toBe(404)
    const forbidden = await command(
      json({
        expectedRevision: journey.revision,
        idempotencyKey: randomUUID(),
        command: {
          name: "event.update",
          eventId: first.eventId,
          patch: { body: "foreign write" },
        },
      }),
      params(journey.id)
    )
    expect(forbidden.status).toBe(404)
    setTestAuthContext(null)
    expect(
      (
        await readJourney(
          new NextRequest("http://localhost/api/journeys"),
          params(journey.id)
        )
      ).status
    ).toBe(401)
    setTestAuthContext(other)
    const foreignPhoto = await photo()
    setTestAuthContext(owner)
    const foreign = await command(
      json({
        expectedRevision: journey.revision,
        idempotencyKey: randomUUID(),
        command: {
          name: "photos.set",
          eventId: first.eventId,
          photos: [{ assetId: foreignPhoto.id, caption: "" }],
          coverAssetId: null,
        },
      }),
      params(journey.id)
    )
    expect(foreign.status).toBe(400)
    expect(await reopen(journey.id)).toEqual(journey)
    journey = (
      await write(journey, {
        name: "event.update",
        eventId: first.eventId!,
        patch: { date: "2026-10-18", time: "10:30", timeZone: "Asia/Shanghai" },
      })
    ).journey
    expect(journey.events[0]).toMatchObject({
      date: "2026-10-18",
      time: "10:30",
      timeZone: "Asia/Shanghai",
    })
  })

  it("creates unresolved transit only from complete editable endpoint and mode fields", async () => {
    const from = await write(await newJourney(), {
      name: "event.add",
      afterEventId: null,
      content: { title: "出发" },
    })
    const to = await write(from.journey, {
      name: "event.add",
      afterEventId: from.eventId!,
      content: { title: "到达" },
    })
    const added = await write(to.journey, {
      name: "event.add",
      afterEventId: from.eventId!,
      content: {
        category: "TRANSIT",
        transit: {
          fromEventId: from.eventId!,
          toEventId: to.eventId!,
          transportMode: "TRAIN",
          notes: "手动记录",
        },
      },
    })
    expect(added.journey.events[1]).toMatchObject({
      id: added.eventId,
      category: "TRANSIT",
      transit: {
        fromEventId: from.eventId,
        toEventId: to.eventId,
        transportMode: "TRAIN",
        routeState: "EMPTY",
        notes: "手动记录",
      },
    })
    expect(added.journey.events[1]!.transit).not.toHaveProperty("route")
    expect(await reopen(added.journey.id)).toEqual(added.journey)
  })

  it("arbitrates simultaneous retries and competing writes with one durable head advance", async () => {
    const journey = await newJourney()
    const request: JourneyMutation = {
      expectedRevision: 1,
      idempotencyKey: randomUUID(),
      command: {
        name: "event.add",
        afterEventId: null,
        content: { body: "只保存一次" },
      },
    }
    const responses = await Promise.all([
      command(json(request), params(journey.id)),
      command(json(request), params(journey.id)),
    ])
    expect(responses.map((response) => response.status)).toEqual([200, 200])
    const results = await Promise.all(
      responses.map(async (response) =>
        journeyMutationResultSchema.parse(await response.json())
      )
    )
    expect(results[0]!.eventId).toBe(results[1]!.eventId)
    expect(
      await prisma.journeyRevision.count({ where: { journeyId: journey.id } })
    ).toBe(2)
    const next = await reopen(journey.id)
    const competing = await Promise.all(
      ["A", "B"].map((body) =>
        command(
          json({
            expectedRevision: next.revision,
            idempotencyKey: randomUUID(),
            command: {
              name: "event.add",
              afterEventId: results[0]!.eventId,
              content: { body },
            },
          }),
          params(journey.id)
        )
      )
    )
    expect(competing.map((response) => response.status).sort()).toEqual([
      200, 409,
    ])
    expect((await reopen(journey.id)).events).toHaveLength(2)
  })
})
