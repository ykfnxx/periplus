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
  it("retains incomplete manual records alongside planned events in array order", () => {
    const journey = transitJourneyFixture()
    journey.events.push(eventFixture("note"))
    const parsed = journeySnapshotSchema.parse(journey)
    expect(parsed.events.at(-1)).toMatchObject({
      category: null,
      date: null,
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
})
