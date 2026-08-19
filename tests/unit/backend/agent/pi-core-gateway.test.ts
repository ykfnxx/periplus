import { randomUUID } from "node:crypto"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { AgentGateway } from "@/backend/agent/gateway"
import type {
  PeriplusAgentHarness,
  PeriplusAgentHarnessObserver,
  PeriplusAgentHarnessRequest,
  PeriplusHarnessEvent,
} from "@/backend/agent/periplus-agent-harness"
import type { AgentEvent } from "@/backend/types"
import {
  transitPlanFingerprint,
  type TransitPlanBundle,
  type TransitPlanRequest,
} from "@/lib/journeys/planning"
import type { TargetJourneyGraphSnapshot } from "@/modules/data-model/contracts"
import { prisma } from "@/modules/data/db/prisma"
import { TransitPlanningService } from "@/modules/data/transit/transit-planning-service"
import { createWorkspace } from "@/modules/data/workspaces/workspace-repository"
import { WorkspaceCommandService } from "@/modules/workspace/server/workspace-command-service"

const ownerId = `pi-core-gateway-owner-${randomUUID()}`
const context = { userId: ownerId, role: "user" as const }

class FakePiHarness {
  readonly id = "fake-pi-agent-core"
  request: PeriplusAgentHarnessRequest | null = null
  observer: PeriplusAgentHarnessObserver | null = null
  readonly cancel = vi.fn()

  async generateConversationSummary() {
    return "{}"
  }

  async start(
    request: PeriplusAgentHarnessRequest,
    observer: PeriplusAgentHarnessObserver
  ) {
    this.request = request
    this.observer = observer
    return { cancel: this.cancel }
  }

  emit(event: PeriplusHarnessEvent) {
    this.observer?.onEvent(event)
  }
}

function graph(id: string): TargetJourneyGraphSnapshot {
  const timestamp = "2026-08-12T00:00:00.000Z"
  return {
    id,
    ownerId,
    revision: 1,
    status: "DRAFT",
    visibility: "PRIVATE",
    title: "Pi core workspace",
    events: [
      {
        id: `${id}-city`,
        journeyId: id,
        parentSectionEventId: null,
        placementStatus: "SCHEDULED",
        origin: "ORIGINAL",
        title: "杭州",
        introducedRevision: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        type: "SECTION",
        detail: {
          kind: "CITY",
          timeZone: "Asia/Shanghai",
          lat: 30.2741,
          lng: 120.1551,
          coordinateSystem: "GCJ02",
        },
      },
      {
        id: `${id}-visit`,
        journeyId: id,
        parentSectionEventId: `${id}-city`,
        placementStatus: "SCHEDULED",
        origin: "ORIGINAL",
        title: "西湖",
        description: "沿湖游览",
        executionStatus: "PLANNED",
        plannedStartAt: "2026-08-13T09:00:00+08:00",
        introducedRevision: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        type: "VISIT",
        detail: {
          plannedPlaceId: "place-west-lake",
          plannedLat: 30.247,
          plannedLng: 120.146,
          coordinateSystem: "GCJ02",
          coordinateProvider: "amap",
          providerPlaceId: "B023B0",
          plannedDurationMinutes: 120,
        },
      },
    ],
    links: [],
    replacements: [],
    branchSelections: [],
    transitPlanningRuns: [],
    eventAssetLinks: [],
    observations: [],
    eventSourceLinks: [],
  }
}

function overnightHotelGraph(id: string): TargetJourneyGraphSnapshot {
  const result = graph(id)
  const timestamp = "2026-08-12T00:00:00.000Z"
  const firstVisitId = `${id}-visit`
  const secondVisitId = `${id}-visit-next-day`
  result.events.push({
    id: secondVisitId,
    journeyId: id,
    parentSectionEventId: `${id}-city`,
    placementStatus: "SCHEDULED",
    origin: "ORIGINAL",
    title: "灵隐寺",
    executionStatus: "PLANNED",
    plannedStartAt: "2026-08-14T09:00:00+08:00",
    introducedRevision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    type: "VISIT",
    detail: {
      plannedLat: 30.2403,
      plannedLng: 120.1015,
      coordinateSystem: "GCJ02",
      coordinateProvider: "amap",
    },
  })
  result.links.push({
    id: `${id}-visit-link`,
    journeyId: id,
    fromEventId: firstVisitId,
    toEventId: secondVisitId,
    kind: "MAIN",
    rank: 1024,
    introducedRevision: 1,
  })
  return result
}

