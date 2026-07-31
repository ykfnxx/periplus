import { describe, expect, it } from "vitest"
import {
  DraftInputError,
  DraftSessionService,
} from "@/modules/workspace/server/draft-session-service"
import type { JourneyInput } from "@/types/journey"

function journey(): JourneyInput {
  return {
    id: "journey",
    title: "命令测试",
    status: "DRAFT",
    events: [
      {
        id: "section-a",
        type: "SECTION",
        origin: "ORIGINAL",
        title: "第一天",
        detail: { kind: "DAY" },
      },
      {
        id: "section-b",
        type: "SECTION",
        origin: "ORIGINAL",
        title: "第二天",
        detail: { kind: "DAY" },
      },
      {
        id: "visit-a",
        parentEventId: "section-a",
        type: "VISIT",
        executionStatus: "PLANNED",
        origin: "ORIGINAL",
        title: "A",
        detail: { plannedLat: 30, plannedLng: 120 },
      },
      {
        id: "visit-b",
        parentEventId: "section-b",
        type: "VISIT",
        executionStatus: "PLANNED",
        origin: "ORIGINAL",
        title: "B",
        detail: { plannedLat: 31, plannedLng: 121 },
      },
    ],
    links: [
      {
        id: "top-link",
        fromEventId: "section-a",
        toEventId: "section-b",
        kind: "MAIN",
      },
    ],
  }
}

