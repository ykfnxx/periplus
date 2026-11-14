import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type {
  EventWeather,
  JourneySnapshot,
  JourneyWeatherResult,
} from "@/modules/data-model/contracts"
import {
  recordingApi,
  type RecordingApi,
} from "@/modules/travelogue/adapters/recording-http"
import { createRecordingStore } from "@/modules/travelogue/application/recording-session"
import WeatherStamp, {
  WeatherAttribution,
} from "@/modules/travelogue/ui/events/EventWeather"

const now = "2026-11-02T07:00:00Z"
const hourly: EventWeather = {
  provider: "open-meteo",
  precision: "HOURLY",
  weatherCode: 2,
  temperatureC: 22.2,
  matchedAt: "2026-10-18T00:00:00Z",
  fetchedAt: now,
}
function journey(): JourneySnapshot {
  return {
    id: "weather-journey",
    ownerId: "owner",
    role: "OWNER",
    revision: 1,
    title: "天气记录",
    description: "",
    status: "ACTIVE",
    visibility: "PRIVATE",
    createdAt: now,
    updatedAt: now,
    events: [
      {
        id: "event",
        source: { userId: "owner", name: "作者", image: null },
        title: "湖边",
        body: "原来的正文",
        category: "VISIT",
        date: "2026-10-18",
        time: "08:30",
        timeZone: "Asia/Shanghai",
        location: {
          name: "长桥",
          address: null,
          coordinates: { lng: 120.15, lat: 30.24, coordinateSystem: "GCJ02" },
        },
        photos: [],
        receipts: [],
        canEdit: true,
        canRemove: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
  }
}
function response(
  value: JourneySnapshot,
  weather: EventWeather | null = hourly
): JourneyWeatherResult {
  return {
    journeyId: value.id,
    revision: value.revision,
    events: [{ eventId: "event", weather }],
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function client(value: JourneySnapshot): RecordingApi {
  return {
    ...recordingApi,
    get: vi.fn(async () => structuredClone(value)),
    weather: vi.fn(async () => response(value)),
    command: vi.fn(async () => ({
      journey: structuredClone(value),
      replayed: false,
    })),
  }
}
afterEach(cleanup)

describe("independent event weather", () => {
  it("finishes load and save while the weather request is pending", async () => {
    const value = journey()
    const pending = deferred<JourneyWeatherResult>()
    const api = client(value)
    api.weather = vi.fn(() => pending.promise)
    const store = createRecordingStore(value.id, api)
    await store.getState().load()
    expect(store.getState().loading).toBe(false)
    expect(store.getState().journey?.id).toBe(value.id)
    const saved = { ...value, revision: 2 }
    api.command = vi.fn(async () => ({ journey: saved, replayed: false }))
    await store.getState().mutate({
      name: "event.update",
      eventId: "event",
      patch: { body: "已保存" },
    })
    expect(store.getState().journey?.revision).toBe(2)
    expect(store.getState().saving).toBe(0)
    store.getState().dispose()
    pending.resolve(response(saved))
  })

  it("withdraws changed input immediately and rejects late revisions or other journeys", async () => {
    const value = journey()
    const api = client(value)
    const store = createRecordingStore(value.id, api)
    await store.getState().load()
    expect(store.getState().weather.event).toEqual(hourly)
    const second = {
      ...value,
      revision: 2,
      events: value.events.map((event) => ({
        ...event,
        location: {
          ...event.location!,
          coordinates: {
            lng: 121.47,
            lat: 31.23,
            coordinateSystem: "GCJ02" as const,
          },
        },
      })),
    }
    const third = {
      ...second,
      revision: 3,
      events: second.events.map((event) => ({
        ...event,
        date: "2026-10-19",
        time: "10:00",
      })),
    }
    const old = deferred<JourneyWeatherResult>()
    const current = deferred<JourneyWeatherResult>()
    api.weather = vi
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(current.promise)
    api.command = vi
      .fn()
      .mockResolvedValueOnce({ journey: second, replayed: false })
      .mockResolvedValueOnce({ journey: third, replayed: false })
    await store.getState().mutate({
      name: "event.update",
      eventId: "event",
      patch: { location: second.events[0].location },
    })
    expect(store.getState().weather.event).toBeUndefined()
    await store.getState().mutate({
      name: "event.update",
      eventId: "event",
      patch: { date: "2026-10-19", time: "10:00" },
    })
    old.resolve(response(second, { ...hourly, temperatureC: 8 }))
    await old.promise
    expect(store.getState().weather.event).toBeUndefined()
    current.resolve(response(third, { ...hourly, temperatureC: 4 }))
    await current.promise
    expect(store.getState().weather.event?.precision).toBe("HOURLY")
    expect(store.getState().weather.event).toMatchObject({ temperatureC: 4 })
    api.get = vi.fn(async () => third)
    api.weather = vi.fn(async () => ({
      ...response(third),
      journeyId: "another-journey",
    }))
    await store.getState().load()
    expect(store.getState().weather.event).toMatchObject({ temperatureC: 4 })
    store.getState().dispose()
  })

  it("keeps valid weather through a body-only save, then honors an unavailable result", async () => {
    const value = journey()
    const api = client(value)
    const store = createRecordingStore(value.id, api)
    await store.getState().load()
    const pending = deferred<JourneyWeatherResult>()
    const saved = {
      ...value,
      revision: 2,
      events: value.events.map((event) => ({ ...event, body: "新正文" })),
    }
    api.weather = vi.fn(() => pending.promise)
    api.command = vi.fn(async () => ({ journey: saved, replayed: false }))
    await store.getState().mutate({
      name: "event.update",
      eventId: "event",
      patch: { body: "新正文" },
    })
    expect(store.getState().weather.event).toEqual(hourly)
    pending.resolve(response(saved, null))
    await pending.promise
    expect(store.getState().weather.event).toBeNull()
    store.getState().dispose()
  })

  it("keeps weather failures separate from reading and saving errors", async () => {
    const value = journey()
    const api = client(value)
    api.weather = vi.fn().mockRejectedValue(new Error("weather unavailable"))
    const store = createRecordingStore(value.id, api)
    await store.getState().load()
    await store.getState().mutate({
      name: "event.update",
      eventId: "event",
      patch: { body: "保存成功" },
    })
    expect(store.getState()).toMatchObject({
      loading: false,
      saving: 0,
      error: null,
      conflict: false,
      weather: {},
    })
    expect(api.weather).toHaveBeenCalledTimes(2)
    store.getState().dispose()
  })

  it("ignores a weather response after the page store is disposed", async () => {
    const value = journey()
    const pending = deferred<JourneyWeatherResult>()
    const api = client(value)
    api.weather = vi.fn(() => pending.promise)
    const store = createRecordingStore(value.id, api)
    await store.getState().load()
    store.getState().dispose()
    pending.resolve(response(value))
    await pending.promise
    expect(store.getState().weather).toEqual({})
  })
})

describe("static weather presentation", () => {
  it("shows zero and unknown conditions without inventing weather; source details stay behind the weather trigger", () => {
    const { container, rerender } = render(
      <WeatherStamp weather={{ ...hourly, temperatureC: 0 }} />
    )
    expect(screen.getByText("约0°C")).toBeTruthy()
    expect(container.textContent).toContain("多云")
    expect(
      screen.getByRole("button", { name: "天气数据来源与许可" })
    ).toBeTruthy()
    expect(container.querySelector("a")).toBeNull()
    rerender(
      <WeatherStamp
        weather={{ ...hourly, weatherCode: 42, temperatureC: -12.4 }}
      />
    )
    expect(container.textContent).toBe("约-12°C")
  })
  it("shows a whole-day range instead of a guessed hourly temperature", () => {
    const { container } = render(
      <WeatherStamp
        weather={{
          provider: "open-meteo",
          precision: "DAILY",
          weatherCode: 2,
          temperatureMinC: -8.3,
          temperatureMaxC: -2.1,
          fetchedAt: now,
        }}
      />
    )
    expect(container.textContent).toBe("当日-8–-2°C")
    expect(container.textContent).not.toContain("多云")
    expect(
      screen.getByRole("button", { name: "天气数据来源与许可" })
    ).toBeTruthy()
    expect(container.querySelector("a")).toBeNull()
  })
  it("omits absent weather and keeps provider attribution as separate source links", () => {
    const { container, rerender } = render(
      <>
        <WeatherStamp weather={null} />
        <WeatherAttribution weather={null} />
      </>
    )
    expect(container.textContent).toBe("")
    rerender(<WeatherAttribution weather={hourly} />)
    expect(
      screen.getByRole("link", { name: "Open-Meteo" }).getAttribute("href")
    ).toBe("https://open-meteo.com/")
    expect(
      screen.getByRole("link", { name: "CC BY 4.0" }).getAttribute("href")
    ).toBe("https://open-meteo.com/en/licence")
  })
})

it("opens the weather source on focus while retaining the displayed weather", async () => {
  render(<WeatherStamp weather={hourly} />)
  act(() => screen.getByRole("button", { name: "天气数据来源与许可" }).focus())
  expect(await screen.findByRole("link", { name: "Open-Meteo" })).toBeTruthy()
  expect(screen.getByText("约22°C")).toBeTruthy()
})

it("returns keyboard focus to the weather trigger after closing its source links", async () => {
  render(<WeatherStamp weather={hourly} />)
  const trigger = screen.getByRole("button", { name: "天气数据来源与许可" })
  fireEvent.click(trigger)
  const link = await screen.findByRole("link", { name: "Open-Meteo" })
  act(() => link.focus())
  fireEvent.keyDown(link, { key: "Escape" })
  await waitFor(() =>
    expect(screen.queryByRole("link", { name: "Open-Meteo" })).toBeNull()
  )
  expect(trigger).toHaveFocus()
})
