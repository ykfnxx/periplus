import { expect, it } from "vitest"
import { createStoryRecordingApi } from "@/modules/travelogue/ui/recording-story-data"
import { journeyWithDetails } from "@/tests/storybook/journey-fixtures"

it("updates a hotel note without replacing its resolved facts", async () => {
  const api = createStoryRecordingApi(false, 0, journeyWithDetails)
  const before = await api.get("hangzhou")
  const original = before.events.find((event) => event.hotel)!
  const { journey } = await api.command(before.id, {
    expectedRevision: before.revision,
    idempotencyKey: "hotel-note",
    command: {
      name: "event.update",
      eventId: original.id,
      patch: { hotel: { checkInNote: "晚些时候入住" } },
    },
  })
  expect(
    journey.events.find((event) => event.id === original.id)?.hotel
  ).toEqual({
    ...original.hotel,
    checkInNote: "晚些时候入住",
  })
})

it("retains a route when changing notes and invalidates it when an endpoint changes", async () => {
  const api = createStoryRecordingApi(false, 0, journeyWithDetails)
  const before = await api.get("hangzhou")
  const original = before.events.find((event) => event.transit)!
  const first = await api.command(before.id, {
    expectedRevision: before.revision,
    idempotencyKey: "transit-note",
    command: {
      name: "event.update",
      eventId: original.id,
      patch: { transit: { notes: "带着行李" } },
    },
  })
  expect(
    first.journey.events.find((event) => event.id === original.id)?.transit
  ).toEqual({ ...original.transit, notes: "带着行李" })
  const second = await api.command(before.id, {
    expectedRevision: first.journey.revision,
    idempotencyKey: "transit-endpoint",
    command: {
      name: "event.update",
      eventId: original.id,
      patch: { transit: { toEventId: "hangzhou-return" } },
    },
  })
  expect(
    second.journey.events.find((event) => event.id === original.id)?.transit
  ).toEqual({
    ...original.transit,
    toEventId: "hangzhou-return",
    notes: "带着行李",
    routeState: "ROUTE_STALE",
    route: undefined,
  })
})

it("rejects a note without hotel facts or an incomplete transit without adding a record", async () => {
  const api = createStoryRecordingApi(false, 0, journeyWithDetails)
  const before = await api.get("hangzhou")
  for (const [key, content] of [
    ["hotel", { category: "STAY" as const, hotel: { checkInNote: "晚到" } }],
    [
      "transit",
      { category: "TRANSIT" as const, transit: { notes: "明天出发" } },
    ],
  ] as const) {
    await expect(
      api.command(before.id, {
        expectedRevision: before.revision,
        idempotencyKey: key,
        command: { name: "event.add", afterEventId: null, content },
      })
    ).rejects.toMatchObject({ status: 400 })
  }
  expect(await api.get(before.id)).toEqual(before)
})

it("creates complete manual transit details without resolved route geometry", async () => {
  const api = createStoryRecordingApi(false, 0, journeyWithDetails)
  const before = await api.get("hangzhou")
  const { journey, eventId } = await api.command(before.id, {
    expectedRevision: before.revision,
    idempotencyKey: "new-transit",
    command: {
      name: "event.add",
      afterEventId: before.events.at(-1)!.id,
      content: {
        title: "回程",
        category: "TRANSIT",
        transit: {
          fromEventId: "shanghai-walk",
          toEventId: "hangzhou-return",
          transportMode: "TRAIN",
        },
      },
    },
  })
  expect(journey.events.at(-1)?.id).toBe(eventId)
  expect(journey.events.at(-1)?.transit).toEqual({
    fromEventId: "shanghai-walk",
    toEventId: "hangzhou-return",
    transportMode: "TRAIN",
    routeState: "EMPTY",
    route: undefined,
  })
})
