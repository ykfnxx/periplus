import { describe, it, expect } from "vitest"
import {
  journeySnapshotSchema,
  eventContentSchema,
  journeyMutationSchema,
  transitRouteSchema,
} from "@/modules/data-model/contracts"
import {
  journeyFixture,
  eventFixture,
  transitJourneyFixture,
} from "@/tests/fixtures/journey"
describe("one Journey event contract", () => {
  it("retains dated manual records alongside planned events in array order", () => {
    const journey = transitJourneyFixture()
    journey.events.push(eventFixture("note"))
    const parsed = journeySnapshotSchema.parse(journey)
    expect(parsed.events.at(-1)).toMatchObject({
      category: "VISIT",
      date: "2026-10-29",
      time: null,
      location: null,
    })
    expect(parsed.events.map((event) => event.id)).toEqual(
      journey.events.map((event) => event.id)
    )
  })
  it("rejects duplicate ids, old containers and parent membership", () => {
    const journey = journeyFixture()
    journey.events = [eventFixture("a"), eventFixture("a")]
    expect(journeySnapshotSchema.safeParse(journey).success).toBe(false)
    journey.events = [
      { ...eventFixture("a"), parentSectionEventId: "city" } as never,
    ]
    expect(journeySnapshotSchema.safeParse(journey).success).toBe(false)
    expect(
      eventContentSchema.safeParse({ ...eventFixture("a"), category: "CITY" })
        .success
    ).toBe(false)
  })
  it("requires server assigned sources and permissions and keeps them out of mutations", () => {
    const journey = journeyFixture()
    journey.events = [eventFixture("a")]
    delete (journey.events[0] as Partial<(typeof journey.events)[number]>)
      .source
    expect(journeySnapshotSchema.safeParse(journey).success).toBe(false)
    expect(
      journeyMutationSchema.safeParse({
        expectedRevision: 1,
        idempotencyKey: "key",
        command: {
          name: "event.update",
          eventId: "a",
          patch: { source: { userId: "forged" } },
        },
      }).success
    ).toBe(false)
  })
  it("rejects provider identities, hotel offers and route geometry in client mutations", () => {
    for (const patch of [
      { planning: { provider: "forged" } },
      { hotel: { providerHotelId: "forged" } },
      { transit: { routeState: "READY", route: {} } },
    ])
      expect(
        journeyMutationSchema.safeParse({
          expectedRevision: 1,
          idempotencyKey: "key",
          command: { name: "event.update", eventId: "event", patch },
        }).success
      ).toBe(false)
  })
  it("stores exactly one selected route and validates its validity timestamps", () => {
    const route = transitJourneyFixture().events[1]!.transit!.route!
    expect(transitRouteSchema.parse(route).plans).toHaveLength(1)
    expect(
      transitRouteSchema.safeParse({
        ...route,
        plans: [...route.plans, ...route.plans],
      }).success
    ).toBe(false)
    route.plans[0]!.validUntil = "2020-01-01T00:00:00.000Z"
    expect(transitRouteSchema.safeParse(route).success).toBe(false)
  })
  it("requires dates in snapshots and new records, and rejects clearing them", () => {
    const request = (command: unknown) => ({
      expectedRevision: 1,
      idempotencyKey: "key",
      command,
    })
    for (const content of [{}, { date: null }, { date: "2026-02-30" }])
      expect(
        journeyMutationSchema.safeParse(
          request({ name: "event.add", afterEventId: null, content })
        ).success
      ).toBe(false)
    expect(
      journeyMutationSchema.safeParse(
        request({
          name: "event.add",
          afterEventId: null,
          content: { date: "2026-10-29" },
        })
      ).success
    ).toBe(true)
    expect(
      journeyMutationSchema.safeParse(
        request({
          name: "event.update",
          eventId: "a",
          patch: { body: "changed" },
        })
      ).success
    ).toBe(true)
    expect(
      journeyMutationSchema.safeParse(
        request({ name: "event.update", eventId: "a", patch: { date: null } })
      ).success
    ).toBe(false)
    for (const category of [null, "ACTIVITY", "CITY"])
      expect(
        journeyMutationSchema.safeParse(
          request({
            name: "event.add",
            afterEventId: null,
            content: { date: "2026-10-29", category },
          })
        ).success
      ).toBe(false)
    const journey = journeyFixture()
    journey.events = [{ ...eventFixture("a"), date: null } as never]
    expect(journeySnapshotSchema.safeParse(journey).success).toBe(false)
  })
  it("stores standalone transit endpoint names without linked events", () => {
    const journey = journeyFixture()
    journey.events = [
      {
        ...eventFixture("train"),
        category: "TRANSIT",
        transit: {
          fromName: "杭州东站",
          toName: "上海虹桥站",
          transportMode: "TRAIN",
          routeState: "EMPTY",
          distanceMeters: 0,
        },
      },
    ]
    expect(
      journeySnapshotSchema.parse(journey).events[0]!.transit
    ).toMatchObject({ fromName: "杭州东站", toName: "上海虹桥站" })
    journey.events[0]!.transit!.distanceMeters = -1
    expect(journeySnapshotSchema.safeParse(journey).success).toBe(false)
    journey.events[0]!.transit!.distanceMeters = 0
    journey.events[0]!.transit!.fromName = " "
    expect(journeySnapshotSchema.safeParse(journey).success).toBe(false)
  })
  it.each(["startAt", "endAt"] as const)(
    "allows clearing %s in input while snapshots omit it",
    (field) => {
      expect(
        journeyMutationSchema.safeParse({
          expectedRevision: 1,
          idempotencyKey: "key",
          command: {
            name: "event.update",
            eventId: "a",
            patch: { planning: { [field]: null } },
          },
        }).success
      ).toBe(true)
      const journey = journeyFixture()
      journey.events = [
        { ...eventFixture("a"), planning: { [field]: null } } as never,
      ]
      expect(journeySnapshotSchema.safeParse(journey).success).toBe(false)
    }
  )
})
