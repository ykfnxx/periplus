import { describe, expect, it } from "vitest"
import { journeySnapshotSchema } from "@/modules/data-model/contracts"
import { paperCardJourney } from "@/tests/storybook/paper-card-fixture"
import {
  eventCardTitle,
  eventCardTimes,
  eventCity,
  eventTransitDisplay,
} from "@/modules/travelogue/ui/event-card-display"

const transit = paperCardJourney.events[1]

describe("event card facts", () => {
  it("does not repeat an untitled note body as its heading", () => {
    expect(eventCardTitle({ ...paperCardJourney.events[3], title: "" })).toBe(
      "游览"
    )
  })
  it("shows only declared city information, never a detailed place or address", () => {
    const event = paperCardJourney.events[0]
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
      range: "10:20–11:00",
    })
    expect(
      eventCardTimes({
        ...transit,
        time: "23:20",
        planning: {
          startAt: "2026-10-18T23:20:00+08:00",
          endAt: "2026-10-19T01:00:00+08:00",
        },
      }).arrival
    ).toBe("10月19日 01:00")
  })

  it("does not invent an arrival from route duration or mix planned end with an actual departure", () => {
    expect(
      eventCardTimes({ ...transit, planning: undefined }).arrival
    ).toBeNull()
    expect(
      eventCardTimes({ ...transit, actualStartAt: "2026-10-18T10:35:00+08:00" })
        .arrival
    ).toBeNull()
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

  it("keeps the rendered design fixture on the production journey contract", () => {
    expect(
      journeySnapshotSchema
        .parse(paperCardJourney)
        .events.map((event) => event.id)
    ).toEqual(["lake", "bus", "temple", "unlocated"])
  })
})

it("calculates an overnight duration from the entered dates rather than provider ETA", () => {
  const event = {
    ...transit,
    planning: {
      startAt: "2026-10-18T23:20:00+08:00",
      endAt: "2026-10-19T01:00:00+08:00",
      durationMinutes: 2,
    },
  }
  expect(eventTransitDisplay(event).duration).toBe("1 小时 40 分钟")
  expect(
    eventTransitDisplay({
      ...event,
      planning: { startAt: event.planning.startAt, durationMinutes: 2 },
    }).duration
  ).toBeNull()
  expect(
    eventTransitDisplay({
      ...event,
      planning: {
        startAt: event.planning.startAt,
        endAt: event.planning.startAt,
      },
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