function transitProviderBundle(input: TransitPlanRequest): TransitPlanBundle {
  const fingerprint = transitPlanFingerprint(input)
  return {
    transitEventId: input.transitEventId,
    requestFingerprint: fingerprint,
    plans: [
      {
        id: `provider-${fingerprint}`,
        provider: "mock",
        rank: 0,
        label: "推荐路线",
        strategy: "recommended",
        distanceMeters: 1_000,
        durationSeconds: 600,
        trafficBasis: "TYPICAL",
        calculatedAt: "2026-08-12T00:00:00.000Z",
        requestFingerprint: fingerprint,
        segments: [
          {
            id: `segment-${fingerprint}`,
            order: 0,
            mode: input.mode === "TRANSIT" ? "RAIL" : input.mode,
            coordinateSystem: "GCJ02",
            geometryKind: "ROAD_NETWORK",
            positions: [
              [input.origin.lng, input.origin.lat],
              [input.destination.lng, input.destination.lat],
            ],
          },
        ],
      },
    ],
  }
}

function twoCityHotelGraph(id: string): TargetJourneyGraphSnapshot {
  const result = graph(id)
  const timestamp = "2026-08-12T00:00:00.000Z"
  const firstCityId = `${id}-city`
  const firstVisitId = `${id}-visit`
  const secondVisitId = `${id}-visit-next-day`
  const rootTransitId = `${id}-root-transit`
  const secondCityId = `${id}-city-b`
  const secondCityVisitId = `${id}-city-b-visit`
  result.events.push(
    {
      id: secondVisitId,
      journeyId: id,
      parentSectionEventId: firstCityId,
      placementStatus: "SCHEDULED",
      origin: "ORIGINAL",
      title: "灵隐寺",
      executionStatus: "PLANNED",
      plannedStartAt: "2026-08-14T09:00:00+08:00",
      introducedRevision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      type: "VISIT",
      detail: {
        plannedLat: 30.2403,
        plannedLng: 120.1015,
        coordinateSystem: "GCJ02",
        coordinateProvider: "amap",
      },
    },
    {
      id: rootTransitId,
      journeyId: id,
      parentSectionEventId: null,
      placementStatus: "SCHEDULED",
      origin: "ORIGINAL",
      title: "杭州到上海",
      executionStatus: "PLANNED",
      introducedRevision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      type: "TRANSIT",
      detail: {
        plannedFromEventId: firstCityId,
        plannedToEventId: secondCityId,
        transportMode: "TRAIN",
        requestMode: "TRANSIT",
        preference: "RECOMMENDED",
        routeState: "EMPTY",
      },
    },
    {
      id: secondCityId,
      journeyId: id,
      parentSectionEventId: null,
      placementStatus: "SCHEDULED",
      origin: "ORIGINAL",
      title: "上海",
      introducedRevision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      type: "SECTION",
      detail: {
        kind: "CITY",
        timeZone: "Asia/Shanghai",
        lat: 31.2304,
        lng: 121.4737,
        coordinateSystem: "GCJ02",
      },
    },
    {
      id: secondCityVisitId,
      journeyId: id,
      parentSectionEventId: secondCityId,
      placementStatus: "SCHEDULED",
      origin: "ORIGINAL",
      title: "外滩",
      executionStatus: "PLANNED",
      plannedStartAt: "2026-08-13T10:00:00+08:00",
      introducedRevision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      type: "VISIT",
      detail: {
        plannedLat: 31.2401,
        plannedLng: 121.4905,
        coordinateSystem: "GCJ02",
        coordinateProvider: "amap",
      },
    }
  )
  result.links.push(
    {
      id: `${id}-city-a-link`,
      journeyId: id,
      fromEventId: firstVisitId,
      toEventId: secondVisitId,
      kind: "MAIN",
      rank: 1024,
      introducedRevision: 1,
    },
    {
      id: `${id}-root-link-a`,
      journeyId: id,
      fromEventId: firstCityId,
      toEventId: rootTransitId,
      kind: "MAIN",
      rank: 1024,
      introducedRevision: 1,
    },
    {
      id: `${id}-root-link-b`,
      journeyId: id,
      fromEventId: rootTransitId,
      toEventId: secondCityId,
      kind: "MAIN",
      rank: 2048,
      introducedRevision: 1,
    }
  )
  return result
}

