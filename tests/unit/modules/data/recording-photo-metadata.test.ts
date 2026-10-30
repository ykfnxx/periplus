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
import { POST as command } from "@/app/api/journeys/[id]/commands/route"
import { setTestAuthContext } from "@/modules/auth/server/context"
import type {
  JourneyCommand,
  JourneySnapshot,
  EventLocation,
  JourneyMutation,
} from "@/modules/data-model/contracts"
import { createJourney } from "@/modules/data/journeys/journey-repository"
import { eventFixture, journeyFixture } from "@/tests/fixtures/journey"
import { prisma } from "@/modules/data/db/prisma"
import {
  createRecordingJourney,
  getRecordingJourney,
  mutateRecordingJourney,
} from "@/modules/data/journeys/recording-service"

const owner = { userId: randomUUID(), role: "user" as const }
const other = { userId: randomUUID(), role: "user" as const }
const assetIds = [randomUUID(), randomUUID(), randomUUID()]
const [a, b, c] = assetIds as [string, string, string]
const location = (name: string, lat = 30.25): EventLocation => ({
  name,
  address: null,
  coordinates: { lat, lng: 120.15, coordinateSystem: "GCJ02" },
})

async function create() {
  return (await createRecordingJourney(owner, { idempotencyKey: randomUUID() }))
    .journey
}
async function write(journey: JourneySnapshot, action: JourneyCommand) {
  return mutateRecordingJourney(owner, journey.id, {
    expectedRevision: journey.revision,
    idempotencyKey: randomUUID(),
    command: action,
  })
}
function photo(journey: JourneySnapshot, eventId: string, assetId = a) {
  return journey.events
    .find((event) => event.id === eventId)!
    .photos.find((item) => item.assetId === assetId)!
}
async function post(
  journey: JourneySnapshot,
  action: unknown,
  revision = journey.revision
) {
  return command(
    new NextRequest("http://localhost/api/journeys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedRevision: revision,
        idempotencyKey: randomUUID(),
        command: action,
      }),
    }),
    { params: Promise.resolve({ id: journey.id }) }
  )
}

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "test")
  await prisma.user.createMany({
    data: [owner, other].map(({ userId }) => ({
      id: userId,
      name: userId,
      email: `${userId}@example.test`,
      emailVerified: true,
    })),
  })
  await prisma.asset.createMany({
    data: assetIds.map((id) => ({
      id,
      ownerId: owner.userId,
      kind: "IMAGE",
      visibility: "PRIVATE",
      storageKey: `tests/${id}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 1,
      checksum: id,
    })),
  })
})
beforeEach(() => setTestAuthContext(owner))
afterAll(() => {
  setTestAuthContext(undefined)
  vi.unstubAllEnvs()
})

describe.sequential(
  "recording photo descriptions and location overrides",
  () => {
    it("persists overrides through reordering, cover changes, appending, moves, reset and receipt replay", async () => {
      const first = await write(await create(), {
        name: "event.add",
        afterEventId: null,
        content: { date: "2026-10-29", location: location("湖边") },
      })
      const firstId = first.eventId!
      const second = await write(first.journey, {
        name: "event.add",
        afterEventId: firstId,
        content: { date: "2026-10-29", location: location("茶馆", 30.26) },
      })
      const secondId = second.eventId!
      let journey = (
        await write(second.journey, {
          name: "photos.set",
          eventId: firstId,
          photos: [
            { assetId: a, caption: "甲" },
            { assetId: b, caption: "乙" },
          ],
          coverAssetId: a,
        })
      ).journey
      expect(photo(journey, firstId).location).toBeNull()
      const override = location("照片单独的位置", 30.27)
      const request: JourneyMutation = {
        expectedRevision: journey.revision,
        idempotencyKey: randomUUID(),
        command: {
          name: "photo.update",
          eventId: firstId,
          assetId: a,
          patch: { caption: "景".repeat(100), location: override },
        },
      }
      const updated = await mutateRecordingJourney(owner, journey.id, request)
      journey = (
        await write(updated.journey, {
          name: "event.update",
          eventId: firstId,
          patch: { location: location("改过的事件位置", 30.28) },
        })
      ).journey
      expect(photo(journey, firstId)).toMatchObject({
        caption: "景".repeat(100),
        location: override,
      })
      expect(photo(journey, firstId, b).location).toBeNull()
      journey = (
        await write(journey, {
          name: "photos.set",
          eventId: firstId,
          photos: [
            { assetId: b, caption: "乙" },
            { assetId: a, caption: "景".repeat(100) },
          ],
          coverAssetId: b,
        })
      ).journey
      journey = (
        await write(journey, {
          name: "photos.set",
          eventId: firstId,
          photos: [
            ...journey.events[0]!.photos.map(({ assetId, caption }) => ({
              assetId,
              caption,
            })),
            { assetId: c, caption: "" },
          ],
          coverAssetId: b,
        })
      ).journey
      expect(journey.events[0]!.photos.map((item) => item.assetId)).toEqual([
        b,
        a,
        c,
      ])
      expect(photo(journey, firstId)).toMatchObject({
        location: override,
        isCover: false,
      })
      expect(photo(journey, firstId, c).location).toBeNull()
      journey = (
        await write(journey, {
          name: "photo.move",
          assetId: a,
          fromEventId: firstId,
          toEventId: secondId,
          afterAssetId: null,
        })
      ).journey
      expect(photo(journey, secondId).location).toEqual(override)
      journey = (
        await write(journey, {
          name: "photo.move",
          assetId: b,
          fromEventId: firstId,
          toEventId: secondId,
          afterAssetId: a,
        })
      ).journey
      expect(photo(journey, secondId, b).location).toBeNull()
      expect(journey.events[1]!.location).toEqual(location("茶馆", 30.26))

      const another = await write(await create(), {
        name: "event.add",
        afterEventId: null,
        content: { date: "2026-10-29" },
      })
      const separate = (
        await write(another.journey, {
          name: "photos.set",
          eventId: another.eventId!,
          photos: [{ assetId: a, caption: "另一条记录" }],
          coverAssetId: null,
        })
      ).journey
      expect(photo(separate, another.eventId!).location).toBeNull()
      expect(
        photo(await getRecordingJourney(owner, journey.id), secondId).location
      ).toEqual(override)
      expect(await prisma.asset.findUnique({ where: { id: a } })).toMatchObject(
        { lat: null, lng: null }
      )
      const persisted = await prisma.eventAssetLink.findFirstOrThrow({
        where: {
          journeyId: journey.id,
          eventId: secondId,
          assetId: a,
        },
      })
      expect(persisted.eventId).toBe(secondId)
      expect(
        photo(await getRecordingJourney(owner, journey.id), secondId).location
      ).toEqual(override)

      journey = (
        await write(journey, {
          name: "photo.update",
          eventId: secondId,
          assetId: a,
          patch: { location: null },
        })
      ).journey
      expect(photo(journey, secondId)).toMatchObject({
        caption: "景".repeat(100),
        location: null,
      })
      journey = (
        await write(journey, {
          name: "photo.update",
          eventId: secondId,
          assetId: b,
          patch: { caption: "新描述" },
        })
      ).journey
      expect(photo(journey, secondId, b)).toMatchObject({
        caption: "新描述",
        location: null,
      })
      expect(await getRecordingJourney(owner, journey.id)).toEqual(journey)
      expect(await mutateRecordingJourney(owner, journey.id, request)).toEqual({
        ...updated,
        replayed: true,
      })
      expect(await getRecordingJourney(owner, journey.id)).toEqual(journey)
    })

    it("preserves existing long descriptions during membership and location-only writes", async () => {
      const first = eventFixture(randomUUID(), owner.userId)
      const second = eventFixture(randomUUID(), owner.userId)
      // Existing captions may exceed today's input limit.
      first.photos = [
        {
          assetId: a,
          url: `/api/assets/${a}/file`,
          source: first.source,
          canEdit: true,
          caption: "旧".repeat(160),
          location: null,
          isCover: false,
        },
      ]
      const snapshot = journeyFixture(owner.userId, randomUUID())
      snapshot.events = [first, second]
      await createJourney(owner, {
        journey: snapshot,
        operation: "fixture.caption",
        idempotencyKey: randomUUID(),
        patch: [],
        inversePatch: [],
      })
      let journey = await getRecordingJourney(owner, snapshot.id)
      journey = (
        await write(journey, {
          name: "photos.set",
          eventId: first.id,
          photos: [
            { assetId: b, caption: "新增" },
            { assetId: a, caption: "旧".repeat(160) },
          ],
          coverAssetId: a,
        })
      ).journey
      journey = (
        await write(journey, {
          name: "photo.update",
          eventId: first.id,
          assetId: a,
          patch: { location: location("独立地点") },
        })
      ).journey
      journey = (
        await write(journey, {
          name: "photo.move",
          assetId: a,
          fromEventId: first.id,
          toEventId: second.id,
          afterAssetId: null,
        })
      ).journey
      expect(photo(journey, second.id)).toMatchObject({
        caption: "旧".repeat(160),
        location: location("独立地点"),
      })
      const rejected = await post(journey, {
        name: "photo.update",
        eventId: second.id,
        assetId: a,
        patch: { caption: "新".repeat(101) },
      })
      expect(rejected.status).toBe(400)
      expect(await getRecordingJourney(owner, journey.id)).toEqual(journey)
      journey = (
        await write(journey, {
          name: "photo.update",
          eventId: second.id,
          assetId: a,
          patch: { caption: "" },
        })
      ).journey
      expect(photo(journey, second.id)).toMatchObject({
        caption: "",
        location: location("独立地点"),
      })
      expect(await getRecordingJourney(owner, journey.id)).toEqual(journey)
    })

    it("rejects invalid metadata, unattached photos, stale writes and foreign actors without changing the head", async () => {
      const first = await write(await create(), {
        name: "event.add",
        afterEventId: null,
        content: { date: "2026-10-29" },
      })
      const eventId = first.eventId!
      let journey = (
        await write(first.journey, {
          name: "photos.set",
          eventId,
          photos: [{ assetId: a, caption: "" }],
          coverAssetId: a,
        })
      ).journey
      const invalid: unknown[] = [
        { name: "photo.update", eventId, assetId: a, patch: {} },
        {
          name: "photo.update",
          eventId,
          assetId: a,
          patch: { caption: "x".repeat(101) },
        },
        { name: "photo.update", eventId, assetId: a, patch: { caption: null } },
        {
          name: "photo.update",
          eventId,
          assetId: a,
          patch: { location: location("无效纬度", 91) },
        },
        {
          name: "photo.update",
          eventId,
          assetId: a,
          patch: { location: { name: "", address: null, coordinates: null } },
        },
        {
          name: "photo.update",
          eventId,
          assetId: a,
          patch: { url: "https://example.test/replacement.jpg" },
        },
        {
          name: "photo.update",
          eventId,
          assetId: c,
          patch: { caption: "未关联" },
        },
        {
          name: "photos.set",
          eventId,
          photos: [{ assetId: a, caption: "x".repeat(101) }],
          coverAssetId: a,
        },
        {
          name: "photos.set",
          eventId,
          photos: [
            { assetId: a, caption: "" },
            { assetId: b, caption: "x".repeat(101) },
          ],
          coverAssetId: a,
        },
      ]
      for (const action of invalid)
        expect((await post(journey, action)).status).toBe(400)
      expect(await getRecordingJourney(owner, journey.id)).toEqual(journey)
      const revision = journey.revision
      journey = (
        await write(journey, {
          name: "photo.update",
          eventId,
          assetId: a,
          patch: { caption: "x".repeat(100) },
        })
      ).journey
      expect(photo(journey, eventId)).toMatchObject({
        caption: "x".repeat(100),
        isCover: true,
        location: null,
      })
      const action = {
        name: "photo.update",
        eventId,
        assetId: a,
        patch: { caption: "写入" },
      }
      expect((await post(journey, action, revision)).status).toBe(409)
      setTestAuthContext(other)
      expect((await post(journey, action)).status).toBe(404)
      setTestAuthContext(null)
      expect((await post(journey, action)).status).toBe(401)
      expect(await getRecordingJourney(owner, journey.id)).toEqual(journey)
    })
  }
)
