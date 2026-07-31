import { describe, expect, it, vi } from "vitest"
import { transitPlanFingerprint } from "@/lib/journeys/planning"
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

  it("adds an ALTERNATIVE branch and can promote it into the MAIN chain", () => {
    const service = new DraftSessionService()
    service.replaceDraft("session", journey())
    const branched = service.journeyAddEvent("session", {
      expectedRevision: 1,
      idempotencyKey: "add-rain-branch",
      event: {
        id: "rain-note",
        type: "NOTE",
        origin: "USER_INSERTED",
        title: "雨天备选",
        detail: { body: "室内活动" },
      },
      position: {
        placement: "branch",
        fromEventId: "section-a",
        toEventId: "section-b",
        branchKey: "rain",
      },
    })
    expect(branched.document?.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromEventId: "section-a",
          toEventId: "rain-note",
          kind: "ALTERNATIVE",
          branchKey: "rain",
        }),
        expect.objectContaining({
          fromEventId: "rain-note",
          toEventId: "section-b",
          kind: "ALTERNATIVE",
          branchKey: "rain",
        }),
      ])
    )

    const promoted = service.journeyMoveEvent("session", {
      expectedRevision: 2,
      idempotencyKey: "promote-rain-branch",
      eventId: "rain-note",
      position: { placement: "after", eventId: "section-a" },
    })
    expect(promoted.document?.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromEventId: "section-a",
          toEventId: "rain-note",
          kind: "MAIN",
        }),
        expect.objectContaining({
          fromEventId: "rain-note",
          toEventId: "section-b",
          kind: "MAIN",
        }),
      ])
    )
    expect(
      promoted.document?.links.some((link) => link.kind === "ALTERNATIVE")
    ).toBe(false)
  })

  it("moves a MAIN branch anchor without disconnecting or cycling its branch", () => {
    const service = new DraftSessionService()
    const input = journey()
    input.events.push({
      id: "rain-note",
      type: "NOTE",
      origin: "USER_INSERTED",
      title: "雨天备选",
      detail: { body: "室内活动" },
    })
    input.links.push(
      {
        id: "rain-start",
        fromEventId: "section-a",
        toEventId: "rain-note",
        kind: "ALTERNATIVE",
      },
      {
        id: "rain-end",
        fromEventId: "rain-note",
        toEventId: "section-b",
        kind: "ALTERNATIVE",
      }
    )
    service.replaceDraft("session", input)

    const moved = service.journeyMoveEvent("session", {
      expectedRevision: 1,
      idempotencyKey: "move-main-branch-anchor",
      eventId: "section-a",
      position: { placement: "end" },
    })

    expect(moved.document?.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromEventId: "section-b",
          toEventId: "section-a",
          kind: "MAIN",
        }),
        expect.objectContaining({
          id: "rain-end",
          fromEventId: "section-b",
          toEventId: "rain-note",
          kind: "ALTERNATIVE",
        }),
        expect.objectContaining({
          id: "rain-start",
          fromEventId: "rain-note",
          toEventId: "section-a",
          kind: "ALTERNATIVE",
        }),
      ])
    )

    service.replaceDraft("after-session", input)
    const movedAfter = service.journeyMoveEvent("after-session", {
      expectedRevision: 1,
      idempotencyKey: "move-main-branch-anchor-after",
      eventId: "section-a",
      position: { placement: "after", eventId: "section-b" },
    })
    expect(movedAfter.document?.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromEventId: "section-b",
          toEventId: "section-a",
          kind: "MAIN",
        }),
        expect.objectContaining({
          fromEventId: "section-b",
          toEventId: "rain-note",
          kind: "ALTERNATIVE",
        }),
        expect.objectContaining({
          fromEventId: "rain-note",
          toEventId: "section-a",
          kind: "ALTERNATIVE",
        }),
      ])
    )

    service.replaceDraft("cross-scope-session", input)
    expect(() =>
      service.journeyMoveEvent("cross-scope-session", {
        expectedRevision: 1,
        idempotencyKey: "move-main-branch-anchor-cross-scope",
        eventId: "section-a",
        position: { placement: "after", eventId: "visit-b" },
      })
    ).toThrowError("Events with ALTERNATIVE links cannot move across scopes")
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

  it("rewires transit endpoints so planning uses the active replacement", async () => {
    const input = journey()
    input.events.push(
      {
        id: "transit-a",
        parentEventId: "section-a",
        type: "TRANSIT",
        executionStatus: "PLANNED",
        origin: "ORIGINAL",
        title: "前往 C",
        detail: {
          transportMode: "CAR",
          requestMode: "DRIVE",
          plannedFromEventId: "visit-a",
          actualFromEventId: "visit-a",
          plannedToEventId: "visit-c",
          actualToEventId: "visit-c",
        },
      },
      {
        id: "visit-c",
        parentEventId: "section-a",
        type: "VISIT",
        executionStatus: "PLANNED",
        origin: "ORIGINAL",
        title: "C",
        detail: { plannedLat: 32, plannedLng: 122 },
      }
    )
    input.links.push(
      {
        id: "inside-a-1",
        fromEventId: "visit-a",
        toEventId: "transit-a",
        kind: "MAIN",
      },
      {
        id: "inside-a-2",
        fromEventId: "transit-a",
        toEventId: "visit-c",
        kind: "MAIN",
      }
    )
    const planning = {
      plan: vi.fn(async (request) => {
        const fingerprint = transitPlanFingerprint(request)
        return {
          transitEventId: request.transitEventId,
          requestFingerprint: fingerprint,
          plans: [
            {
              id: "transit-a-plan-0",
              provider: "mock" as const,
              rank: 0,
              label: "推荐",
              strategy: "recommended",
              distanceMeters: 2_000,
              durationSeconds: 900,
              trafficBasis: "TYPICAL" as const,
              calculatedAt: "2026-08-01T00:00:00.000Z",
              requestFingerprint: fingerprint,
              segments: [],
            },
          ],
        }
      }),
    }
    const service = new DraftSessionService(planning)
    service.replaceDraft("session", input)

    const replaced = service.journeyReplaceEvent("session", {
      expectedRevision: 1,
      idempotencyKey: "replace-visit-a-for-transit",
      eventId: "visit-a",
      replacement: {
        id: "visit-a2",
        type: "VISIT",
        executionStatus: "PLANNED",
        origin: "USER_INSERTED",
        title: "A2",
        detail: { plannedLat: 30.5, plannedLng: 120.5 },
      },
    })
    const transit = replaced.document?.events.find(
      (event) => event.id === "transit-a"
    )
    expect(transit?.type).toBe("TRANSIT")
    if (transit?.type !== "TRANSIT") return
    expect(transit.detail).toMatchObject({
      plannedFromEventId: "visit-a2",
      actualFromEventId: "visit-a2",
    })
    expect(replaced.document?.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "inside-a-1",
          fromEventId: "visit-a2",
          toEventId: "transit-a",
        }),
      ])
    )

    await service.journeyPlanTransit("session", {
      expectedRevision: 2,
      idempotencyKey: "plan-after-replacement",
      eventId: "transit-a",
    })
    expect(planning.plan).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: expect.objectContaining({
          name: "A2",
          lat: 30.5,
          lng: 120.5,
        }),
      })
    )
  })

  it("records a provider failure as an authoritative FAILED transit snapshot", async () => {
    const input = journey()
    input.events.push(
      {
        id: "transit-a",
        parentEventId: "section-a",
        type: "TRANSIT",
        executionStatus: "PLANNED",
        origin: "ORIGINAL",
        title: "前往 C",
        detail: {
          transportMode: "CAR",
          requestMode: "DRIVE",
          plannedFromEventId: "visit-a",
          plannedToEventId: "visit-c",
        },
      },
      {
        id: "visit-c",
        parentEventId: "section-a",
        type: "VISIT",
        executionStatus: "PLANNED",
        origin: "ORIGINAL",
        title: "C",
        detail: { plannedLat: 32, plannedLng: 122 },
      }
    )
    input.links.push(
      {
        id: "inside-a-1",
        fromEventId: "visit-a",
        toEventId: "transit-a",
        kind: "MAIN",
      },
      {
        id: "inside-a-2",
        fromEventId: "transit-a",
        toEventId: "visit-c",
        kind: "MAIN",
      }
    )
    const service = new DraftSessionService({
      plan: vi.fn(async () => {
        throw new Error("provider unavailable")
      }),
    })
    service.replaceDraft("session", input)

    const failed = await service.callTool("session", "journey.plan_transit", {
      expectedRevision: 1,
      idempotencyKey: "plan-provider-failure",
      eventId: "transit-a",
    })
    const transit = failed.document?.events.find(
      (event) => event.id === "transit-a"
    )
    expect(failed.revision).toBe(2)
    expect(transit?.type).toBe("TRANSIT")
    if (transit?.type !== "TRANSIT") return
    expect(transit.detail).toMatchObject({
      planningStatus: "FAILED",
      planningWarning: "provider unavailable",
    })
    expect(transit.detail.planningFingerprint).toBeTypeOf("string")
  })

  it("protects both sides of replacement lineage until the change is undone", () => {
    const service = new DraftSessionService()
    service.replaceDraft("session", journey())
    service.journeyReplaceEvent("session", {
      expectedRevision: 1,
      idempotencyKey: "replace-before-remove",
      eventId: "visit-a",
      replacement: {
        id: "visit-a2",
        type: "VISIT",
        executionStatus: "PLANNED",
        origin: "USER_INSERTED",
        title: "A2",
        detail: { plannedLat: 30.5, plannedLng: 120.5 },
      },
    })

    expect(() =>
      service.journeyRemoveEvent("session", {
        expectedRevision: 2,
        idempotencyKey: "remove-old-lineage",
        eventId: "visit-a",
      })
    ).toThrowError(
      "Replacement lineage cannot be removed; undo replacement instead"
    )
    expect(() =>
      service.journeyRemoveEvent("session", {
        expectedRevision: 2,
        idempotencyKey: "remove-active-lineage",
        eventId: "visit-a2",
      })
    ).toThrowError(
      "Replacement lineage cannot be removed; undo replacement instead"
    )

    const undone = service.journeyUndo("session", {
      expectedRevision: 2,
      idempotencyKey: "undo-replacement",
    })
    expect(
      undone.document?.events.some((event) => event.id === "visit-a2")
    ).toBe(false)
    expect(
      undone.document?.events.find((event) => event.id === "visit-a")
        ?.replacedByEventId
    ).toBeUndefined()
    expect(() =>
      service.journeyRemoveEvent("session", {
        expectedRevision: 3,
        idempotencyKey: "remove-after-undo",
        eventId: "visit-a",
      })
    ).not.toThrow()
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
