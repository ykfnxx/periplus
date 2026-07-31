import { describe, expect, it, vi } from "vitest"
import { DraftSessionService } from "@/modules/workspace/server/draft-session-service"
import { WorkspaceCommandService } from "@/modules/workspace/server/workspace-command-service"
import type { Journey, JourneyInput, TransitEvent } from "@/types/journey"

const context = { userId: "user", role: "user" as const }

function persistedJourney(): Journey {
  return {
    id: "journey",
    ownerId: "user",
    revision: 4,
    visibility: "private",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    title: "Workspace",
    status: "DRAFT",
    events: [
      {
        id: "from",
        type: "VISIT",
        executionStatus: "PLANNED",
        origin: "ORIGINAL",
        title: "起点",
        detail: { plannedLat: 30, plannedLng: 120 },
      },
      {
        id: "transit",
        type: "TRANSIT",
        executionStatus: "PLANNED",
        origin: "ORIGINAL",
        title: "交通",
        detail: {
          plannedFromEventId: "from",
          plannedToEventId: "to",
          transportMode: "CAR",
          requestMode: "DRIVE",
          selectedPlanId: "plan",
          planningStatus: "READY",
          plans: [
            {
              id: "plan",
              provider: "mock",
              rank: 0,
              label: "推荐",
              strategy: "recommended",
              distanceMeters: 1_000,
              durationSeconds: 600,
              trafficBasis: "TYPICAL",
              calculatedAt: "2026-08-01T00:00:00.000Z",
              requestFingerprint: "fingerprint",
              segments: [],
            },
          ],
        },
      },
      {
        id: "to",
        type: "VISIT",
        executionStatus: "PLANNED",
        origin: "ORIGINAL",
        title: "终点",
        detail: { plannedLat: 31, plannedLng: 121 },
      },
    ],
    links: [
      { id: "link-1", fromEventId: "from", toEventId: "transit", kind: "MAIN" },
      { id: "link-2", fromEventId: "transit", toEventId: "to", kind: "MAIN" },
    ],
  }
}

describe("WorkspaceCommandService", () => {
  it("passes the base revision and strips session-only transit plans", async () => {
    const journey = persistedJourney()
    const update = vi.fn(
      async (
        _context: typeof context,
        _id: string,
        input: JourneyInput
      ): Promise<Journey> => ({ ...journey, ...input, revision: 5 })
    )
    const repository = {
      get: vi.fn(async () => journey),
      create: vi.fn(async () => journey),
      update,
    }
    const drafts = new DraftSessionService()
    const service = new WorkspaceCommandService(drafts, {
      journeys: repository,
      persistTransitPlanning: false,
    })
    await service.loadSavedJourney(context, "session", journey.id)

    const snapshot = await service.saveDraft(context, "session")
    const input = update.mock.calls[0]![2]
    const transit = input.events.find(
      (event): event is TransitEvent => event.type === "TRANSIT"
    )!
    expect(update).toHaveBeenCalledWith(
      context,
      journey.id,
      expect.any(Object),
      4
    )
    expect(transit.detail.plans).toBeUndefined()
    expect(transit.detail.planningStatus).toBe("EMPTY")
    expect(
      snapshot.document?.events.find((event) => event.type === "TRANSIT")
    ).toMatchObject({ detail: { plans: [{ id: "plan" }] } })
  })

  it("persists transit plans when configured", async () => {
    const journey = persistedJourney()
    const create = vi.fn(
      async (
        _context: typeof context,
        input: JourneyInput
      ): Promise<Journey> => ({ ...journey, ...input })
    )
    const drafts = new DraftSessionService()
    drafts.replaceDraft("session", {
      ...journey,
      id: "preset-local",
      revision: undefined,
      ownerId: undefined,
      visibility: undefined,
      createdAt: undefined,
      updatedAt: undefined,
    } as unknown as JourneyInput)
    const service = new WorkspaceCommandService(drafts, {
      journeys: { get: vi.fn(), update: vi.fn(), create },
      persistTransitPlanning: true,
    })

    await service.saveDraft(context, "session")
    const input = create.mock.calls[0]![1]
    const transit = input.events.find(
      (event): event is TransitEvent => event.type === "TRANSIT"
    )!
    expect(transit.detail.plans).toHaveLength(1)
  })
})
