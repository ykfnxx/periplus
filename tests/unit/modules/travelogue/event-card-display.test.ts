import { describe, expect, it } from "vitest"
import { journeySnapshotSchema } from "@/modules/data-model/contracts"
import { eventCardJourney } from "@/tests/fixtures/event-card"
import {
  eventCardTitle,
  eventCardTimes,
  eventCity,
  eventTransitDisplay,
} from "@/modules/travelogue/ui/event-card-display"

const transit = eventCardJourney.events[1]

describe("event card facts", () => {
  it("does not repeat an untitled note body as its heading", () => {
    expect(eventCardTitle({ ...eventCardJourney.events[3], title: "" })).toBe(
      "游览"
    )
  })
  it("shows only declared city information, never a detailed place or address", () => {
    const event = eventCardJourney.events[0]
    expect(eventCity(event)).toBe("杭州")
    expect(
      eventCity({ ...event, location: { ...event.location!, city: undefined } })
    ).toBeNull()
    expect(eventCity(undefined)).toBeNull()
  })

  it("uses event-local times and marks an overnight arrival with its date", () => {
    expect(eventCardTimes(transit)).toEqual({
      departure: "10:20",
      arrival: "11:00",
      arrivalDate: null,
      arrivalDays: 0,
      range: "10:20–11:00",
    })
    expect(
      eventCardTimes({
        ...transit,
        time: "23:20",
        startAt: "2026-10-18T23:20:00+08:00",
        endAt: "2026-10-19T01:00:00+08:00",
      })
    ).toMatchObject({ arrival: "01:00", arrivalDate: "10月19日" })
  })

  it("does not invent an arrival from route duration", () => {
    expect(eventCardTimes({ ...transit, endAt: undefined }).arrival).toBeNull()
  })

  it("labels instants without a timezone as UTC", () => {
    const result = eventCardTimes({ ...transit, time: null, timeZone: null })
    expect(result.departure).toBe("02:20 UTC")
    expect(result.arrival).toBe("03:00 UTC")
  })

  it("uses the selected READY route and hides stale provider facts", () => {
    expect(eventTransitDisplay(transit)).toEqual({
      mode: "公交",
      duration: "40 分钟",
      distance: "6.5 公里",
      line: "7路",
    })
    expect(
      eventTransitDisplay({
        ...transit,
        transit: {
          ...transit.transit!,
          routeState: "ROUTE_STALE",
          route: undefined,
        },
      })
    ).toEqual({
      mode: "公交",
      duration: "40 分钟",
      distance: "6.5 公里",
      line: null,
    })
  })

  it("keeps event card inputs on the production journey contract", () => {
    expect(
      journeySnapshotSchema
        .parse(eventCardJourney)
        .events.map((event) => event.id)
    ).toEqual(["lake", "bus", "temple", "unlocated"])
  })
})

it("keeps an end-only clock explicit and does not invent a departure", () => {
  expect(
    eventCardTimes({
      ...transit,
      time: null,
      startAt: undefined,
      endAt: "2026-10-18T11:00:00+08:00",
    })
  ).toMatchObject({ departure: null, arrival: "11:00", range: "至 11:00" })
})

it("uses the event's single interval for its clocks and duration", () => {
  const event = {
    ...transit,
    time: "14:30",
    startAt: "2026-10-18T14:30:00+08:00",
    endAt: "2026-10-18T15:00:00+08:00",
  }
  expect(eventCardTimes(event)).toMatchObject({
    departure: "14:30",
    arrival: "15:00",
    range: "14:30–15:00",
  })
  expect(eventTransitDisplay(event).duration).toBe("30 分钟")
})

it("calculates an overnight duration from the entered dates rather than provider ETA", () => {
  const event = {
    ...transit,
    time: "23:20",
    startAt: "2026-10-18T23:20:00+08:00",
    endAt: "2026-10-19T01:00:00+08:00",
    planning: { durationMinutes: 2 },
  }
  expect(eventTransitDisplay(event).duration).toBe("1 小时 40 分钟")
  expect(
    eventTransitDisplay({
      ...event,
      endAt: undefined,
    }).duration
  ).toBeNull()
  expect(
    eventTransitDisplay({
      ...event,
      endAt: event.startAt,
    }).duration
  ).toBe("0 分钟")
})

it("shows an explicitly entered zero distance and hides an absent distance", () => {
  expect(
    eventTransitDisplay({
      ...transit,
      transit: { ...transit.transit!, distanceMeters: 0 },
    }).distance
  ).toBe("0 米")
  expect(
    eventTransitDisplay({
      ...transit,
      transit: { ...transit.transit!, distanceMeters: undefined },
    }).distance
  ).toBeNull()
})

it("counts transit day offsets by local calendar dates across month and DST boundaries", () => {
  expect(
    eventCardTimes({
      ...transit,
      date: "2025-11-01",
      time: "23:30",
      timeZone: "America/Los_Angeles",
      startAt: "2025-11-02T06:30:00Z",
      endAt: "2025-11-03T08:30:00Z",
    }).arrivalDays
  ).toBe(2)
  expect(
    eventCardTimes({
      ...transit,
      date: "2026-10-31",
      time: "23:30",
      timeZone: "Asia/Shanghai",
      startAt: "2026-10-31T15:30:00Z",
      endAt: "2026-10-31T17:30:00Z",
    }).arrivalDays
  ).toBe(1)
  expect(eventCardTimes({ ...transit, endAt: undefined }).arrivalDays).toBe(0)
})
