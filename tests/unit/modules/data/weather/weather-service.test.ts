// @vitest-environment node
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import { beforeAll, afterEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/modules/data/db/prisma"
import { POST as weatherRoute } from "@/app/api/journeys/[id]/weather/route"
import { setTestAuthContext } from "@/modules/auth/server/context"
import {
  createRecordingJourney,
  mutateRecordingJourney,
} from "@/modules/data/journeys/recording-service"
import { getJourneyWeather } from "@/modules/data/weather/weather-service"
import {
  journeyWeatherResultSchema,
  type JourneyCommand,
  type JourneySnapshot,
} from "@/modules/data-model/contracts"

const owner = { userId: `weather-owner-${randomUUID()}`, role: "user" as const }
const member = {
  userId: `weather-member-${randomUUID()}`,
  role: "user" as const,
}
const outsider = {
  userId: `weather-other-${randomUUID()}`,
  role: "user" as const,
}
const location = {
  name: "杭州",
  address: null,
  coordinates: {
    lat: 30.25,
    lng: 120.15,
    coordinateSystem: "WGS84" as const,
  },
}
function archive(url: URL, temperature = 22) {
  const start = Date.parse(url.searchParams.get("start_date")! + "T00:00:00Z")
  const end = Date.parse(url.searchParams.get("end_date")! + "T23:00:00Z")
  const time = Array.from(
    { length: (end - start) / 3_600_000 + 1 },
    (_, i) => start / 1000 + i * 3600
  )
  return Response.json({
    hourly: {
      time,
      temperature_2m: time.map(() => temperature),
      weather_code: time.map(() => 2),
    },
  })
}
async function write(journey: JourneySnapshot, command: JourneyCommand) {
  return (
    await mutateRecordingJourney(owner, journey.id, {
      expectedRevision: journey.revision,
      idempotencyKey: randomUUID(),
      command,
    })
  ).journey
}
async function recorded() {
  let journey = (
    await createRecordingJourney(owner, { idempotencyKey: randomUUID() })
  ).journey
  journey = await write(journey, {
    name: "event.add",
    afterEventId: null,
    content: {
      date: "2025-06-01",
      time: "09:30",
      timeZone: "Asia/Shanghai",
      location,
    },
  })
  return journey
}
beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "test")
  await prisma.user.createMany({
    data: [owner, member, outsider].map(({ userId: id }) => ({
      id,
      email: `${id}@example.test`,
      name: id,
    })),
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  setTestAuthContext(undefined)
})
describe.sequential("independent event weather and PostgreSQL races", () => {
  it("backfills old events without changing snapshots, revisions or the active indexes", async () => {
    const journey = await recorded()
    const before = await prisma.journey.findUniqueOrThrow({
      where: { id: journey.id },
    })
    const fetch = vi.fn((url: URL) => Promise.resolve(archive(url)))
    vi.stubGlobal("fetch", fetch)
    const response = journeyWeatherResultSchema.parse(
      await getJourneyWeather(owner, journey.id)
    )
    expect(response.events[0].weather).toMatchObject({
      precision: "HOURLY",
      temperatureC: 22,
    })
    expect(
      await prisma.journey.findUniqueOrThrow({ where: { id: journey.id } })
    ).toEqual(before)
    expect(
      await prisma.journeyRevision.count({ where: { journeyId: journey.id } })
    ).toBe(2)
    expect(
      await prisma.eventWeather.count({ where: { journeyId: journey.id } })
    ).toBe(1)
    const edited = await write(journey, {
      name: "event.update",
      eventId: journey.events[0].id,
      patch: { body: "只改正文" },
    })
    expect(
      await prisma.eventWeather.count({ where: { journeyId: journey.id } })
    ).toBe(1)
    expect((await getJourneyWeather(owner, journey.id)).revision).toBe(
      edited.revision
    )
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it("invalidates changed inputs immediately and deletes only the removed event result", async () => {
    let journey = await recorded()
    const fetch = vi.fn((url: URL) => Promise.resolve(archive(url)))
    vi.stubGlobal("fetch", fetch)
    const eventId = journey.events[0].id
    await getJourneyWeather(owner, journey.id)
    for (const patch of [
      { date: "2025-06-02" },
      { time: null },
      { timeZone: "Asia/Tokyo" },
      {
        location: {
          ...location,
          coordinates: { ...location.coordinates, lat: 31 },
        },
      },
    ]) {
      journey = await write(journey, { name: "event.update", eventId, patch })
      expect(
        await prisma.eventWeather.count({ where: { journeyId: journey.id } })
      ).toBe(0)
      expect(
        (await getJourneyWeather(owner, journey.id)).events[0].weather
      ).not.toBeNull()
    }
    expect(fetch).toHaveBeenCalledTimes(5)
    journey = await write(journey, {
      name: "event.update",
      eventId,
      patch: { location: null },
    })
    expect(
      await prisma.eventWeather.count({ where: { journeyId: journey.id } })
    ).toBe(0)
    expect(
      (await getJourneyWeather(owner, journey.id)).events[0].weather
    ).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(5)
    journey = await write(journey, {
      name: "event.update",
      eventId,
      patch: { location },
    })
    await getJourneyWeather(owner, journey.id)
    await write(journey, { name: "event.remove", eventId })
    expect(
      await prisma.eventWeather.count({ where: { journeyId: journey.id } })
    ).toBe(0)
  })
  it("keeps another event's result when one event is deleted", async () => {
    let journey = await recorded()
    const firstId = journey.events[0].id
    journey = await write(journey, {
      name: "event.add",
      afterEventId: firstId,
      content: { date: "2025-06-02", timeZone: "Asia/Shanghai", location },
    })
    vi.stubGlobal(
      "fetch",
      vi.fn((url: URL) => Promise.resolve(archive(url)))
    )
    await getJourneyWeather(owner, journey.id)
    expect(
      await prisma.eventWeather.count({ where: { journeyId: journey.id } })
    ).toBe(2)
    journey = await write(journey, { name: "event.remove", eventId: firstId })
    const remaining = await prisma.eventWeather.findMany({
      where: { journeyId: journey.id },
    })
    expect(remaining.map((row) => row.eventId)).toEqual([journey.events[0].id])
  })
  it("rejects a late result after coordinates change, while content saves complete first", async () => {
    let journey = await recorded()
    let release!: (response: Response) => void
    let started!: () => void
    let url!: URL
    const ready = new Promise<void>((resolve) => {
      started = resolve
    })
    vi.stubGlobal(
      "fetch",
      vi.fn((request: URL) => {
        url = request
        started()
        return new Promise<Response>((resolve) => {
          release = resolve
        })
      })
    )
    const waiting = getJourneyWeather(owner, journey.id)
    await ready
    journey = await write(journey, {
      name: "event.update",
      eventId: journey.events[0].id,
      patch: {
        location: {
          ...location,
          coordinates: { ...location.coordinates, lng: 121 },
        },
      },
    })
    release(archive(url))
    expect((await waiting).events[0].weather).toBeNull()
    expect(
      await prisma.eventWeather.count({ where: { journeyId: journey.id } })
    ).toBe(0)
  })
  it("retains a pending result across body edits and coalesces concurrent requests for the event", async () => {
    let journey = await recorded()
    let release!: (response: Response) => void
    let started!: () => void
    let url!: URL
    const ready = new Promise<void>((resolve) => {
      started = resolve
    })
    const fetch = vi.fn((request: URL) => {
      url = request
      started()
      return new Promise<Response>((resolve) => {
        release = resolve
      })
    })
    vi.stubGlobal("fetch", fetch)
    const reads = vi.spyOn(prisma.eventWeather, "findMany")
    const waiting = getJourneyWeather(owner, journey.id)
    await ready
    journey = await write(journey, {
      name: "event.update",
      eventId: journey.events[0].id,
      patch: { body: "稍后输入" },
    })
    const completedReads = reads.mock.calls.length
    const newer = getJourneyWeather(owner, journey.id)
    // Wait for the newer reader's database read before releasing the provider.
    await vi.waitFor(() =>
      expect(reads).toHaveBeenCalledTimes(completedReads + 1)
    )
    await reads.mock.results[completedReads].value
    release(archive(url))
    expect((await waiting).events[0].weather).not.toBeNull()
    expect((await newer).events[0].weather).not.toBeNull()
    expect(
      await prisma.eventWeather.count({ where: { journeyId: journey.id } })
    ).toBe(1)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it("serves members, denies outsiders before external calls and ignores submitted coordinates", async () => {
    const journey = await recorded()
    const fetch = vi.fn((url: URL) => Promise.resolve(archive(url)))
    vi.stubGlobal("fetch", fetch)
    setTestAuthContext(outsider)
    const request = new NextRequest("http://localhost/api/journeys/weather", {
      method: "POST",
      body: JSON.stringify({ latitude: 1 }),
    })
    const params = { params: Promise.resolve({ id: journey.id }) }
    expect((await weatherRoute(request, params)).status).toBe(404)
    expect(fetch).not.toHaveBeenCalled()
    await prisma.journeyMember.create({
      data: { journeyId: journey.id, userId: member.userId },
    })
    setTestAuthContext(member)
    const response = await weatherRoute(request, params)
    expect(response.status).toBe(200)
    expect(
      journeyWeatherResultSchema.parse(await response.json()).events[0].weather
    ).not.toBeNull()
    expect((fetch.mock.calls[0][0] as URL).searchParams.get("latitude")).toBe(
      "30.25"
    )
  })
  it("leaves a repeated hour empty until an explicit instant is given and clears it again", async () => {
    let journey = await recorded()
    const eventId = journey.events[0].id
    journey = await write(journey, {
      name: "event.update",
      eventId,
      patch: {
        date: "2025-11-02",
        time: "01:30",
        timeZone: "America/Los_Angeles",
      },
    })
    const fetch = vi.fn((url: URL) => Promise.resolve(archive(url)))
    vi.stubGlobal("fetch", fetch)
    expect(
      (await getJourneyWeather(owner, journey.id)).events[0].weather
    ).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
    for (const [startAt, matchedAt] of [
      ["2025-11-02T08:30:00.000Z", "2025-11-02T08:00:00.000Z"],
      ["2025-11-02T09:30:00.000Z", "2025-11-02T09:00:00.000Z"],
    ]) {
      journey = await write(journey, {
        name: "event.update",
        eventId,
        patch: { startAt },
      })
      expect(
        (await getJourneyWeather(owner, journey.id)).events[0].weather
      ).toMatchObject({ precision: "HOURLY", matchedAt })
    }
    journey = await write(journey, {
      name: "event.update",
      eventId,
      patch: { startAt: null },
    })
    expect(
      await prisma.eventWeather.count({ where: { journeyId: journey.id } })
    ).toBe(0)
    expect(
      (await getJourneyWeather(owner, journey.id)).events[0].weather
    ).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it("does not couple provider failure to content saves or cache a false result", async () => {
    let journey = await recorded()
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    expect(
      (await getJourneyWeather(owner, journey.id)).events[0].weather
    ).toBeNull()
    journey = await write(journey, {
      name: "event.update",
      eventId: journey.events[0].id,
      patch: { body: "继续记录" },
    })
    expect(journey.events[0].body).toBe("继续记录")
    expect(
      await prisma.eventWeather.count({ where: { journeyId: journey.id } })
    ).toBe(0)
  })
})
