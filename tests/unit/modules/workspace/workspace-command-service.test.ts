import { describe, expect, it, vi } from "vitest"
import { transitPlanFingerprint } from "@/lib/journeys/planning"
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

function unplannedJourney(): Journey {
  const journey = persistedJourney()
  const transit = journey.events.find(
    (event): event is TransitEvent => event.type === "TRANSIT"
  )!
  transit.detail = {
    plannedFromEventId: "from",
    plannedToEventId: "to",
    transportMode: "CAR",
    requestMode: "DRIVE",
    planningStatus: "EMPTY",
  }
  return journey
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

  it.each([
    { retention: "SESSION_ONLY", persistTransitPlanning: false },
    { retention: "PERSISTED", persistTransitPlanning: true },
  ] as const)(
    "plans, selects, saves, and reloads with $retention retention",
    async ({ persistTransitPlanning }) => {
      let stored = unplannedJourney()
      const repository = {
        get: vi.fn(async () => structuredClone(stored)),
        create: vi.fn(),
        update: vi.fn(
          async (
            _context: typeof context,
            _id: string,
            input: JourneyInput,
            expectedRevision?: number | null
          ) => {
            expect(expectedRevision).toBe(stored.revision)
            stored = {
              ...stored,
              ...structuredClone(input),
              id: stored.id,
              ownerId: stored.ownerId,
              visibility: stored.visibility,
              revision: stored.revision + 1,
              updatedAt: "2026-08-01T01:00:00.000Z",
            }
            return structuredClone(stored)
          }
        ),
      }
      const planning = {
        plan: vi.fn(async (request) => {
          const fingerprint = transitPlanFingerprint(request)
          return {
            transitEventId: request.transitEventId,
            requestFingerprint: fingerprint,
            plans: [
              {
                id: "transit-plan-recommended",
                provider: "mock" as const,
                rank: 0,
                label: "推荐",
                strategy: "recommended",
                distanceMeters: 1_000,
                durationSeconds: 600,
                fareAmount: 10,
                trafficBasis: "TYPICAL" as const,
                calculatedAt: "2026-08-01T00:00:00.000Z",
                requestFingerprint: fingerprint,
                segments: [],
              },
              {
                id: "transit-plan-fast",
                provider: "mock" as const,
                rank: 1,
                label: "最快",
                strategy: "fastest",
                distanceMeters: 2_400,
                durationSeconds: 300,
                fareAmount: 28,
                trafficBasis: "TYPICAL" as const,
                calculatedAt: "2026-08-01T00:00:00.000Z",
                requestFingerprint: fingerprint,
                segments: [],
              },
            ],
          }
        }),
      }
      const drafts = new DraftSessionService(planning)
      const service = new WorkspaceCommandService(drafts, {
        journeys: repository,
        persistTransitPlanning,
      })

      await service.loadSavedJourney(context, "browser", stored.id)
      const planned = await service.executeDraftTool(
        "browser",
        "journey.plan_transit",
        {
          eventId: "transit",
          expectedRevision: 1,
          idempotencyKey: "browser-plan",
        }
      )
      const plannedTransit = planned.document?.events.find(
        (event): event is TransitEvent => event.type === "TRANSIT"
      )
      if (!plannedTransit) throw new Error("Planned transit is missing")
      expect(plannedTransit.detail.plans).toHaveLength(2)

      const selected = await service.executeDraftTool(
        "browser",
        "journey.select_transit_plan",
        {
          eventId: "transit",
          planId: "transit-plan-fast",
          expectedRevision: 2,
          idempotencyKey: "browser-select-fast",
        }
      )
      const selectedTransit = selected.document?.events.find(
        (event): event is TransitEvent => event.type === "TRANSIT"
      )
      if (!selectedTransit) throw new Error("Selected transit is missing")
      expect(selectedTransit.detail).toMatchObject({
        selectedPlanId: "transit-plan-fast",
        plannedDurationMinutes: 5,
        plannedDistanceKm: 2.4,
        plannedCostEstimate: 28,
      })

      const saved = await service.saveDraft(context, "browser")
      const currentTransit = saved.document?.events.find(
        (event): event is TransitEvent => event.type === "TRANSIT"
      )
      if (!currentTransit) throw new Error("Saved transit is missing")
      expect(currentTransit.detail).toMatchObject({
        selectedPlanId: "transit-plan-fast",
        plans: expect.arrayContaining([
          expect.objectContaining({ id: "transit-plan-fast" }),
        ]),
        plannedDurationMinutes: 5,
        plannedDistanceKm: 2.4,
        plannedCostEstimate: 28,
      })

      const reloaded = await service.loadSavedJourney(
        context,
        "reloaded-browser",
        stored.id
      )
      const reloadedTransit = reloaded.document?.events.find(
        (event): event is TransitEvent => event.type === "TRANSIT"
      )
      if (!reloadedTransit) throw new Error("Reloaded transit is missing")
      if (persistTransitPlanning) {
        expect(reloadedTransit.detail).toMatchObject({
          selectedPlanId: "transit-plan-fast",
          plans: expect.arrayContaining([
            expect.objectContaining({ id: "transit-plan-fast" }),
          ]),
          plannedDurationMinutes: 5,
          plannedDistanceKm: 2.4,
          plannedCostEstimate: 28,
          planningStatus: "READY",
        })
      } else {
        expect(reloadedTransit.detail.plans).toBeUndefined()
        expect(reloadedTransit.detail.selectedPlanId).toBeUndefined()
        expect(reloadedTransit.detail.planningStatus).toBe("EMPTY")
      }
    }
  )
})
