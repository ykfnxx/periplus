// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import type { JourneyEvent } from "@/modules/data-model/contracts"
import { eventFixture } from "@/tests/fixtures/journey"
import { wgs84ToGcj02 } from "@/lib/journeys/coordinates"
import {
  eventWeatherInput,
  localWeatherTime,
} from "@/modules/data/weather/weather-input"
import { fetchEventWeather } from "@/modules/data/weather/open-meteo"

const event = (date = "2025-03-09", time: string | null = "03:30") => ({
  ...eventFixture("weather"),
  date,
  time,
  timeZone: "America/Los_Angeles",
  location: {
    name: "地点",
    address: null,
    coordinates: {
      lng: -118.25,
      lat: 34.05,
      coordinateSystem: "WGS84" as NonNullable<
        NonNullable<JourneyEvent["location"]>["coordinates"]
      >["coordinateSystem"],
    },
  },
})
function hours(start: string, count: number) {
  return {
    hourly: {
      time: Array.from(
        { length: count },
        (_, index) => Date.parse(start) / 1000 + index * 3600
      ),
      temperature_2m: Array.from({ length: count }, (_, index) => index),
      weather_code: Array.from({ length: count }, () => 2),
    },
  }
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
describe("event weather input and archive matching", () => {
  it("normalizes GCJ02/BD09 boundaries and preserves raw event coordinates", () => {
    const original = event()
    const [lng, lat] = wgs84ToGcj02(120.15, 30.25)
    original.location.coordinates = {
      lng,
      lat,
      coordinateSystem: "GCJ02",
    }
    const copy = structuredClone(original)
    const input = eventWeatherInput(original)!
    expect(input.longitude).toBeCloseTo(120.15, 4)
    expect(input.latitude).toBeCloseTo(30.25, 4)
    expect(original).toEqual(copy)
    original.location.coordinates = {
      lng: 120.1565,
      lat: 30.256,
      coordinateSystem: "BD09",
    }
    expect(eventWeatherInput(original)!.longitude).toBeLessThan(120.1565)
  })
  it.each([
    ["2025-03-09", "03:30", "2025-03-09T10:30:00.000Z"],
    ["2025-11-02", "02:30", "2025-11-02T10:30:00.000Z"],
  ])(
    "matches %s %s using the event zone, not the server zone",
    (date, time, instant) => {
      const input = eventWeatherInput(event(date, time))!
      expect(input.instant).toBe(Date.parse(instant))
      expect(localWeatherTime(input.instant!, input.timeZone)).toBe(
        `${date}T${time}`
      )
    }
  )
  it("uses an explicit repeated-hour instant and leaves skipped hours unmatched", () => {
    expect(eventWeatherInput(event("2025-11-02", "01:30"))).toBeNull()
    for (const startAt of [
      "2025-11-02T08:30:00.000Z",
      "2025-11-02T09:30:00.000Z",
    ]) {
      const repeated = {
        ...event("2025-11-02", "01:30"),
        startAt,
      }
      expect(eventWeatherInput(repeated)!.instant).toBe(Date.parse(startAt))
    }
    expect(eventWeatherInput(event("2025-03-09", "02:30"))).toBeNull()
    expect(eventWeatherInput({ ...event(), timeZone: null })).toBeNull()
    expect(eventWeatherInput({ ...event(), location: null })).toBeNull()
    expect(eventWeatherInput({ ...event(), category: "TRANSIT" })).toBeNull()
  })
  it("accepts historical timezone offsets containing seconds without breaking record saves", () => {
    const input = eventWeatherInput({
      ...event("1960-01-01", "12:00"),
      timeZone: "Africa/Monrovia",
    })!
    expect(input.instant).toBe(Date.parse("1960-01-01T12:44:30.000Z"))
  })
  it("keeps weather identity independent of body, attachment and order metadata", () => {
    const before = event()
    expect(
      eventWeatherInput({
        ...before,
        body: "编辑",
        updatedAt: new Date().toISOString(),
      })!.key
    ).toBe(eventWeatherInput(before)!.key)
    expect(eventWeatherInput({ ...before, date: "2025-03-10" })!.key).not.toBe(
      eventWeatherInput(before)!.key
    )
    expect(eventWeatherInput({ ...before, time: null })!.instant).toBeNull()
  })
  it("reads UTC Unix hours and preserves genuine zero temperature and code", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        hourly: {
          time: [Date.parse("2025-03-09T10:00:00Z") / 1000],
          temperature_2m: [0],
          weather_code: [0],
        },
      })
    )
    vi.stubGlobal("fetch", fetch)
    const result = await fetchEventWeather(eventWeatherInput(event())!)
    expect(result).toMatchObject({
      precision: "HOURLY",
      temperatureC: 0,
      weatherCode: 0,
      matchedAt: "2025-03-09T10:00:00.000Z",
    })
    const url = fetch.mock.calls[0][0] as URL
    expect(url.origin).toBe("https://archive-api.open-meteo.com")
    expect(url.searchParams.get("timeformat")).toBe("unixtime")
    expect(url.searchParams.get("timezone")).toBe("GMT")
  })
  it.each([
    ["2025-03-09", "2025-03-08T00:00:00Z", 8, 30],
    ["2025-11-02", "2025-11-01T00:00:00Z", 7, 31],
  ])(
    "aggregates the actual local day %s across DST",
    async (date, start, utcStart, utcEnd) => {
      const data = hours(start, 72)
      // Values are UTC hour indexes; the local civil day crosses the UTC date.
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(data)))
      const dayOffset = 24
      const result = await fetchEventWeather(
        eventWeatherInput(event(date, null))!
      )
      expect(result).toMatchObject({
        precision: "DAILY",
        temperatureMinC: dayOffset + utcStart,
        temperatureMaxC: dayOffset + utcEnd,
      })
    }
  )
  it("leaves unavailable, null, malformed and future data empty without fallback or retries", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        hourly: {
          time: [Date.parse("2025-03-09T10:00:00Z") / 1000],
          temperature_2m: [null],
          weather_code: [2],
        },
      })
    )
    vi.stubGlobal("fetch", fetch)
    expect(await fetchEventWeather(eventWeatherInput(event())!)).toBeNull()
    fetch.mockResolvedValueOnce(
      Response.json({
        hourly: { time: [1], temperature_2m: [], weather_code: [] },
      })
    )
    expect(await fetchEventWeather(eventWeatherInput(event())!)).toBeNull()
    fetch.mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
    expect(await fetchEventWeather(eventWeatherInput(event())!)).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(
      await fetchEventWeather(eventWeatherInput(event("2099-01-01"))!)
    ).toBeNull()
    expect(
      await fetchEventWeather(
        eventWeatherInput(event("2025-03-09", null))!,
        Date.parse("2025-03-09T20:00:00Z")
      )
    ).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(3)
  })
  it("bounds a stalled external request and returns no weather", async () => {
    vi.stubEnv("PERIPLUS_WEATHER_TIMEOUT_MS", "5")
    const fetch = vi.fn(
      (_url: URL, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true }
          )
        })
    )
    vi.stubGlobal("fetch", fetch)
    expect(await fetchEventWeather(eventWeatherInput(event())!)).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
