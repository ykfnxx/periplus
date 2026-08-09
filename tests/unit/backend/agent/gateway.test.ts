import { randomUUID } from "node:crypto"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { AgentGateway, agentToolRequestSchema } from "@/backend/agent/gateway"
import type {
  AgentRuntime,
  AgentRuntimeExit,
  AgentRuntimeObserver,
  AgentRuntimeRequest,
} from "@/backend/agent/runtime"
import type { AgentEvent } from "@/backend/types"
import {
  transitPlanFingerprint,
  type TransitPlanRequest,
} from "@/lib/journeys/planning"
import type { PlaceResolveResult, PlaceSearchResult } from "@/lib/places/types"
import type { TargetJourneyGraphSnapshot } from "@/modules/data-model/contracts"
import { prisma } from "@/modules/data/db/prisma"
import { createWorkspace } from "@/modules/data/workspaces/workspace-repository"
import {
  WorkspaceCommandService,
  type AgentDraftCandidate,
} from "@/modules/workspace/server/workspace-command-service"

const ownerId = `agent-gateway-owner-${randomUUID()}`
const context = { userId: ownerId, role: "user" as const }
const now = "2026-08-01T00:00:00.000Z"

beforeAll(async () => {
  await prisma.user.create({
    data: {
      id: ownerId,
      name: "Agent gateway owner",
      email: `${ownerId}@periplus.local`,
      emailVerified: true,
    },
  })
})

class FakeRuntime implements AgentRuntime {
  readonly id = "fake-runtime"
  request: AgentRuntimeRequest | null = null
  observer: AgentRuntimeObserver | null = null
  cancel = vi.fn()

  async start(request: AgentRuntimeRequest, observer: AgentRuntimeObserver) {
    this.request = request
    this.observer = observer
    return {
      metadata: { runtimeId: this.id, workDir: "/tmp/fake-runtime" },
      cancel: this.cancel,
    }
  }

  exit(code: number | null) {
    const result: AgentRuntimeExit = {
      code,
      metadata: { runtimeId: this.id, workDir: "/tmp/fake-runtime" },
    }
    this.observer?.onExit(result)
  }
}

