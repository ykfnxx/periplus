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
import type { TargetJourneyGraphSnapshot } from "@/modules/data-model/contracts"
import { prisma } from "@/modules/data/db/prisma"
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
        root: [expect.objectContaining({ type: "CITY", title: "杭州" })],
      },
    })
    expect(harness.request).not.toHaveProperty("messages")
    expect(harness.request).not.toHaveProperty("mode")

    const opened = await harness.request!.executeTool(
      { type: "draft.open" },
      "open-1"
    )
    expect(opened).toMatchObject({ status: "ok" })
    expect(opened).not.toHaveProperty("data.draftId")
    const updated = await harness.request!.executeTool(
      {
        type: "card.update",
        cardId: harness.request!.baseline.cities[0]!.cards[0]!.cardId,
        changes: { type: "VISIT", description: "上午沿湖游览" },
      },
      "update-1"
    )
    expect(updated).toMatchObject({ status: "ok" })
    const validated = await harness.request!.executeTool(
      { type: "draft.validate" },
      "validate-1"
    )
    expect(validated).toMatchObject({
      status: "ok",
      data: { validation: { valid: true } },
    })
    expect(validated).not.toHaveProperty("data.draftId")
    await expect(
      harness.request!.executeTool(
        {
          type: "card.update",
          cardId: harness.request!.baseline.root[0]!.cardId,
          changes: { type: "CITY", title: "杭州新标题" },
        },
        "write-after-valid"
      )
    ).resolves.toMatchObject({
      status: "retryable_error",
      code: "INVALID_TOOL_INPUT",
    })
    const committed = await harness.request!.executeTool(
      { type: "draft.commit" },
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
      expect(document?.messages.at(-1)?.content).toBe("已安排西湖。")
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
          searchPlaces: vi.fn(),
          resolvePlace: vi.fn().mockResolvedValue({
            status: "not_found",
            reason: "provider exhausted",
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
          enrichPlace: vi.fn(),
          verifyPlaceImages: vi.fn(),
        },
      }
    )

    await gateway.start(context, workspace.id, "安排一个景点", () => undefined)
    await harness.request!.executeTool({ type: "draft.open" }, "open-provider")
    await expect(
      harness.request!.executeTool(
        {
          type: "place.resolve",
          cityCardId: `${journeyId}-city`,
          cardType: "VISIT",
          query: "大理古城",
          origin: "PLANNER_CHOICE",
        },
        "resolve-provider"
      )
    ).resolves.toMatchObject({
      status: "terminal_error",
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
    await harness.request!.executeTool({ type: "draft.open" }, "open-hotel")
    const searched = await harness.request!.executeTool(
      { type: "hotel.search", cityCardId: `${journeyId}-city` },
      "search-hotel"
    )
    expect(searched).toMatchObject({ status: "ok" })
    const hotelSelectionId = (
      searched as { data: { hotelSelectionId: string } }
    ).data.hotelSelectionId

    await expect(
      harness.request!.executeTool(
        {
          type: "stay.add",
          cityCardId: `${journeyId}-city-b`,
          hotelSelectionId,
        },
        "stay-wrong-city"
      )
    ).resolves.toMatchObject({
      status: "retryable_error",
      code: "HOTEL_SELECTION_CITY_MISMATCH",
    })

    harness.emit({ type: "run_end", result: { status: "succeeded" } })
  })
})