describe("DraftSessionService JourneyEvent commands", () => {
  it("rejects removing a non-empty SECTION without cascade", () => {
    const service = new DraftSessionService()
    service.replaceDraft("session", journey())
    expect(() =>
      service.journeyRemoveEvent("session", {
        expectedRevision: 1,
        idempotencyKey: "reject-remove-section-a",
        eventId: "section-a",
      })
    ).toThrowError("Event has children; set cascade to remove them")

    const snapshot = service.journeyRemoveEvent("session", {
      expectedRevision: 1,
      idempotencyKey: "cascade-remove-section-a",
      eventId: "section-a",
      cascade: true,
    })
    expect(snapshot.document?.events.map((event) => event.id)).toEqual([
      "section-b",
      "visit-b",
    ])
  })

  it("clears planned and actual transit endpoints removed by cascade", () => {
    const service = new DraftSessionService()
    const input = journey()
    input.events.push({
      id: "transit",
      type: "TRANSIT",
      executionStatus: "PLANNED",
      origin: "ORIGINAL",
      title: "跨日交通",
      detail: {
        transportMode: "CAR",
        plannedFromEventId: "section-a",
        plannedToEventId: "section-b",
        actualFromEventId: "section-a",
        actualToEventId: "section-b",
      },
    })
    input.links = [
      {
        id: "top-link-a",
        fromEventId: "section-a",
        toEventId: "transit",
        kind: "MAIN",
      },
      {
        id: "top-link-b",
        fromEventId: "transit",
        toEventId: "section-b",
        kind: "MAIN",
      },
    ]
    service.replaceDraft("session", input)

    const snapshot = service.journeyRemoveEvent("session", {
      expectedRevision: 1,
      idempotencyKey: "remove-transit-endpoint",
      eventId: "section-a",
      cascade: true,
    })
    const transit = snapshot.document?.events.find(
      (event) => event.id === "transit"
    )
    expect(transit?.type).toBe("TRANSIT")
    if (transit?.type !== "TRANSIT") return
    expect(transit.detail.plannedFromEventId).toBeUndefined()
    expect(transit.detail.actualFromEventId).toBeUndefined()
    expect(transit.detail.plannedToEventId).toBe("section-b")
    expect(transit.detail.actualToEventId).toBe("section-b")
  })

  it("moves an event across scopes and reconnects topology atomically", () => {
    const service = new DraftSessionService()
    service.replaceDraft("session", journey())
    const snapshot = service.journeyMoveEvent("session", {
      expectedRevision: 1,
      idempotencyKey: "move-visit-a",
      eventId: "visit-a",
      position: { placement: "after", eventId: "visit-b" },
    })
    const moved = snapshot.document?.events.find(
      (event) => event.id === "visit-a"
    )
    expect(moved?.parentEventId).toBe("section-b")
    expect(snapshot.document?.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromEventId: "visit-b",
          toEventId: "visit-a",
          kind: "MAIN",
        }),
      ])
    )
  })

  it("deduplicates commands by idempotency key before revision checks", async () => {
    const service = new DraftSessionService()
    service.replaceDraft("session", journey())
    await expect(
      service.callTool("session", "journey.remove_event", {
        expectedRevision: 1,
        eventId: "visit-a",
      })
    ).rejects.toThrowError("idempotencyKey is required")
    await expect(
      service.callTool("session", "journey.remove_event", {
        idempotencyKey: "missing-revision",
        eventId: "visit-a",
      })
    ).rejects.toThrowError("expectedRevision is required")
    const input = {
      expectedRevision: 1,
      idempotencyKey: "add-meal",
      event: {
        id: "meal-a",
        type: "MEAL" as const,
        executionStatus: "PLANNED" as const,
        origin: "AGENT_INSERTED" as const,
        title: "午餐",
        detail: { plannedLat: 30, plannedLng: 120 },
      },
      position: { placement: "end" as const, parentEventId: "section-a" },
    }

    const first = await service.callTool("session", "journey.add_event", input)
    const retry = await service.callTool("session", "journey.add_event", input)
    expect(first.revision).toBe(2)
    expect(retry.revision).toBe(2)
    expect(
      retry.document?.events.filter((event) => event.id === "meal-a")
    ).toHaveLength(1)

    await expect(
      service.callTool("session", "journey.add_event", {
        ...input,
        idempotencyKey: "different-key",
      })
    ).rejects.toBeInstanceOf(DraftInputError)
  })

  it("preserves the old event and installs a stable-id replacement", () => {
    const service = new DraftSessionService()
    service.replaceDraft("session", journey())
    const snapshot = service.journeyReplaceEvent("session", {
      expectedRevision: 1,
      idempotencyKey: "replace-visit-a",
      eventId: "visit-a",
      replacement: {
        id: "note-a",
        type: "NOTE",
        origin: "AGENT_INSERTED",
        title: "改为自由时间",
        detail: { body: "视体力调整" },
      },
    })
    const old = snapshot.document?.events.find(
      (event) => event.id === "visit-a"
    )
    expect(old?.replacedByEventId).toBe("note-a")
    expect(old?.executionStatus).toBe("CANCELLED")
    expect(
      snapshot.document?.events.some((event) => event.id === "note-a")
    ).toBe(true)
  })

  it("preserves containment when replacing a non-empty SECTION", () => {
    const service = new DraftSessionService()
    service.replaceDraft("session", journey())
    const snapshot = service.journeyReplaceEvent("session", {
      expectedRevision: 1,
      idempotencyKey: "replace-section-a",
      eventId: "section-a",
      replacement: {
        id: "section-a2",
        type: "SECTION",
        origin: "AGENT_INSERTED",
        title: "调整后的第一天",
        detail: { kind: "DAY" },
      },
    })
    expect(
      snapshot.document?.events.find((event) => event.id === "visit-a")
        ?.parentEventId
    ).toBe("section-a2")
  })

  it("records undo as a new revision instead of deleting history", () => {
    const service = new DraftSessionService()
    service.replaceDraft("session", journey())
    service.journeyUpdateEvent("session", {
      expectedRevision: 1,
      idempotencyKey: "update-visit-a",
      eventId: "visit-a",
      patch: { title: "更新后的 A" },
    })
    const snapshot = service.journeyUndo("session", {
      expectedRevision: 2,
      idempotencyKey: "undo-update-visit-a",
    })
    expect(snapshot.revision).toBe(3)
    expect(
      snapshot.document?.events.find((event) => event.id === "visit-a")?.title
    ).toBe("A")
  })

  it("applies suggestion commands without creating a revision gap", async () => {
    const service = new DraftSessionService()
    service.replaceDraft("session", journey())
    const created = service.createSuggestion("session", {
      title: "更新两天",
      summary: "修改两个事件",
      toolCalls: [
        {
          tool: "journey.update_event",
          input: {
            expectedRevision: 1,
            idempotencyKey: "suggestion-a",
            eventId: "visit-a",
            patch: { title: "A1" },
          },
        },
        {
          tool: "journey.update_event",
          input: {
            expectedRevision: 2,
            idempotencyKey: "suggestion-b",
            eventId: "visit-b",
            patch: { title: "B1" },
          },
        },
      ],
    })

    const snapshot = await service.acceptSuggestion(
      "session",
      created.pendingSuggestions[0]!.id
    )
    expect(snapshot.revision).toBe(3)
    expect(snapshot.document?.events.map((event) => event.title)).toEqual([
      "第一天",
      "第二天",
      "A1",
      "B1",
    ])
  })
})