function graph(id: string): TargetJourneyGraphSnapshot {
  return {
    id,
    ownerId,
    revision: 1,
    status: "DRAFT",
    visibility: "PRIVATE",
    title: "Agent workspace",
    events: [
      {
        id: `${id}-visit`,
        journeyId: id,
        parentSectionEventId: `${id}-city`,
        placementStatus: "SCHEDULED",
        origin: "ORIGINAL",
        title: "西湖",
        plannedStartAt: now,
        introducedRevision: 1,
        createdAt: now,
        updatedAt: now,
        type: "VISIT",
        executionStatus: "PLANNED",
        detail: {
          plannedLat: 30.25,
          plannedLng: 120.15,
          coordinateSystem: "GCJ02",
        },
      },
      {
        id: `${id}-city`,
        journeyId: id,
        parentSectionEventId: null,
        placementStatus: "SCHEDULED",
        origin: "ORIGINAL",
        title: "杭州",
        introducedRevision: 1,
        createdAt: now,
        updatedAt: now,
        type: "SECTION",
        detail: {
          kind: "CITY",
          timeZone: "Asia/Shanghai",
          lat: 30.2741,
          lng: 120.1551,
          coordinateSystem: "GCJ02",
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

function invalidTimeGraph(id: string): TargetJourneyGraphSnapshot {
  const snapshot = graph(id)
  const first = snapshot.events.find((event) => event.type === "VISIT")!
  const second = structuredClone(first)
  second.id = `${id}-visit-2`
  second.title = "灵隐寺"
  second.plannedStartAt = "2025-08-01T00:00:00.000Z"
  second.detail.plannedLat = 30.24
  second.detail.plannedLng = 120.1
  snapshot.events.push(second)
  snapshot.links.push({
    id: `${id}-main-1`,
    journeyId: id,
    fromEventId: first.id,
    toEventId: second.id,
    kind: "MAIN",
    rank: 1024,
    introducedRevision: 1,
  })
  return snapshot
}

function adjacentCitiesGraph(id: string): TargetJourneyGraphSnapshot {
  const snapshot = graph(id)
  const firstCity = snapshot.events.find(
    (event) => event.type === "SECTION" && event.detail.kind === "CITY"
  )!
  const secondCity = structuredClone(firstCity)
  secondCity.id = `${id}-city-2`
  secondCity.title = "苏州"
  snapshot.events.push(secondCity)
  snapshot.links.push({
    id: `${id}-root-main-2`,
    journeyId: id,
    fromEventId: firstCity.id,
    toEventId: secondCity.id,
    kind: "MAIN",
    rank: 1024,
    introducedRevision: 1,
  })
  return snapshot
}

function fourPlaceGraph(id: string): TargetJourneyGraphSnapshot {
  const snapshot = graph(id)
  const first = snapshot.events.find((event) => event.type === "VISIT")!
  first.plannedStartAt = "2026-08-01T08:00:00.000Z"
  const places = [
    { suffix: "2", title: "灵隐寺", hour: "10", lat: 30.24, lng: 120.1 },
    { suffix: "3", title: "河坊街", hour: "12", lat: 30.25, lng: 120.17 },
    { suffix: "4", title: "九溪", hour: "14", lat: 30.2, lng: 120.12 },
  ]
  for (const place of places) {
    const event = structuredClone(first)
    event.id = `${id}-visit-${place.suffix}`
    event.title = place.title
    event.plannedStartAt = `2026-08-01T${place.hour}:00:00.000Z`
    event.detail.plannedLat = place.lat
    event.detail.plannedLng = place.lng
    snapshot.events.push(event)
  }
  const ids = [first.id, `${id}-visit-2`, `${id}-visit-3`, `${id}-visit-4`]
  snapshot.links = ids.slice(0, -1).map((fromEventId, index) => ({
    id: `${id}-main-${index + 1}`,
    journeyId: id,
    fromEventId,
    toEventId: ids[index + 1]!,
    kind: "MAIN" as const,
    rank: 1024,
    introducedRevision: 1,
  }))
  return snapshot
}

type GatewayOptions = ConstructorParameters<typeof AgentGateway>[2]

async function setup(
  input: {
    snapshot?: TargetJourneyGraphSnapshot
    commands?: WorkspaceCommandService
    placeService?: GatewayOptions["placeService"]
    hotelService?: GatewayOptions["hotelService"]
    now?: () => Date
    runtimeOwnerId?: string
    agentRunLeaseSeconds?: number
  } = {}
) {
  const workspace = await createWorkspace(context, {
    graph: input.snapshot ?? graph(`agent-workspace-${randomUUID()}`),
    now: new Date(now),
  })
  const commands = input.commands ?? new WorkspaceCommandService()
  const runtime = new FakeRuntime()
  const events: AgentEvent[] = []
  const gateway = new AgentGateway(commands, runtime, {
    backendUrl: "http://127.0.0.1:3002",
    projectRoot: "/workspace/periplus",
    heartbeatIntervalMs: null,
    ...(input.placeService ? { placeService: input.placeService } : {}),
    ...(input.hotelService ? { hotelService: input.hotelService } : {}),
    ...(input.now ? { now: input.now } : {}),
    ...(input.runtimeOwnerId ? { runtimeOwnerId: input.runtimeOwnerId } : {}),
    ...(input.agentRunLeaseSeconds
      ? { agentRunLeaseSeconds: input.agentRunLeaseSeconds }
      : {}),
  })
  const emit = (_workspaceId: string, event: AgentEvent) => events.push(event)
  return { workspace, commands, runtime, events, gateway, emit }
}

function capabilityToken(runtime: FakeRuntime) {
  const content = runtime.request?.toolServers[0]?.configFile?.content
  if (!content) throw new Error("missing Agent tool config")
  return JSON.parse(content).capabilityToken as string
}

function result<T>(value: unknown) {
  return value as T
}

function resolvedPlace(): Extract<PlaceResolveResult, { status: "resolved" }> {
  const coordinate = {
    provider: "amap" as const,
    coordinateSystem: "GCJ02" as const,
    lat: 30.251,
    lng: 120.151,
    accuracy: "provider_poi" as const,
    source: "provider_search" as const,
  }
  const place: PlaceSearchResult = {
    id: "amap-west-lake-new",
    name: "西湖风景名胜区",
    normalizedName: "西湖风景名胜区",
    aliases: ["西湖"],
    category: "SIGHT",
    city: "杭州",
    coordinates: [coordinate],
    bestCoordinate: coordinate,
    sources: [{ provider: "amap", providerId: "B-west-lake-new" }],
    confidence: 0.97,
    quality: "probable",
    canAddToJourney: true,
    needsUserConfirmation: false,
    reason: "unique live provider result",
  }
  return {
    status: "resolved",
    place,
    placeRef: {
      provider: "amap",
      providerId: "B-west-lake-new",
      canonicalName: place.name,
      city: place.city,
      lat: coordinate.lat,
      lng: coordinate.lng,
      coordinateSystem: coordinate.coordinateSystem,
      confidence: place.confidence,
      candidates: [
        {
          id: place.id,
          name: place.name,
          city: place.city,
          confidence: place.confidence,
        },
      ],
    },
    warnings: [],
  }
}

describe.sequential("AgentGateway run-scoped draft protocol", () => {
  it("accepts only the typed tool catalog and rejects the old generic DSL", () => {
    expect(
      agentToolRequestSchema.safeParse({
        type: "workspace.validate_draft",
        expectedRevision: 0,
        idempotencyKey: "old-draft",
        commands: [],
      }).success
    ).toBe(false)
    expect(
      agentToolRequestSchema.safeParse({
        type: "place.resolve_for_journey_event",
        requestId: "old-place",
        eventId: "visit-1",
        text: "西湖",
      }).success
    ).toBe(false)
    expect(
      agentToolRequestSchema.safeParse({
        type: "draft.open",
        expectedWorkspaceRevision: 0,
        idempotencyKey: "typed-draft",
        commands: [],
      }).success
    ).toBe(false)
    expect(
      agentToolRequestSchema.safeParse({
        type: "draft.open",
        expectedWorkspaceRevision: 0,
        idempotencyKey: "typed-draft",
      }).success
    ).toBe(true)
  })

  it("builds, validates, atomically commits, and confirms one draft", async () => {
    const { workspace, commands, runtime, gateway, emit } = await setup()
    await gateway.start(context, workspace.id, "调整西湖时间", "auto", emit)
    expect(runtime.request?.toolServers).toHaveLength(1)
    expect(runtime.request?.prompt).toContain("STAGE 01")
    const token = capabilityToken(runtime)

    const workspaceContext = result<{
      headWorkspaceRevision: number
      cityCards: Array<{ cardId: string }>
    }>(await gateway.executeTool(token, { type: "workspace.get_context" }))
    expect(workspaceContext).toMatchObject({ headWorkspaceRevision: 0 })
    expect(workspaceContext.cityCards).toHaveLength(1)

    const projection = result<{ cards: Array<{ cardId: string }> }>(
      await gateway.executeTool(token, {
        type: "journey.project",
        scopeCityCardId: null,
      })
    )
    expect(projection.cards.map((card) => card.cardId)).toEqual([
      `${workspace.headGraph.id}-city`,
    ])

    const opened = result<{ draftId: string }>(
      await gateway.executeTool(token, {
        type: "draft.open",
        expectedWorkspaceRevision: 0,
        idempotencyKey: "open-schedule-draft",
      })
    )
    await expect(
      gateway.executeTool(token, {
        type: "draft.connect_cards",
        draftId: opened.draftId,
        operationId: "unrequested-link-repair",
        fromCardId: `${workspace.headGraph.id}-city`,
        toCardId: `${workspace.headGraph.id}-visit`,
      })
    ).rejects.toThrow("require a validator issue")
    const mutation = result<{ changedCardIds: string[] }>(
      await gateway.executeTool(token, {
        type: "draft.update_schedule",
        draftId: opened.draftId,
        operationId: "schedule-west-lake",
        cardId: `${workspace.headGraph.id}-visit`,
        patch: { plannedStartAt: "2026-08-01T01:00:00.000Z" },
      })
    )
    expect(mutation.changedCardIds).toContain(`${workspace.headGraph.id}-visit`)
    const validation = result<{
      validation: { valid: boolean; repairsUsed: number }
    }>(
      await gateway.executeTool(token, {
        type: "draft.validate",
        draftId: opened.draftId,
        attemptId: "validate-schedule-draft",
      })
    )
    expect(validation.validation).toMatchObject({
      valid: true,
      repairsUsed: 0,
    })

    const committed = result<{
      newWorkspaceRevision: number
      replayed: boolean
    }>(
      await gateway.executeTool(token, {
        type: "draft.commit",
        draftId: opened.draftId,
        idempotencyKey: "commit-schedule-draft",
      })
    )
    expect(committed).toEqual(
      expect.objectContaining({ newWorkspaceRevision: 1, replayed: false })
    )
    const replay = result<{ replayed: boolean }>(
      await gateway.executeTool(token, {
        type: "draft.commit",
        draftId: opened.draftId,
        idempotencyKey: "commit-schedule-draft",
      })
    )
    expect(replay.replayed).toBe(true)
    await expect(
      gateway.executeTool(token, {
        type: "journey.validate_current",
        expectedWorkspaceRevision: 1,
      })
    ).resolves.toMatchObject({ valid: true, workspaceRevision: 1 })

    runtime.observer?.onStdout("已完成")
    runtime.exit(0)
    await vi.waitFor(async () => {
      const document = await commands.getDocument(context, workspace.id)
      expect(document?.session.headWorkspaceRevision).toBe(1)
      expect(document?.agentRuns.at(-1)?.status).toBe("SUCCEEDED")
      expect(document?.messages.at(-1)?.content).toBe("已完成")
    })
    await expect(
      gateway.executeTool(token, { type: "workspace.get_context" })
    ).rejects.toThrow("invalid or expired")
  })

  it("binds place changes to one run-scoped resolution handle", async () => {
    const placeService = {
      searchPlaces: vi.fn().mockResolvedValue({ results: [], warnings: [] }),
      resolvePlace: vi.fn().mockResolvedValue(resolvedPlace()),
      enrichPlace: vi.fn().mockResolvedValue({ results: [], warnings: [] }),
      verifyPlaceImages: vi
        .fn()
        .mockResolvedValue({ images: [], warnings: [] }),
    }
    const snapshot = graph(`place-handle-${randomUUID()}`)
    const visit = snapshot.events.find((event) => event.type === "VISIT")!
    visit.detail.coordinateProvider = "amap"
    visit.detail.providerPlaceId = "old-provider-id"
    visit.detail.providerCoverImage = {
      provider: "amap",
      url: "https://images.example/old.jpg",
      fetchedAt: now,
    }
    const first = await setup({ snapshot, placeService })
    await first.gateway.start(
      context,
      first.workspace.id,
      "更换西湖地点",
      "auto",
      first.emit
    )
    const firstToken = capabilityToken(first.runtime)
    const resolved = result<{ placeResolutionId: string }>(
      await first.gateway.executeTool(firstToken, {
        type: "place.resolve",
        requestId: "resolve-west-lake",
        text: "西湖",
        city: "杭州",
      })
    )
    const opened = result<{ draftId: string }>(
      await first.gateway.executeTool(firstToken, {
        type: "draft.open",
        expectedWorkspaceRevision: 0,
        idempotencyKey: "open-place-draft",
      })
    )
    await first.gateway.executeTool(firstToken, {
      type: "draft.change_place",
      draftId: opened.draftId,
      operationId: "change-west-lake-place",
      cardId: `${snapshot.id}-visit`,
      placeResolutionId: resolved.placeResolutionId,
      includeAvailableCoverImage: false,
    })
    await expect(
      first.gateway.executeTool(firstToken, {
        type: "draft.validate",
        draftId: opened.draftId,
        attemptId: "validate-place-draft",
      })
    ).resolves.toMatchObject({ validation: { valid: true } })
    await first.gateway.executeTool(firstToken, {
      type: "draft.commit",
      draftId: opened.draftId,
      idempotencyKey: "commit-place-draft",
    })
    await first.gateway.executeTool(firstToken, {
      type: "journey.validate_current",
      expectedWorkspaceRevision: 1,
    })
    const committedVisit = (
      await first.commands.getDocument(context, first.workspace.id)
    )?.session.headGraph.events.find((event) => event.type === "VISIT")
    expect(committedVisit).toMatchObject({
      title: "西湖风景名胜区",
      detail: { providerPlaceId: "B-west-lake-new" },
    })
    expect(committedVisit?.detail).not.toHaveProperty("providerCoverImage")

    const second = await setup({ placeService })
    await second.gateway.start(
      context,
      second.workspace.id,
      "复用别的运行 handle",
      "auto",
      second.emit
    )
    const secondToken = capabilityToken(second.runtime)
    const secondOpened = result<{ draftId: string }>(
      await second.gateway.executeTool(secondToken, {
        type: "draft.open",
        expectedWorkspaceRevision: 0,
        idempotencyKey: "open-second-place-draft",
      })
    )
    await expect(
      second.gateway.executeTool(secondToken, {
        type: "draft.change_place",
        draftId: secondOpened.draftId,
        operationId: "cross-run-place-handle",
        cardId: `${second.workspace.headGraph.id}-visit`,
        placeResolutionId: resolved.placeResolutionId,
      })
    ).rejects.toThrow("belongs to another Agent run")

    first.runtime.exit(0)
    second.runtime.exit(0)
  })

  it("does not attach images from an unapproved enrichment candidate", async () => {
    const resolved = resolvedPlace()
    resolved.place.placeId = "catalog-west-lake"
    const unsafeImage = {
      provider: "amap" as const,
      url: "https://images.example/wrong-place.jpg",
      fetchedAt: now,
    }
    const placeService = {
      searchPlaces: vi.fn().mockResolvedValue({ results: [], warnings: [] }),
      resolvePlace: vi.fn().mockResolvedValue(resolved),
      enrichPlace: vi.fn().mockResolvedValue({
        matchStatus: "PENDING_REVIEW" as const,
        results: [{ ...resolved.place, images: [unsafeImage] }],
        reason: "provider match needs review",
        warnings: [],
      }),
      verifyPlaceImages: vi.fn(),
    }
    const { workspace, runtime, gateway, emit } = await setup({ placeService })
    await gateway.start(context, workspace.id, "补充西湖图片", "auto", emit)
    const token = capabilityToken(runtime)
    const place = result<{ placeResolutionId: string }>(
      await gateway.executeTool(token, {
        type: "place.resolve",
        requestId: "resolve-image-place",
        text: "西湖",
      })
    )
    const enrichment = result<{
      images: unknown[]
      warnings: Array<{ code: string }>
    }>(
      await gateway.executeTool(token, {
        type: "place.enrich",
        requestId: "enrich-image-place",
        placeResolutionId: place.placeResolutionId,
        fields: ["images"],
      })
    )

    expect(enrichment.images).toEqual([])
    expect(enrichment.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "IMAGE_UNAVAILABLE" }),
      ])
    )
    runtime.exit(0)
  })

  it("materializes only the first hotel candidate from its selection handle", async () => {
    const hotelService = {
      searchHotels: vi.fn().mockResolvedValue({
        candidates: [
          {
            candidateId: "rollinggo-first",
            provider: "rollinggo" as const,
            providerHotelId: "first",
            name: "首位酒店",
            coordinates: { lat: 30.26, lng: 120.16 },
            fetchedAt: "2026-08-03T00:00:00.000Z",
          },
          {
            candidateId: "rollinggo-second",
            provider: "rollinggo" as const,
            providerHotelId: "second",
            name: "第二酒店",
            coordinates: { lat: 30.27, lng: 120.17 },
            fetchedAt: "2026-08-03T00:00:00.000Z",
          },
        ],
        warnings: [],
      }),
    }
    const { workspace, commands, runtime, gateway, emit } = await setup({
      hotelService,
    })
    await gateway.start(context, workspace.id, "推荐杭州酒店", "auto", emit)
    const token = capabilityToken(runtime)
    const search = result<{
      count: number
      hotelSelectionId: string
      firstCandidate: { name: string }
    }>(
      await gateway.executeTool(token, {
        type: "hotel.search",
        requestId: "hotel-search-first",
        originQuery: "杭州酒店",
        place: "杭州",
        placeType: "城市",
        checkInDate: "2026-08-02",
        stayNights: 1,
        adultCount: 2,
      })
    )
    expect(search).toMatchObject({
      count: 2,
      firstCandidate: { name: "首位酒店" },
    })
    expect(search).not.toHaveProperty("candidates")

    const opened = result<{ draftId: string }>(
      await gateway.executeTool(token, {
        type: "draft.open",
        expectedWorkspaceRevision: 0,
        idempotencyKey: "open-hotel-draft",
      })
    )
    await gateway.executeTool(token, {
      type: "draft.add_hotel_stay_card",
      draftId: opened.draftId,
      operationId: "add-first-hotel",
      card: {
        cardId: "stay-first-hotel",
        hotelSelectionId: search.hotelSelectionId,
        plannedStartAt: "2026-08-02T00:00:00.000Z",
      },
      cityCardId: `${workspace.headGraph.id}-city`,
      position: {
        placement: "END",
        scopeCityCardId: `${workspace.headGraph.id}-city`,
      },
    })
    await expect(
      gateway.executeTool(token, {
        type: "draft.add_hotel_stay_card",
        draftId: opened.draftId,
        operationId: "reuse-first-hotel",
        card: {
          cardId: "stay-reused-hotel",
          hotelSelectionId: search.hotelSelectionId,
          plannedStartAt: "2026-08-03T00:00:00.000Z",
        },
        cityCardId: `${workspace.headGraph.id}-city`,
        position: {
          placement: "END",
          scopeCityCardId: `${workspace.headGraph.id}-city`,
        },
      })
    ).rejects.toThrow("materialized only once")
    await expect(
      gateway.executeTool(token, {
        type: "draft.validate",
        draftId: opened.draftId,
        attemptId: "validate-hotel-draft",
      })
    ).resolves.toMatchObject({ validation: { valid: true } })
    await gateway.executeTool(token, {
      type: "draft.commit",
      draftId: opened.draftId,
      idempotencyKey: "commit-hotel-draft",
    })
    await gateway.executeTool(token, {
      type: "journey.validate_current",
      expectedWorkspaceRevision: 1,
    })
    const stay = (
      await commands.getDocument(context, workspace.id)
    )?.session.headGraph.events.find((event) => event.type === "STAY")
    expect(stay).toMatchObject({
      title: "首位酒店",
      detail: {
        providerPlaceId: "first",
        hotelOffer: { providerHotelId: "first" },
      },
    })
    runtime.exit(0)
  })

  it("allows one initial validation and five issue-scoped repairs", async () => {
    const snapshot = invalidTimeGraph(`five-repairs-${randomUUID()}`)
    const { workspace, runtime, gateway, emit } = await setup({ snapshot })
    await gateway.start(context, workspace.id, "修复时间顺序", "auto", emit)
    const token = capabilityToken(runtime)
    const opened = result<{ draftId: string }>(
      await gateway.executeTool(token, {
        type: "draft.open",
        expectedWorkspaceRevision: 0,
        idempotencyKey: "open-five-repair-draft",
      })
    )
    let validation = result<{
      validation: {
        valid: boolean
        repairsUsed: number
        issues: Array<{
          code: string
          issueId: string
          repairability: string
          allowedTools: string[]
        }>
      }
    }>(
      await gateway.executeTool(token, {
        type: "draft.validate",
        draftId: opened.draftId,
        attemptId: "initial-validation",
      })
    )
    expect(validation.validation).toMatchObject({
      valid: false,
      repairsUsed: 0,
    })
    expect(
      validation.validation.issues.find(
        (candidate) => candidate.code === "TIME_ORDER_INVALID"
      )
    ).toMatchObject({
      repairability: "AGENT",
      allowedTools: [
        "periplus.draft.update_schedule",
        "periplus.draft.move_card",
      ],
    })
    await expect(
      gateway.executeTool(token, {
        type: "draft.validate",
        draftId: opened.draftId,
        attemptId: "initial-validation",
      })
    ).resolves.toEqual(validation)

    const initialIssue = validation.validation.issues.find(
      (candidate) => candidate.code === "TIME_ORDER_INVALID"
    )!
    await expect(
      gateway.executeTool(token, {
        type: "draft.update_schedule",
        draftId: opened.draftId,
        operationId: "no-op-time-repair",
        issueId: initialIssue.issueId,
        cardId: `${snapshot.id}-visit-2`,
        patch: { plannedStartAt: "2025-08-01T00:00:00.000Z" },
      })
    ).resolves.toMatchObject({ changedCardIds: [] })
    await expect(
      gateway.executeTool(token, {
        type: "draft.validate",
        draftId: opened.draftId,
        attemptId: "no-op-validation",
      })
    ).resolves.toEqual(validation)

    for (let repair = 1; repair <= 5; repair += 1) {
      const issue = validation.validation.issues.find(
        (candidate) => candidate.code === "TIME_ORDER_INVALID"
      )!
      await gateway.executeTool(token, {
        type: "draft.update_schedule",
        draftId: opened.draftId,
        operationId: `repair-time-${repair}`,
        issueId: issue.issueId,
        cardId: `${snapshot.id}-visit-2`,
        patch: {
          plannedStartAt: `2025-07-${10 + repair}T00:00:00.000Z`,
        },
      })
      validation = result<typeof validation>(
        await gateway.executeTool(token, {
          type: "draft.validate",
          draftId: opened.draftId,
          attemptId: `repair-validation-${repair}`,
        })
      )
      expect(validation.validation).toMatchObject({
        valid: false,
        repairsUsed: repair,
      })
    }
    const issue = validation.validation.issues.find(
      (candidate) => candidate.code === "TIME_ORDER_INVALID"
    )!
    expect(issue.repairability).toBe("USER")
    await expect(
      gateway.executeTool(token, {
        type: "draft.update_schedule",
        draftId: opened.draftId,
        operationId: "repair-time-6",
        issueId: issue.issueId,
        cardId: `${snapshot.id}-visit-2`,
        patch: { plannedStartAt: "2025-08-06T00:00:00.000Z" },
      })
    ).rejects.toThrow("repair limit is exhausted")
    runtime.exit(0)
  })

  it("returns the affected scope cards for a projection repair", async () => {
    const snapshot = graph(`projection-${randomUUID()}`)
    const { workspace, runtime, gateway, emit } = await setup({ snapshot })
    await gateway.start(context, workspace.id, "修复断开的城市链", "auto", emit)
    const token = capabilityToken(runtime)
    const opened = result<{ draftId: string }>(
      await gateway.executeTool(token, {
        type: "draft.open",
        expectedWorkspaceRevision: 0,
        idempotencyKey: "open-projection-draft",
      })
    )
    const running = (
      gateway as unknown as {
        runs: Map<
          string,
          { draftSession: { candidate: AgentDraftCandidate | null } }
        >
      }
    ).runs.get(workspace.id)!
    const candidate = running.draftSession.candidate!
    const second = structuredClone(
      candidate.after.events.find((event) => event.type === "VISIT")!
    )
    second.id = `${snapshot.id}-visit-2`
    second.title = "灵隐寺"
    second.plannedStartAt = "2026-08-01T02:00:00.000Z"
    candidate.after.events.push(second)
    const validation = result<{
      validation: {
        issues: Array<{
          code: string
          scopeCityCardId?: string | null
          cardIds: string[]
          allowedTools: string[]
        }>
      }
    }>(
      await gateway.executeTool(token, {
        type: "draft.validate",
        draftId: opened.draftId,
        attemptId: "validate-projection-draft",
      })
    )
    const issue = validation.validation.issues.find(
      (candidate) =>
        candidate.code === "PROJECTION_INVALID" &&
        candidate.scopeCityCardId === `${snapshot.id}-city`
    )

    expect(issue).toMatchObject({
      cardIds: expect.arrayContaining([
        `${snapshot.id}-visit`,
        `${snapshot.id}-visit-2`,
      ]),
      allowedTools: [
        "periplus.draft.connect_cards",
        "periplus.draft.disconnect_cards",
      ],
    })
    runtime.exit(0)
  })

  it("allows a missing Root Transit to target both adjacent City cards", async () => {
    const snapshot = adjacentCitiesGraph(`root-transit-${randomUUID()}`)
    const { workspace, runtime, gateway, emit } = await setup({ snapshot })
    await gateway.start(context, workspace.id, "补齐跨城交通", "auto", emit)
    const token = capabilityToken(runtime)
    const opened = result<{ draftId: string }>(
      await gateway.executeTool(token, {
        type: "draft.open",
        expectedWorkspaceRevision: 0,
        idempotencyKey: "open-root-transit",
      })
    )
    const firstValidation = result<{
      validation: {
        issues: Array<{
          code: string
          issueId: string
          allowedTools: string[]
        }>
      }
    }>(
      await gateway.executeTool(token, {
        type: "draft.validate",
        draftId: opened.draftId,
        attemptId: "validate-root-transit",
      })
    )
    const issue = firstValidation.validation.issues.find(
      (candidate) => candidate.code === "ROOT_ROUTE_DISCONNECTED"
    )!
    expect(issue.allowedTools).toContain("periplus.draft.add_transit_card")

    await expect(
      gateway.executeTool(token, {
        type: "draft.add_transit_card",
        draftId: opened.draftId,
        operationId: "repair-root-transit",
        issueId: issue.issueId,
        card: {
          cardId: `${snapshot.id}-root-transit`,
          fromCardId: `${snapshot.id}-city`,
          toCardId: `${snapshot.id}-city-2`,
          plannedStartAt: "2026-08-02T08:00:00.000Z",
          transportMode: "TRAIN",
        },
      })
    ).resolves.toMatchObject({ changedCardIds: expect.any(Array) })
    runtime.exit(0)
  })

  it("prepares more than two Transit cards without consuming repair attempts", async () => {
    const snapshot = fourPlaceGraph(`three-transits-${randomUUID()}`)
    const plan = vi.fn(async (request: TransitPlanRequest) => ({
      transitEventId: request.transitEventId,
      requestFingerprint: transitPlanFingerprint(request),
      plans: [
        {
          id: `plan-${request.transitEventId}`,
          provider: "mock" as const,
          rank: 0,
          label: "推荐",
          strategy: "recommended",
          distanceMeters: 2_000,
          durationSeconds: 900,
          trafficBasis: "TYPICAL" as const,
          calculatedAt: now,
          requestFingerprint: transitPlanFingerprint(request),
          segments: [],
        },
      ],
    }))
    const commands = new WorkspaceCommandService({
      transitPlanning: { plan },
    })
    const { workspace, runtime, gateway, emit } = await setup({
      snapshot,
      commands,
    })
    await gateway.start(context, workspace.id, "补全三段交通", "auto", emit)
    const token = capabilityToken(runtime)
    const opened = result<{ draftId: string }>(
      await gateway.executeTool(token, {
        type: "draft.open",
        expectedWorkspaceRevision: 0,
        idempotencyKey: "open-three-transits",
      })
    )
    const pairs = [
      [`${snapshot.id}-visit`, `${snapshot.id}-visit-2`],
      [`${snapshot.id}-visit-2`, `${snapshot.id}-visit-3`],
      [`${snapshot.id}-visit-3`, `${snapshot.id}-visit-4`],
    ] as const
    for (const [index, pair] of pairs.entries()) {
      const hour = String(9 + index * 2).padStart(2, "0")
      await gateway.executeTool(token, {
        type: "draft.add_transit_card",
        draftId: opened.draftId,
        operationId: `add-transit-${index}`,
        card: {
          cardId: `transit-${index}`,
          fromCardId: pair[0],
          toCardId: pair[1],
          plannedStartAt: `2026-08-01T${hour}:00:00.000Z`,
          transportMode: "CAR",
        },
      })
    }
    const initial = result<{
      validation: {
        valid: boolean
        repairsUsed: number
        issues: Array<{
          code: string
          cardIds: string[]
          repairability: string
          allowedTools: string[]
        }>
      }
    }>(
      await gateway.executeTool(token, {
        type: "draft.validate",
        draftId: opened.draftId,
        attemptId: "validate-three-transits",
      })
    )
    const transitIssues = initial.validation.issues.filter(
      (issue) => issue.code === "TRANSIT_ROUTE_NOT_READY"
    )
    expect(transitIssues).toHaveLength(3)
    expect(transitIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          repairability: "AGENT",
          allowedTools: ["periplus.draft.prepare_transit"],
        }),
      ])
    )
    expect(initial.validation.repairsUsed).toBe(0)

    let prepared: unknown
    for (let index = 0; index < pairs.length; index += 1) {
      prepared = await gateway.executeTool(token, {
        type: "draft.prepare_transit",
        draftId: opened.draftId,
        operationId: `prepare-transit-${index}`,
        transitCardId: `transit-${index}`,
      })
    }
    expect(prepared).toMatchObject({
      validation: { valid: true, repairsUsed: 0 },
    })
    expect(plan).toHaveBeenCalledTimes(3)
    runtime.exit(0)
  })

  it("rejects commit when the Workspace revision advances concurrently", async () => {
    const { workspace, commands, runtime, gateway, emit } = await setup()
    await gateway.start(context, workspace.id, "并发更新", "auto", emit)
    const token = capabilityToken(runtime)
    const opened = result<{ draftId: string }>(
      await gateway.executeTool(token, {
        type: "draft.open",
        expectedWorkspaceRevision: 0,
        idempotencyKey: "open-concurrent-draft",
      })
    )
    await gateway.executeTool(token, {
      type: "draft.update_schedule",
      draftId: opened.draftId,
      operationId: "draft-schedule-change",
      cardId: `${workspace.headGraph.id}-visit`,
      patch: { plannedStartAt: "2026-08-01T01:00:00.000Z" },
    })
    await gateway.executeTool(token, {
      type: "draft.validate",
      draftId: opened.draftId,
      attemptId: "validate-concurrent-draft",
    })
    await commands.execute(context, {
      aggregateId: workspace.id,
      expectedRevision: 0,
      idempotencyKey: "concurrent-user-write",
      actor: { kind: "USER", userId: context.userId },
      command: {
        name: "journey.update_event",
        payload: {
          eventId: `${workspace.headGraph.id}-visit`,
          patch: { type: "VISIT", description: "用户并发更新" },
        },
      },
    })
    await expect(
      gateway.executeTool(token, {
        type: "draft.commit",
        draftId: opened.draftId,
        idempotencyKey: "commit-concurrent-draft",
      })
    ).rejects.toThrow("updated by another request")
    runtime.exit(0)
  })

  it("rejects final confirmation when the Workspace advances after commit", async () => {
    const { workspace, commands, runtime, gateway, emit } = await setup()
    await gateway.start(context, workspace.id, "提交后并发更新", "auto", emit)
    const token = capabilityToken(runtime)
    const opened = result<{ draftId: string }>(
      await gateway.executeTool(token, {
        type: "draft.open",
        expectedWorkspaceRevision: 0,
        idempotencyKey: "open-post-commit-race",
      })
    )
    await gateway.executeTool(token, {
      type: "draft.update_schedule",
      draftId: opened.draftId,
      operationId: "post-commit-race-schedule",
      cardId: `${workspace.headGraph.id}-visit`,
      patch: { plannedStartAt: "2026-08-01T01:00:00.000Z" },
    })
    await gateway.executeTool(token, {
      type: "draft.validate",
      draftId: opened.draftId,
      attemptId: "validate-post-commit-race",
    })
    const commitAgentDraft = commands.commitAgentDraft.bind(commands)
    vi.spyOn(commands, "commitAgentDraft").mockImplementation(
      async (commitContext, draft, options) => {
        const committed = await commitAgentDraft(commitContext, draft, options)
        await commands.execute(context, {
          aggregateId: workspace.id,
          expectedRevision: committed.newRevision,
          idempotencyKey: "post-commit-user-write",
          actor: { kind: "USER", userId: context.userId },
          command: {
            name: "journey.update_event",
            payload: {
              eventId: `${workspace.headGraph.id}-visit`,
              patch: { type: "VISIT", description: "并发用户修改" },
            },
          },
        })
        return committed
      }
    )
    const committed = result<{ newWorkspaceRevision: number }>(
      await gateway.executeTool(token, {
        type: "draft.commit",
        draftId: opened.draftId,
        idempotencyKey: "commit-post-commit-race",
      })
    )

    await expect(
      gateway.executeTool(token, {
        type: "journey.validate_current",
        expectedWorkspaceRevision: committed.newWorkspaceRevision,
      })
    ).rejects.toThrow("updated by another request")
    runtime.exit(0)
    await vi.waitFor(async () => {
      expect(
        (await commands.getDocument(context, workspace.id))?.agentRuns.at(-1)
      ).toMatchObject({
        status: "FAILED",
        errorCode: "PLAN_VALIDATION_REQUIRED",
      })
    })
  })

  it("fails an auto run that commits without final canonical validation", async () => {
    const { workspace, commands, runtime, gateway, emit } = await setup()
    await gateway.start(context, workspace.id, "省略最终确认", "auto", emit)
    const token = capabilityToken(runtime)
    const opened = result<{ draftId: string }>(
      await gateway.executeTool(token, {
        type: "draft.open",
        expectedWorkspaceRevision: 0,
        idempotencyKey: "open-missing-final-validation",
      })
    )
    await gateway.executeTool(token, {
      type: "draft.update_schedule",
      draftId: opened.draftId,
      operationId: "missing-final-validation-update",
      cardId: `${workspace.headGraph.id}-visit`,
      patch: { plannedStartAt: "2026-08-01T01:00:00.000Z" },
    })
    await gateway.executeTool(token, {
      type: "draft.validate",
      draftId: opened.draftId,
      attemptId: "validate-missing-final",
    })
    await gateway.executeTool(token, {
      type: "draft.commit",
      draftId: opened.draftId,
      idempotencyKey: "commit-missing-final",
    })
    runtime.exit(0)
    await vi.waitFor(async () => {
      expect(
        (await commands.getDocument(context, workspace.id))?.agentRuns.at(-1)
      ).toMatchObject({
        status: "FAILED",
        errorCode: "PLAN_VALIDATION_REQUIRED",
      })
    })
  })

  it("keeps Suggest mode tool-free and persists only a suggestion", async () => {
    const { workspace, commands, runtime, gateway, emit } = await setup()
    await gateway.start(context, workspace.id, "给出修改建议", "suggest", emit)
    expect(runtime.request?.toolServers).toEqual([])
    runtime.observer?.onStdout(
      JSON.stringify({
        title: "调整西湖标题",
        summary: "仅建议，不自动执行",
        basedOnWorkspaceRevision: 0,
        commands: [
          {
            expectedRevision: 0,
            idempotencyKey: "suggest-update",
            command: {
              name: "journey.update_event",
              payload: {
                eventId: `${workspace.headGraph.id}-visit`,
                patch: { type: "VISIT", title: "建议标题" },
              },
            },
          },
        ],
      })
    )
    runtime.exit(0)
    await vi.waitFor(async () => {
      const document = await commands.getDocument(context, workspace.id)
      expect(document?.suggestions).toHaveLength(1)
      expect(document?.agentRuns.at(-1)?.status).toBe("SUCCEEDED")
      expect(document?.session.headWorkspaceRevision).toBe(0)
    })
  })

  it("drops an uncommitted run-scoped draft when reclaiming a crash orphan", async () => {
    const workspace = await createWorkspace(context, {
      graph: graph(`agent-restart-${randomUUID()}`),
      now: new Date(now),
    })
    const commands = new WorkspaceCommandService()
    let clock = new Date("2026-08-01T00:00:00.000Z")
    const runtime1 = new FakeRuntime()
    const gateway1 = new AgentGateway(commands, runtime1, {
      backendUrl: "http://127.0.0.1:3002",
      projectRoot: "/workspace/periplus",
      runtimeOwnerId: "runtime-epoch-1",
      agentRunLeaseSeconds: 10,
      heartbeatIntervalMs: null,
      now: () => clock,
    })
    const emit = vi.fn()
    await gateway1.start(context, workspace.id, "first prompt", "auto", emit)
    const token = capabilityToken(runtime1)
    const opened = result<{ draftId: string }>(
      await gateway1.executeTool(token, {
        type: "draft.open",
        expectedWorkspaceRevision: 0,
        idempotencyKey: "draft-before-crash",
      })
    )
    await gateway1.executeTool(token, {
      type: "draft.update_schedule",
      draftId: opened.draftId,
      operationId: "uncommitted-schedule",
      cardId: `${workspace.headGraph.id}-visit`,
      patch: { plannedStartAt: "2026-08-01T03:00:00.000Z" },
    })
    runtime1.observer?.onStdout("partial stdout is durable")
    await vi.waitFor(async () => {
      expect(
        (await commands.getDocument(context, workspace.id, clock))?.messages.at(
          -1
        )?.content
      ).toBe("partial stdout is durable")
    })

    clock = new Date("2026-08-01T00:00:11.000Z")
    const runtime2 = new FakeRuntime()
    const gateway2 = new AgentGateway(commands, runtime2, {
      backendUrl: "http://127.0.0.1:3002",
      projectRoot: "/workspace/periplus",
      runtimeOwnerId: "runtime-epoch-2",
      agentRunLeaseSeconds: 10,
      heartbeatIntervalMs: null,
      now: () => clock,
    })
    await gateway2.start(context, workspace.id, "resume prompt", "auto", emit)

    const recovered = await commands.getDocument(context, workspace.id, clock)
    expect(recovered?.agentRuns).toMatchObject([
      { status: "FAILED", errorCode: "AGENT_RUN_ORPHANED" },
      { status: "RUNNING", runtimeOwnerId: "runtime-epoch-2" },
    ])
    expect(recovered?.messages.map((message) => message.content)).toEqual([
      "first prompt",
      "partial stdout is durable",
      "resume prompt",
      "",
    ])
    expect(recovered?.session.headWorkspaceRevision).toBe(0)
    const recoveredVisit = recovered?.session.headGraph.events.find(
      (event) => event.id === `${workspace.headGraph.id}-visit`
    )
    expect(recoveredVisit?.type).toBe("VISIT")
    if (recoveredVisit?.type !== "VISIT") {
      throw new Error("Expected recovered VISIT")
    }
    expect(recoveredVisit.plannedStartAt).toBe(now)

    runtime2.exit(0)
    await vi.waitFor(async () => {
      expect(
        (
          await commands.getDocument(context, workspace.id, clock)
        )?.agentRuns.at(-1)?.status
      ).toBe("SUCCEEDED")
    })
  })

  it("preserves explicit cancellation", async () => {
    const { workspace, commands, runtime, gateway, emit } = await setup()
    await gateway.start(context, workspace.id, "取消本次运行", "auto", emit)
    gateway.cancel(workspace.id)
    expect(runtime.cancel).toHaveBeenCalledOnce()
    runtime.exit(null)
    await vi.waitFor(async () => {
      expect(
        (await commands.getDocument(context, workspace.id))?.agentRuns.at(-1)
          ?.status
      ).toBe("CANCELLED")
    })
  })
})