beforeAll(async () => {
  await prisma.user.create({
    data: {
      id: ownerId,
      name: "Pi core gateway owner",
      email: `${ownerId}@periplus.local`,
      emailVerified: true,
    },
  })
})

describe("Pi Agent Core gateway integration", () => {
  it("persists typed assistant events before broadcasting the completed run", async () => {
    const workspace = await createWorkspace(context, {
      graph: graph(`pi-core-workspace-${randomUUID()}`),
      now: new Date("2026-08-12T00:00:00.000Z"),
    })
    const harness = new FakePiHarness()
    const commands = new WorkspaceCommandService()
    const events: AgentEvent[] = []
    const gateway = new AgentGateway(
      commands,
      harness as unknown as PeriplusAgentHarness,
      { heartbeatIntervalMs: null }
    )

    await gateway.start(
      context,
      workspace.id,
      "安排西湖上午游览",
      (id, event) => {
        expect(id).toBe(workspace.id)
        events.push(event)
      }
    )

    expect(harness.request).toMatchObject({
      currentUserRequest: "安排西湖上午游览",
      conversationSummary: "",
      baseline: {
        workspaceId: workspace.id,
        workspaceRevision: 0,
        journey: {
          events: [
            expect.objectContaining({
              proposalItemKey: "baseline-0001",
              kind: "VISIT",
              title: "西湖",
            }),
          ],
        },
      },
    })
    expect(harness.request).not.toHaveProperty("messages")
    expect(harness.request).not.toHaveProperty("mode")

    const updated = await harness.request!.executeTool(
      {
        type: "event.update",
        itemKey: "baseline-0001",
        notes: "上午游览",
      },
      "update-1"
    )
    expect(updated).toMatchObject({ status: "ok" })
    const committed = await harness.request!.executeTool(
      { type: "path.commit" },
      "commit-1"
    )
    expect(committed).toMatchObject({
      status: "ok",
      data: { newWorkspaceRevision: 1 },
    })
    expect(committed).not.toHaveProperty("data.draftId")

    harness.emit({
      type: "context_prepared",
      input: "effective Pi context",
      messageCount: 1,
      estimatedTokens: 42,
      compacted: false,
      summaryStatus: "EMPTY",
      baselineRevision: 0,
      toolCatalogVersion: "catalog-v3",
    })
    harness.emit({
      type: "model_start",
      requestId: "model-1",
      provider: "deepseek",
      model: "deepseek-v4-flash",
      input: "effective model context",
      startedAt: performance.now(),
    })
    harness.emit({ type: "message_delta", text: "已安排西湖。" })
    harness.emit({
      type: "model_end",
      requestId: "model-1",
      output: "已安排西湖。",
      thinking: "需要确认提交后的最终行程。",
      toolCalls: [],
      usage: {
        input: 10,
        output: 5,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 15,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      endedAt: performance.now(),
    })
    harness.emit({ type: "run_end", result: { status: "succeeded" } })

    await vi.waitFor(async () => {
      const document = await commands.getDocument(context, workspace.id)
      expect(document?.messages.at(-1)?.content).toBe("已更新 1 个行程事件")
      expect(document?.agentRuns.at(-1)?.status).toBe("SUCCEEDED")
      expect(events.at(-1)?.type).toBe("agent.run.completed")
    })
    expect(
      events.find((event) => event.type === "agent.message.delta")
    ).toBeTruthy()
  })

  it("fails an AUTO run that ends without committing a validated draft", async () => {
    const workspace = await createWorkspace(context, {
      graph: graph(`pi-core-no-commit-${randomUUID()}`),
      now: new Date("2026-08-12T00:00:00.000Z"),
    })
    const harness = new FakePiHarness()
    const commands = new WorkspaceCommandService()
    const events: AgentEvent[] = []
    const gateway = new AgentGateway(
      commands,
      harness as unknown as PeriplusAgentHarness,
      { heartbeatIntervalMs: null }
    )

    await gateway.start(context, workspace.id, "优化路线", (_id, event) => {
      events.push(event)
    })
    harness.emit({ type: "run_end", result: { status: "succeeded" } })

    await vi.waitFor(async () => {
      const document = await commands.getDocument(context, workspace.id)
      expect(document?.session.headWorkspaceRevision).toBe(0)
      expect(document?.agentRuns.at(-1)).toMatchObject({
        status: "FAILED",
        errorCode: "DRAFT_COMMIT_REQUIRED",
      })
      expect(events.at(-1)?.type).toBe("agent.run.failed")
    })
  })

  it("terminates PLANNER_CHOICE resolution when the provider is exhausted", async () => {
    const journeyId = `pi-core-place-provider-${randomUUID()}`
    const workspace = await createWorkspace(context, {
      graph: graph(journeyId),
      now: new Date("2026-08-12T00:00:00.000Z"),
    })
    const harness = new FakePiHarness()
    const commands = new WorkspaceCommandService()
    const gateway = new AgentGateway(
      commands,
      harness as unknown as PeriplusAgentHarness,
      {
        heartbeatIntervalMs: null,
        placeService: {
          searchPlaces: vi.fn().mockResolvedValue({
            results: [],
            warnings: [
              {
                provider: "amap",
                code: "timeout",
                message: "provider timed out",
                retryable: true,
                attempts: 3,
                exhausted: true,
              },
            ],
            providerAttempts: 3,
          }),
          resolvePlace: vi.fn(),
          enrichPlace: vi.fn(),
          verifyPlaceImages: vi.fn(),
        },
      }
    )

    await gateway.start(context, workspace.id, "安排一个景点", () => undefined)
    await expect(
      harness.request!.executeTool(
        {
          type: "place.search",
          city: "大理",
          query: "大理古城",
          intent: "VISIT",
        },
        "resolve-provider"
      )
    ).resolves.toMatchObject({
      status: "non_retryable_error",
      code: "PLACE_PROVIDER_UNAVAILABLE",
    })

    harness.emit({
      type: "run_end",
      result: { status: "failed", error: new Error("provider unavailable") },
    })
  })

  it("binds a hotel selection to the CITY that produced it", async () => {
    const journeyId = `pi-core-hotel-city-${randomUUID()}`
    const workspace = await createWorkspace(context, {
      graph: twoCityHotelGraph(journeyId),
      now: new Date("2026-08-12T00:00:00.000Z"),
    })
    const harness = new FakePiHarness()
    const commands = new WorkspaceCommandService()
    const gateway = new AgentGateway(
      commands,
      harness as unknown as PeriplusAgentHarness,
      {
        heartbeatIntervalMs: null,
        hotelService: {
          searchHotels: vi.fn().mockResolvedValue({
            candidates: [
              {
                candidateId: "hotel-candidate-a",
                provider: "rollinggo",
                providerHotelId: "hotel-provider-a",
                name: "杭州湖畔酒店",
                coordinates: { lat: 30.25, lng: 120.15 },
                fetchedAt: "2026-08-12T00:00:00.000Z",
              },
            ],
            warnings: [],
            providerAttempts: 1,
          }),
        },
      }
    )

    await gateway.start(context, workspace.id, "杭州住一晚", () => undefined)
    const path = (await harness.request!.executeTool(
      { type: "path.read" },
      "read-path"
    )) as {
      data: {
        requirements: {
          stayRequirements: Array<{ stayRequirementId: string }>
          routeRequirements: Array<{
            fromItemKey: string
            toItemKey: string
            earliestDepartAt: string
          }>
        }
      }
    }
    expect(path.data.requirements.routeRequirements).toContainEqual(
      expect.objectContaining({
        fromItemKey: "baseline-0001",
        toItemKey: "baseline-0002",
      })
    )
    const stayRequirementId =
      path.data.requirements.stayRequirements[0]!.stayRequirementId
    const searched = await harness.request!.executeTool(
      {
        type: "hotel.search",
        stayRequirementId,
      },
      "search-hotel"
    )
    expect(searched).toMatchObject({ status: "ok" })
    const selectionId = (
      searched as { data: { recommendedSelectionId: string } }
    ).data.recommendedSelectionId

    await expect(
      harness.request!.executeTool(
        {
          type: "event.add",
          source: "HOTEL",
          stayRequirementId: "stale-requirement",
          selectionId,
        },
        "stay-wrong-city"
      )
    ).resolves.toMatchObject({
      status: "retryable_error",
      code: "STALE_STAY_REQUIREMENT",
    })

    const added = (await harness.request!.executeTool(
      {
        type: "event.add",
        source: "HOTEL",
        stayRequirementId,
        selectionId,
      },
      "stay-correct-city"
    )) as {
      status: "ok"
      data: {
        itemKey: string
        materializedEvent: {
          plannedStartAt: string
          plannedEndAt: string
        }
      }
    }
    expect(added).toMatchObject({
      status: "ok",
      data: {
        materializedEvent: {
          plannedStartAt: "2026-08-13T14:00:00.000Z",
          plannedEndAt: "2026-08-14T00:00:00.000Z",
        },
      },
    })

    const withStay = (await harness.request!.executeTool(
      { type: "path.read" },
      "read-path-with-stay"
    )) as {
      data: {
        requirements: {
          routeRequirements: Array<{
            fromItemKey: string
            toItemKey: string
            earliestDepartAt: string
          }>
        }
      }
    }
    expect(withStay.data.requirements.routeRequirements).toContainEqual({
      routeRequirementId: expect.any(String),
      fromItemKey: added.data.itemKey,
      toItemKey: "baseline-0002",
      earliestDepartAt: "2026-08-14T00:00:00.000Z",
    })

    harness.emit({ type: "run_end", result: { status: "succeeded" } })
  })

  it("invalidates a direct route when a hotel is inserted between its endpoints", async () => {
    const journeyId = `pi-core-hotel-route-${randomUUID()}`
    const workspace = await createWorkspace(context, {
      graph: overnightHotelGraph(journeyId),
      now: new Date("2026-08-12T00:00:00.000Z"),
    })
    const harness = new FakePiHarness()
    const commands = new WorkspaceCommandService()
    const transitService = new TransitPlanningService({
      provider: {
        plan: vi.fn(async (input) => transitProviderBundle(input)),
      },
      sleep: vi.fn(async () => undefined),
      logUsage: vi.fn(async () => undefined),
    })
    const gateway = new AgentGateway(
      commands,
      harness as unknown as PeriplusAgentHarness,
      {
        heartbeatIntervalMs: null,
        transitService,
        hotelService: {
          searchHotels: vi.fn().mockResolvedValue({
            candidates: [
              {
                candidateId: "hotel-candidate-route",
                provider: "rollinggo",
                providerHotelId: "hotel-provider-route",
                name: "杭州湖畔酒店",
                coordinates: { lat: 30.25, lng: 120.15 },
                fetchedAt: "2026-08-12T00:00:00.000Z",
              },
            ],
            warnings: [],
            providerAttempts: 1,
          }),
        },
      }
    )

    await gateway.start(context, workspace.id, "杭州住一晚", () => undefined)

    const readPath = async (toolCallId: string) =>
      (await harness.request!.executeTool(
        { type: "path.read" },
        toolCallId
      )) as {
        status: "ok"
        data: {
          materializedPath: Array<{
            itemKey: string
            kind: string
            fromItemKey?: string
            toItemKey?: string
          }>
          requirements: {
            routeRequirements: Array<{
              routeRequirementId: string
              fromItemKey: string
              toItemKey: string
            }>
            stayRequirements: Array<{ stayRequirementId: string }>
          }
          conflicts: Array<{ code: string }>
        }
      }

    const resolveRoute = async (
      routeRequirementId: string,
      toolCallId: string
    ) => {
      const searched = (await harness.request!.executeTool(
        {
          type: "route.search",
          routeRequirementId,
          modePreference: "WALK",
        },
        `${toolCallId}-search`
      )) as { status: "ok"; data: { recommendedSelectionId: string } }
      await expect(
        harness.request!.executeTool(
          {
            type: "event.add",
            source: "ROUTE",
            routeRequirementId,
            selectionId: searched.data.recommendedSelectionId,
          },
          `${toolCallId}-add`
        )
      ).resolves.toMatchObject({ status: "ok" })
    }

    const initial = await readPath("read-initial")
    const directRequirement = initial.data.requirements.routeRequirements.find(
      (requirement) =>
        requirement.fromItemKey === "baseline-0001" &&
        requirement.toItemKey === "baseline-0002"
    )!
    await resolveRoute(directRequirement.routeRequirementId, "direct-route")
    const withDirectRoute = await readPath("read-direct-route")
    const directTransit = withDirectRoute.data.materializedPath.find(
      (event) =>
        event.kind === "TRANSIT" &&
        event.fromItemKey === "baseline-0001" &&
        event.toItemKey === "baseline-0002"
    )!

    const stayRequirementId =
      withDirectRoute.data.requirements.stayRequirements[0]!.stayRequirementId
    const hotelSearch = (await harness.request!.executeTool(
      { type: "hotel.search", stayRequirementId },
      "search-hotel-after-route"
    )) as { status: "ok"; data: { recommendedSelectionId: string } }
    const hotelAdd = (await harness.request!.executeTool(
      {
        type: "event.add",
        source: "HOTEL",
        stayRequirementId,
        selectionId: hotelSearch.data.recommendedSelectionId,
      },
      "add-hotel-after-route"
    )) as { status: "ok"; data: { itemKey: string } }

    let current = await readPath("read-after-hotel")
    expect(current.data.materializedPath).not.toContainEqual(
      expect.objectContaining({ itemKey: directTransit.itemKey })
    )
    expect(current.data.conflicts).toEqual([])
    expect(current.data.requirements.routeRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromItemKey: "baseline-0001",
          toItemKey: hotelAdd.data.itemKey,
        }),
        expect.objectContaining({
          fromItemKey: hotelAdd.data.itemKey,
          toItemKey: "baseline-0002",
        }),
      ])
    )

    for (let index = 0; index < 2; index += 1) {
      const requirement = current.data.requirements.routeRequirements[0]!
      await resolveRoute(requirement.routeRequirementId, `stay-route-${index}`)
      current = await readPath(`read-stay-route-${index}`)
    }

    expect(current.data.requirements.routeRequirements).toEqual([])
    expect(current.data.requirements.stayRequirements).toEqual([])
    expect(current.data.conflicts).toEqual([])
    const nonTransitItemKeys = current.data.materializedPath
      .filter((event) => event.kind !== "TRANSIT")
      .map((event) => event.itemKey)
    const adjacentPairs = new Set(
      nonTransitItemKeys
        .slice(0, -1)
        .map((itemKey, index) => `${itemKey}:${nonTransitItemKeys[index + 1]}`)
    )
    for (const event of current.data.materializedPath.filter(
      (candidate) => candidate.kind === "TRANSIT"
    )) {
      expect(adjacentPairs.has(`${event.fromItemKey}:${event.toItemKey}`)).toBe(
        true
      )
    }

    await expect(
      harness.request!.executeTool({ type: "path.commit" }, "commit-path")
    ).resolves.toMatchObject({
      status: "ok",
      data: { committed: true, newWorkspaceRevision: 1 },
    })

    harness.emit({ type: "run_end", result: { status: "succeeded" } })
  })
})
