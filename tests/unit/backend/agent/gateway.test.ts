import { randomUUID } from "node:crypto"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { AgentGateway } from "@/backend/agent/gateway"
import {
  MemoryEvalTraceSink,
  validateWriteProtocolCapability,
  verifyEvalTrace,
  type EvalTraceEvent,
  type EvalTraceInput,
  type EvalTraceSink,
} from "@/backend/agent/evals"
import type {
  AgentRuntime,
  AgentRuntimeExit,
  AgentRuntimeObserver,
  AgentRuntimeRequest,
} from "@/backend/agent/runtime"
import type { AgentEvent } from "@/backend/types"
import {
  TARGET_CONTRACT_FIXTURES,
  type PlanValidationReport,
  type TargetJourneyGraphSnapshot,
} from "@/modules/data-model/contracts"
import { prisma } from "@/modules/data/db/prisma"
import { PlaceIntelligenceService } from "@/modules/data/places/place-service"
import { createWorkspace } from "@/modules/data/workspaces/workspace-repository"
import { WorkspaceCommandService } from "@/modules/workspace/server/workspace-command-service"

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

class ValidatorFailingTraceSink implements EvalTraceSink {
  readonly delegate = new MemoryEvalTraceSink()
  private failure: Error | null = null

  get events(): readonly EvalTraceEvent[] {
    return this.delegate.events
  }

  async emit(input: EvalTraceInput) {
    if (input.type === "validator.completed") {
      this.failure = new Error("injected validator trace failure")
      throw this.failure
    }
    return this.delegate.emit(input)
  }

  async close() {
    if (this.failure) throw this.failure
    await this.delegate.close()
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

function emptyRootGraph(id: string): TargetJourneyGraphSnapshot {
  return { ...graph(id), events: [] }
}

function cityRouteGraph(id: string): TargetJourneyGraphSnapshot {
  const snapshot = graph(id)
  const visit = snapshot.events.find((event) => event.type === "VISIT")
  if (!visit) throw new Error("expected visit fixture")
  const secondVisit = {
    ...visit,
    id: `${id}-visit-2`,
    title: "灵隐寺",
    plannedStartAt: "2026-08-02T00:00:00.000Z",
    detail: {
      ...visit.detail,
      plannedLat: 30.24,
      plannedLng: 120.1,
    },
  }
  snapshot.events.push(secondVisit)
  snapshot.links.push({
    id: `${id}-city-main`,
    journeyId: id,
    fromEventId: visit.id,
    toEventId: secondVisit.id,
    kind: "MAIN",
    rank: 1024,
    introducedRevision: 1,
  })
  return snapshot
}

async function setup(evalTrace?: { scenarioId: string; sink: EvalTraceSink }) {
  const workspace = await createWorkspace(context, {
    graph: graph(`agent-workspace-${randomUUID()}`),
    now: new Date(now),
  })
  const commands = new WorkspaceCommandService()
  const runtime = new FakeRuntime()
  const events: AgentEvent[] = []
  const gateway = new AgentGateway(commands, runtime, {
    backendUrl: "http://127.0.0.1:3002",
    projectRoot: "/workspace/periplus",
    evalTrace,
  })
  const emit = (_workspaceId: string, event: AgentEvent) => events.push(event)
  return { workspace, commands, runtime, events, gateway, emit }
}

function capabilityToken(runtime: FakeRuntime) {
  const content = runtime.request?.toolServers[0]?.configFile?.content
  if (!content) throw new Error("missing Agent tool config")
  return JSON.parse(content).capabilityToken as string
}

function visitDescriptionCommand(workspaceId: string, description: string) {
  return {
    name: "journey.update_event" as const,
    payload: {
      eventId: `${workspaceId}-visit`,
      patch: { type: "VISIT" as const, description },
    },
  }
}

async function validateAndCommit(
  gateway: AgentGateway,
  token: string,
  input: {
    expectedRevision: number
    idempotencyKey: string
    commands: unknown[]
    previousDraftId?: string
  }
) {
  const draft = await gateway.executeTool(token, {
    type: "workspace.validate_draft",
    ...input,
  })
  expect(draft.validation.valid).toBe(true)
  return {
    draft,
    committed: await gateway.executeTool(token, {
      type: "workspace.commit_draft",
      draftId: draft.draftId,
    }),
  }
}

describe.sequential("P3 persistent AgentGateway", () => {
  it("rejects direct Agent writes without creating a revision", async () => {
    const sink = new MemoryEvalTraceSink()
    const { workspace, commands, runtime, gateway, emit } = await setup({
      scenarioId: "gateway-command-observability",
      sink,
    })
    await gateway.start(context, workspace.id, "更新西湖标题", "auto", emit)
    await expect(
      gateway.executeTool(capabilityToken(runtime), {
        type: "workspace.command",
        expectedRevision: 0,
        idempotencyKey: "direct-write-is-blocked",
        command: {
          name: "journey.update_event",
          payload: {
            eventId: `${workspace.headGraph.id}-visit`,
            patch: { type: "VISIT", description: "不应写入" },
          },
        },
      })
    ).rejects.toThrow("direct Workspace commands are disabled")
    expect(
      (await commands.getDocument(context, workspace.id))?.session
        .headWorkspaceRevision
    ).toBe(0)
    runtime.exit(0)
    await vi.waitFor(async () => {
      expect(
        (await commands.getDocument(context, workspace.id))?.agentRuns.at(-1)
          ?.status
      ).toBe("SUCCEEDED")
      expect(sink.events.at(-1)?.type).toBe("run.completed")
    })
    await sink.close()

    expect(verifyEvalTrace(sink.events)).toEqual({ valid: true, issues: [] })
    expect(sink.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "run.started",
        "tool.started",
        "command.dispatched",
        "command.rejected",
        "tool.failed",
        "run.completed",
      ])
    )
    expect(
      validateWriteProtocolCapability("gateway-command", sink.events).hardPass
    ).toBe(true)
  })

  it("does not change an atomically committed draft when validator tracing fails", async () => {
    const sink = new ValidatorFailingTraceSink()
    const { workspace, commands, runtime, gateway, emit } = await setup({
      scenarioId: "gateway-trace-failure-isolation",
      sink,
    })
    await gateway.start(context, workspace.id, "更新西湖标题", "auto", emit)

    const draft = await gateway.executeTool(capabilityToken(runtime), {
      type: "workspace.validate_draft",
      expectedRevision: 0,
      idempotencyKey: "eval-trace-failure-update",
      commands: [
        visitDescriptionCommand(workspace.headGraph.id, "Trace 失败后仍提交"),
      ],
    })
    expect(draft.validation).toMatchObject({ valid: true })
    const mutation = await gateway.executeTool(capabilityToken(runtime), {
      type: "workspace.commit_draft",
      draftId: draft.draftId,
    })

    expect(mutation.result).toMatchObject({ newRevision: 1 })
    expect(
      (await commands.getDocument(context, workspace.id))?.session.headGraph
        .events[0]?.description
    ).toBe("Trace 失败后仍提交")
    expect(sink.events.map((event) => event.type)).toEqual([
      "run.started",
      "tool.started",
    ])
    expect(verifyEvalTrace(sink.events).valid).toBe(false)
    await expect(sink.close()).rejects.toThrow(
      "injected validator trace failure"
    )

    runtime.exit(0)
    await vi.waitFor(async () => {
      expect(
        (await commands.getDocument(context, workspace.id))?.agentRuns.at(-1)
          ?.status
      ).toBe("SUCCEEDED")
    })
  })

  it("runs with a scoped capability and persists commands/messages across restart", async () => {
    const { workspace, commands, runtime, events, gateway, emit } =
      await setup()
    await gateway.start(context, workspace.id, "规划杭州路线", "auto", emit)

    expect(runtime.request).toMatchObject({
      prompt: expect.stringContaining("规划杭州路线"),
      toolServers: [
        {
          id: "periplus-workspace",
          configFile: {
            argument: "--config",
            content: expect.stringContaining('"capabilityToken"'),
          },
        },
      ],
    })
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "workspace.locked" }),
        expect.objectContaining({ type: "agent.run.started" }),
      ])
    )
    const started = await commands.getDocument(context, workspace.id)
    const assistantMessage = started?.messages.find(
      (message) => message.role === "ASSISTANT"
    )
    expect(started?.messages).toMatchObject([
      { role: "USER", content: "规划杭州路线" },
      { role: "ASSISTANT", content: "" },
    ])
    expect(assistantMessage?.agentRunId).toBe(started?.agentRuns.at(-1)?.id)

    const token = capabilityToken(runtime)
    const { committed } = await validateAndCommit(gateway, token, {
      expectedRevision: 0,
      idempotencyKey: "agent-update-visit",
      commands: [visitDescriptionCommand(workspace.headGraph.id, "Agent 更新")],
    })
    expect(committed.result).toMatchObject({ newRevision: 1 })
    await expect(
      gateway.executeTool(token, {
        type: "workspace.validate_plan",
        expectedRevision: 1,
      })
    ).resolves.toMatchObject({ valid: true })

    runtime.observer?.onStdout("已完成")
    runtime.exit(0)
    await vi.waitFor(
      async () => {
        const document = await commands.getDocument(context, workspace.id)
        expect(document?.agentRuns.at(-1)?.status).toBe("SUCCEEDED")
        expect(events.at(-1)).toMatchObject({ type: "agent.run.completed" })
      },
      { timeout: 5_000 }
    )

    const restarted = await new WorkspaceCommandService().getDocument(
      context,
      workspace.id
    )
    expect(restarted?.messages).toMatchObject([
      { role: "USER", content: "规划杭州路线" },
      { role: "ASSISTANT", content: "已完成" },
    ])
    expect(restarted?.messages).toHaveLength(2)
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "agent.message.delta",
        payload: expect.objectContaining({
          messageId: assistantMessage?.id,
          stream: "stdout",
          text: "已完成",
        }),
      })
    )
    expect(restarted?.session.headGraph.events[0]?.description).toBe(
      "Agent 更新"
    )
    await expect(
      gateway.executeTool(token, { type: "workspace.get" })
    ).rejects.toThrow("invalid or expired")
  })

  it("exposes and writes only the first hotel candidate", async () => {
    const workspace = await createWorkspace(context, {
      graph: graph(`hotel-workspace-${randomUUID()}`),
      now: new Date(now),
    })
    const commands = new WorkspaceCommandService()
    const runtime = new FakeRuntime()
    const hotelService = {
      searchHotels: vi
        .fn()
        .mockResolvedValueOnce({
          candidates: [
            {
              candidateId: "rollinggo-first",
              provider: "rollinggo",
              providerHotelId: "first",
              name: "首位酒店",
              coordinates: { lat: 34.26, lng: 108.94 },
              fetchedAt: "2026-08-03T00:00:00.000Z",
            },
            {
              candidateId: "rollinggo-second",
              provider: "rollinggo",
              providerHotelId: "second",
              name: "第二酒店",
              coordinates: { lat: 34.27, lng: 108.95 },
              fetchedAt: "2026-08-03T00:00:00.000Z",
            },
          ],
          warnings: [],
        })
        .mockResolvedValueOnce({ candidates: [], warnings: [] }),
    }
    const gateway = new AgentGateway(commands, runtime, {
      backendUrl: "http://127.0.0.1:3002",
      projectRoot: "/workspace/periplus",
      heartbeatIntervalMs: null,
      hotelService,
    })
    await gateway.start(context, workspace.id, "推荐西安酒店", "auto", vi.fn())
    const token = capabilityToken(runtime)

    const search = await gateway.executeTool(token, {
      type: "hotel.search",
      requestId: "hotel-search-first-only",
      input: {
        originQuery: "西安酒店",
        place: "西安",
        placeType: "城市",
      },
    })

    expect(search).toMatchObject({
      count: 2,
      firstCandidate: { providerHotelId: "first" },
    })
    expect(search).not.toHaveProperty("candidates")

    const draft = await gateway.executeTool(token, {
      type: "workspace.validate_draft",
      expectedRevision: 0,
      idempotencyKey: "hotel-first-only-stay",
      commands: [
        {
          name: "journey.add_event",
          payload: {
            event: {
              type: "STAY",
              title: "第二酒店",
              plannedStartAt: "2026-08-02T00:00:00.000Z",
              detail: {
                plannedLat: 34.27,
                plannedLng: 108.95,
                coordinateSystem: "WGS84",
              },
            },
            position: {
              placement: "END",
              parentSectionEventId: `${workspace.headGraph.id}-city`,
            },
          },
        },
      ],
    })
    expect(draft.validation.valid).toBe(true)
    await gateway.executeTool(token, {
      type: "workspace.commit_draft",
      draftId: draft.draftId,
    })

    const document = await commands.getDocument(context, workspace.id)
    const stay = document?.session.headGraph.events.find(
      (event) => event.type === "STAY"
    )
    expect(stay).toMatchObject({
      title: "首位酒店",
      detail: {
        plannedLat: 34.26,
        plannedLng: 108.94,
        hotelOffer: { providerHotelId: "first" },
      },
    })
    const replay = await gateway.executeTool(token, {
      type: "workspace.commit_draft",
      draftId: draft.draftId,
    })
    expect(replay.result.replayedFromIdempotencyKey).toBe(true)
    expect(
      (await commands.getDocument(context, workspace.id))?.session
        .headWorkspaceRevision
    ).toBe(1)
    runtime.exit(0)
    await vi.waitFor(async () => {
      expect(
        (await commands.getDocument(context, workspace.id))?.agentRuns.at(-1)
          ?.status
      ).toBe("SUCCEEDED")
    })

    const noSearchWorkspace = await createWorkspace(context, {
      graph: graph(`hotel-no-search-${randomUUID()}`),
      now: new Date(now),
    })
    const noSearchRuntime = new FakeRuntime()
    const noSearchGateway = new AgentGateway(commands, noSearchRuntime, {
      backendUrl: "http://127.0.0.1:3002",
      projectRoot: "/workspace/periplus",
      heartbeatIntervalMs: null,
      hotelService,
    })
    await noSearchGateway.start(
      context,
      noSearchWorkspace.id,
      "不检索就写酒店",
      "auto",
      vi.fn()
    )
    await expect(
      noSearchGateway.executeTool(capabilityToken(noSearchRuntime), {
        type: "workspace.validate_draft",
        expectedRevision: 0,
        idempotencyKey: "hotel-no-search-stay",
        commands: [
          {
            name: "journey.add_event",
            payload: {
              event: {
                type: "STAY",
                title: "伪造酒店",
                detail: {
                  plannedLat: 34.27,
                  plannedLng: 108.95,
                  coordinateSystem: "WGS84",
                },
              },
              position: {
                placement: "END",
                parentSectionEventId: `${noSearchWorkspace.headGraph.id}-city`,
              },
            },
          },
        ],
      })
    ).rejects.toThrow("酒店检索每次只能写入首位候选一次")
    noSearchRuntime.exit(1)
  })

  it("does not treat a rejected direct write as a graph mutation", async () => {
    const { workspace, commands, runtime, gateway, emit } = await setup()
    await gateway.start(context, workspace.id, "更新路线", "auto", emit)
    await expect(
      gateway.executeTool(capabilityToken(runtime), {
        type: "workspace.command",
        expectedRevision: 0,
        idempotencyKey: "unvalidated-update",
        command: visitDescriptionCommand(workspace.headGraph.id, "未校验更新"),
      })
    ).rejects.toThrow("direct Workspace commands are disabled")

    runtime.exit(0)
    await vi.waitFor(async () => {
      expect(
        (await commands.getDocument(context, workspace.id))?.agentRuns.at(-1)
      ).toMatchObject({
        status: "SUCCEEDED",
      })
    })
  })

  it("validates a draft before atomically committing one Workspace revision", async () => {
    const { workspace, commands, runtime, gateway, emit } = await setup()
    await gateway.start(context, workspace.id, "更新西湖标题", "auto", emit)
    const token = capabilityToken(runtime)
    const validation = await gateway.executeTool(token, {
      type: "workspace.validate_draft",
      expectedRevision: 0,
      idempotencyKey: "draft-title-update",
      commands: [visitDescriptionCommand(workspace.headGraph.id, "草稿更新")],
    })

    expect(validation).toMatchObject({
      draftId: "draft-title-update",
      validation: { valid: true, workspaceRevision: 1 },
      repairsRemaining: 2,
    })
    expect(validation.validation.issues).toContainEqual(
      expect.objectContaining({
        code: "IMAGE_UNAVAILABLE",
        severity: "WARNING",
      })
    )
    const replay = await gateway.executeTool(token, {
      type: "workspace.validate_draft",
      expectedRevision: 0,
      idempotencyKey: "draft-title-update",
      commands: [visitDescriptionCommand(workspace.headGraph.id, "草稿更新")],
    })
    expect(replay).toEqual(validation)
    expect(
      (await commands.getDocument(context, workspace.id))?.session
        .headWorkspaceRevision
    ).toBe(0)

    const committed = await gateway.executeTool(token, {
      type: "workspace.commit_draft",
      draftId: validation.draftId,
    })
    expect(committed.result).toMatchObject({
      commandName: "journey.apply_draft",
      newRevision: 1,
    })
    const document = await commands.getDocument(context, workspace.id)
    expect(document?.session).toMatchObject({ headWorkspaceRevision: 1 })
    expect(document?.session.headGraph.events).toContainEqual(
      expect.objectContaining({
        id: `${workspace.headGraph.id}-visit`,
        description: "草稿更新",
      })
    )
    const revisions = await prisma.workspaceRevision.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { revision: "asc" },
    })
    expect(revisions).toHaveLength(1)
    expect(revisions[0]?.commandName).toBe("JOURNEY_APPLY_DRAFT")

    runtime.exit(0)
    await vi.waitFor(async () => {
      expect(
        (await commands.getDocument(context, workspace.id))?.agentRuns.at(-1)
          ?.status
      ).toBe("SUCCEEDED")
    })
  })

  it("binds a changed place event to a resolve result from the same Agent run", async () => {
    const workspace = await createWorkspace(context, {
      graph: graph(`verified-place-${randomUUID()}`),
      now: new Date(now),
    })
    const runtime = new FakeRuntime()
    const commands = new WorkspaceCommandService()
    const placeRef = {
      provider: "amap" as const,
      providerId: "B-west-lake",
      canonicalName: "西湖",
      city: "杭州",
      lat: 30.25,
      lng: 120.15,
      coordinateSystem: "GCJ02" as const,
      confidence: 0.99,
      candidates: [],
    }
    const coverImage = {
      provider: "amap" as const,
      url: "https://images.example/west-lake.jpg",
      fetchedAt: "2026-08-09T00:00:00.000Z",
      width: 1200,
      height: 800,
    }
    const command = (coverWidth?: number) => ({
      name: "journey.update_event",
      payload: {
        eventId: `${workspace.headGraph.id}-visit`,
        patch: {
          type: "VISIT",
          title: "西湖",
          detail: {
            plannedLat: 30.25,
            plannedLng: 120.15,
            coordinateSystem: "GCJ02",
            coordinateProvider: "amap",
            providerPlaceId: "B-west-lake",
            ...(coverWidth
              ? { providerCoverImage: { ...coverImage, width: coverWidth } }
              : {}),
          },
        },
      },
    })
    const gateway = new AgentGateway(commands, runtime, {
      backendUrl: "http://127.0.0.1:3002",
      projectRoot: "/workspace/periplus",
      heartbeatIntervalMs: null,
      placeService: {
        resolvePlaceForJourneyEvent: vi.fn().mockResolvedValue({
          status: "ready",
          place: {},
          placeRef,
          command: command(coverImage.width),
          warnings: [],
        }),
      } as never,
    })
    await gateway.start(context, workspace.id, "校对西湖", "auto", vi.fn())
    const token = capabilityToken(runtime)
    const unverified = await gateway.executeTool(token, {
      type: "workspace.validate_draft",
      expectedRevision: 0,
      idempotencyKey: "place-unverified",
      commands: [command()],
    })
    expect(unverified.validation).toMatchObject({ valid: false })
    expect(unverified.validation.issues).toContainEqual(
      expect.objectContaining({ code: "PLACE_UNVERIFIED", severity: "ERROR" })
    )

    await gateway.executeTool(token, {
      type: "place.resolve_for_journey_event",
      requestId: "resolve-west-lake",
      input: {
        text: "西湖",
        city: "杭州",
        eventId: `${workspace.headGraph.id}-visit`,
      },
    })
    const forgedDimensions = await gateway.executeTool(token, {
      type: "workspace.validate_draft",
      expectedRevision: 0,
      idempotencyKey: "place-forged-dimensions",
      previousDraftId: unverified.draftId,
      commands: [command(coverImage.width + 1)],
    })
    expect(forgedDimensions.validation).toMatchObject({ valid: false })
    expect(forgedDimensions.validation.issues).toContainEqual(
      expect.objectContaining({ code: "PLACE_UNVERIFIED", severity: "ERROR" })
    )
    const verified = await gateway.executeTool(token, {
      type: "workspace.validate_draft",
      expectedRevision: 0,
      idempotencyKey: "place-verified",
      previousDraftId: forgedDimensions.draftId,
      commands: [command(coverImage.width)],
    })
    expect(verified.validation.valid).toBe(true)
    await gateway.executeTool(token, {
      type: "workspace.commit_draft",
      draftId: verified.draftId,
    })
    runtime.exit(0)
  })

  it("limits an Agent run to an initial validation and two draft repairs", async () => {
    const {
      workspace,
      commands: workspaceCommands,
      runtime,
      gateway,
      emit,
    } = await setup()
    await gateway.start(context, workspace.id, "修复城市时区", "auto", emit)
    const token = capabilityToken(runtime)
    const commands = [
      {
        name: "journey.update_event",
        payload: {
          eventId: `${workspace.headGraph.id}-city`,
          patch: {
            type: "SECTION",
            detail: {
              kind: "CITY",
              timeZone: "not-a-timezone",
              lat: 30.2741,
              lng: 120.1551,
              coordinateSystem: "GCJ02",
            },
          },
        },
      },
    ]

    const initial = await gateway.executeTool(token, {
      type: "workspace.validate_draft",
      expectedRevision: 0,
      idempotencyKey: "draft-initial",
      commands,
    })
    expect(initial.validation).toMatchObject({ valid: false })
    expect(initial.validation.issues).toContainEqual(
      expect.objectContaining({ code: "CITY_TIMEZONE_INVALID" })
    )
    await expect(
      gateway.executeTool(token, {
        type: "workspace.commit_draft",
        draftId: initial.draftId,
      })
    ).rejects.toThrow("Journey draft validation failed")
    expect(
      (await workspaceCommands.getDocument(context, workspace.id))?.session
        .headWorkspaceRevision
    ).toBe(0)

    const firstRepair = await gateway.executeTool(token, {
      type: "workspace.validate_draft",
      expectedRevision: 0,
      idempotencyKey: "draft-repair-1",
      previousDraftId: initial.draftId,
      commands,
    })
    expect(firstRepair.validation).toMatchObject({ valid: false })
    await expect(
      gateway.executeTool(token, {
        type: "workspace.validate_draft",
        expectedRevision: 0,
        idempotencyKey: "draft-stale-ancestor",
        previousDraftId: initial.draftId,
        commands,
      })
    ).rejects.toThrow("latest invalid draft")
    const secondRepair = await gateway.executeTool(token, {
      type: "workspace.validate_draft",
      expectedRevision: 0,
      idempotencyKey: "draft-repair-2",
      previousDraftId: firstRepair.draftId,
      commands,
    })
    expect(secondRepair.validation).toMatchObject({ valid: false })

    await expect(
      gateway.executeTool(token, {
        type: "workspace.validate_draft",
        expectedRevision: 0,
        idempotencyKey: "draft-over-limit",
        previousDraftId: secondRepair.draftId,
        commands,
      })
    ).rejects.toThrow("exhausted its two repair attempts")
    runtime.exit(0)
    await vi.waitFor(async () => {
      expect(
        (
          await workspaceCommands.getDocument(context, workspace.id)
        )?.agentRuns.at(-1)?.status
      ).toBe("SUCCEEDED")
    })
  })

  it("accepts only repair operations allowed by the previous invalid draft", async () => {
    const { workspace, runtime, gateway, emit } = await setup()
    await gateway.start(context, workspace.id, "修复城市时区", "auto", emit)
    const token = capabilityToken(runtime)
    const initial = await gateway.executeTool(token, {
      type: "workspace.validate_draft",
      expectedRevision: 0,
      idempotencyKey: "repair-scope-initial",
      commands: [
        {
          name: "journey.update_event",
          payload: {
            eventId: `${workspace.headGraph.id}-city`,
            patch: {
              type: "SECTION",
              detail: {
                kind: "CITY",
                timeZone: "not-a-timezone",
                lat: 30.2741,
                lng: 120.1551,
                coordinateSystem: "GCJ02",
              },
            },
          },
        },
      ],
    })
    await expect(
      gateway.executeTool(token, {
        type: "workspace.validate_draft",
        expectedRevision: 0,
        idempotencyKey: "repair-scope-illegal",
        previousDraftId: initial.draftId,
        commands: [
          {
            name: "journey.update_event",
            payload: {
              eventId: `${workspace.headGraph.id}-visit`,
              patch: {
                type: "VISIT",
                description: "无关修复",
              },
            },
          },
        ],
      })
    ).rejects.toThrow("does not target a previous draft issue")
    runtime.exit(0)
  })

  it("allows the first CITY to repair an empty root route", async () => {
    const workspace = await createWorkspace(context, {
      graph: emptyRootGraph(`empty-root-${randomUUID()}`),
      now: new Date(now),
    })
    const commands = new WorkspaceCommandService()
    const runtime = new FakeRuntime()
    const gateway = new AgentGateway(commands, runtime, {
      backendUrl: "http://127.0.0.1:3002",
      projectRoot: "/workspace/periplus",
      heartbeatIntervalMs: null,
    })
    await gateway.start(context, workspace.id, "补齐首个城市", "auto", vi.fn())
    const token = capabilityToken(runtime)
    const initial = await gateway.executeTool(token, {
      type: "workspace.validate_draft",
      expectedRevision: 0,
      idempotencyKey: "empty-root-initial",
      commands: [
        {
          name: "journey.add_event",
          payload: {
            event: { type: "NOTE", title: "暂存", detail: { body: "暂存" } },
            position: { placement: "UNSCHEDULED" },
          },
        },
      ],
    })
    expect(initial.validation.issues).toContainEqual(
      expect.objectContaining({ code: "ROOT_ROUTE_DISCONNECTED" })
    )

    const repaired = await gateway.executeTool(token, {
      type: "workspace.validate_draft",
      expectedRevision: 0,
      idempotencyKey: "empty-root-first-city",
      previousDraftId: initial.draftId,
      commands: [
        {
          name: "journey.add_event",
          payload: {
            event: {
              type: "SECTION",
              title: "杭州",
              detail: {
                kind: "CITY",
                timeZone: "Asia/Shanghai",
                lat: 30.2741,
                lng: 120.1551,
                coordinateSystem: "GCJ02",
              },
            },
            position: { placement: "START", parentSectionEventId: null },
          },
        },
      ],
    })
    expect(repaired.validation.issues).not.toContainEqual(
      expect.objectContaining({ code: "ROOT_ROUTE_DISCONNECTED" })
    )
    runtime.exit(0)
  })

  it("allows a projection repair to add a link within its CITY scope", async () => {
    const journeyId = `city-projection-${randomUUID()}`
    const workspace = await createWorkspace(context, {
      graph: cityRouteGraph(journeyId),
      now: new Date(now),
    })
    const commands = new WorkspaceCommandService()
    const runtime = new FakeRuntime()
    const gateway = new AgentGateway(commands, runtime, {
      backendUrl: "http://127.0.0.1:3002",
      projectRoot: "/workspace/periplus",
      heartbeatIntervalMs: null,
    })
    await gateway.start(context, workspace.id, "修复城市拓扑", "auto", vi.fn())
    const token = capabilityToken(runtime)
    const initial = await gateway.executeTool(token, {
      type: "workspace.validate_draft",
      expectedRevision: 0,
      idempotencyKey: "city-projection-initial",
      commands: [
        visitDescriptionCommand(journeyId, "保留可修复的城市拓扑草稿"),
      ],
    })
    expect(initial.validation.valid).toBe(true)

    const running = (
      gateway as unknown as {
        runs: Map<
          string,
          { drafts: Map<string, { validation: PlanValidationReport }> }
        >
      }
    ).runs.get(workspace.id)
    const previous = running?.drafts.get(initial.draftId)
    if (!previous) throw new Error("expected stored draft")
    const cityEventId = `${journeyId}-city`
    previous.validation = {
      ...previous.validation,
      valid: false,
      issues: [
        {
          code: "PROJECTION_INVALID",
          cityEventId,
          eventIds: [cityEventId],
          severity: "ERROR",
          path: cityEventId,
          message: "City route needs a scoped link repair",
          repairability: "AGENT",
          allowedOperations: [
            "journey.add_link",
            "journey.retire_link",
            "journey.select_branch",
          ],
          suggestion: "Repair only topology inside the CITY scope.",
        },
      ],
    }

    const repaired = await gateway.executeTool(token, {
      type: "workspace.validate_draft",
      expectedRevision: 0,
      idempotencyKey: "city-projection-link-repair",
      previousDraftId: initial.draftId,
      commands: [
        {
          name: "journey.add_link",
          payload: {
            link: {
              id: "city-scope-alternative",
              fromEventId: `${journeyId}-visit`,
              toEventId: `${journeyId}-visit-2`,
              kind: "ALTERNATIVE",
              branchKey: "city-scope-repair",
              rank: 2048,
            },
          },
        },
      ],
    })
    expect(repaired.validation.valid).toBe(true)
    runtime.exit(0)
  })

  it("keeps a user-cancelled run cancelled when the runtime exits without a code", async () => {
    const { workspace, commands, runtime, gateway, events, emit } =
      await setup()
    await gateway.start(context, workspace.id, "取消本次运行", "auto", emit)

    gateway.cancel(workspace.id)
    expect(runtime.cancel).toHaveBeenCalledOnce()
    runtime.exit(null)

    await vi.waitFor(async () => {
      expect(
        (await commands.getDocument(context, workspace.id))?.agentRuns.at(-1)
      ).toMatchObject({ status: "CANCELLED" })
      expect(events.at(-1)).toMatchObject({ type: "agent.run.cancelled" })
    })
  })

  it("rejects a draft after a concurrent user revision", async () => {
    const { workspace, commands, runtime, gateway, emit } = await setup()
    await gateway.start(context, workspace.id, "连续更新路线", "auto", emit)
    const token = capabilityToken(runtime)
    const draft = await gateway.executeTool(token, {
      type: "workspace.validate_draft",
      expectedRevision: 0,
      idempotencyKey: "concurrent-draft",
      commands: [
        visitDescriptionCommand(workspace.headGraph.id, "Agent 草稿更新"),
      ],
    })
    expect(draft.validation.valid).toBe(true)
    await commands.execute(context, {
      aggregateId: workspace.id,
      expectedRevision: 0,
      idempotencyKey: "concurrent-user-update",
      actor: { kind: "USER", userId: context.userId },
      command: visitDescriptionCommand(workspace.headGraph.id, "用户并发更新"),
    })
    await expect(
      gateway.executeTool(token, {
        type: "workspace.commit_draft",
        draftId: draft.draftId,
      })
    ).rejects.toThrow("updated by another request")

    runtime.exit(0)
    await vi.waitFor(async () => {
      expect(
        (await commands.getDocument(context, workspace.id))?.agentRuns.at(-1)
      ).toMatchObject({
        status: "SUCCEEDED",
      })
    })
  })

  it("uses no mutation tools in suggest mode and persists the suggestion", async () => {
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
    await vi.waitFor(
      async () => {
        const document = await commands.getDocument(context, workspace.id)
        expect(document?.suggestions).toHaveLength(1)
        expect(document?.agentRuns.at(-1)?.status).toBe("SUCCEEDED")
      },
      { timeout: 5_000 }
    )
    const document = await commands.getDocument(context, workspace.id)
    expect(document?.session.headWorkspaceRevision).toBe(0)
    expect(document?.suggestions[0]).toMatchObject({
      title: "调整西湖标题",
      basedOnWorkspaceRevision: 0,
    })
  })

  it("blocks non-draft lifecycle commands from the Agent capability", async () => {
    const { workspace, commands, runtime, gateway, emit } = await setup()
    await gateway.start(context, workspace.id, "fork workspace", "auto", emit)
    await expect(
      gateway.executeTool(capabilityToken(runtime), {
        type: "workspace.command",
        expectedRevision: 0,
        idempotencyKey: "agent-fork-workspace",
        command: {
          name: "workspace.fork",
          payload: { fromWorkspaceRevision: 0 },
        },
      })
    ).rejects.toThrow("direct Workspace commands are disabled")
    expect(
      (await commands.getDocument(context, workspace.id))?.session
        .headWorkspaceRevision
    ).toBe(0)
    runtime.exit(0)
  })

  it("exposes only server-resolved scoped projections through the run capability", async () => {
    const branchFixture = TARGET_CONTRACT_FIXTURES.find(
      (candidate) => candidate.id === "06-strict-nested-branch"
    )!.cases.find((candidate) => candidate.id === "two-level-nested-forks")!
    const branchGraph = structuredClone(branchFixture.input.graph!)
    branchGraph.ownerId = ownerId
    const branchWorkspace = await createWorkspace(context, {
      graph: branchGraph,
      now: new Date(now),
    })
    const commands = new WorkspaceCommandService()
    const runtime = new FakeRuntime()
    const gateway = new AgentGateway(commands, runtime, {
      backendUrl: "http://127.0.0.1:3002",
      projectRoot: "/workspace/periplus",
      heartbeatIntervalMs: null,
    })
    await gateway.start(
      context,
      branchWorkspace.id,
      "read projection",
      "auto",
      vi.fn()
    )
    const token = capabilityToken(runtime)
    for (const mode of ["PLANNER", "EXECUTION", "TRAVELOGUE"] as const) {
      const result = await gateway.executeTool(token, {
        type: "workspace.project",
        scopeSectionEventId: null,
        mode,
        asOfRevision: branchGraph.revision,
      })
      expect(result).toMatchObject({
        projection: {
          journeyId: branchGraph.id,
          mode,
          scopeSectionEventId: null,
        },
        headWorkspaceRevision: 0,
      })
      const projection = result.projection!
      if (mode !== "TRAVELOGUE") {
        expect(projection.events.map((event) => event.eventId)).toEqual([
          "outer-fork",
          "inner-fork",
          "inner-a",
          "inner-join",
          "outer-join",
          "end",
        ])
      } else {
        expect(projection.events).toEqual([])
      }
    }
    await expect(
      gateway.executeTool(token, {
        type: "workspace.project",
        scopeSectionEventId: "missing-section",
        mode: "PLANNER",
      })
    ).rejects.toThrow("not a CITY event")
    await expect(
      gateway.executeTool(token, {
        type: "workspace.project",
        scopeSectionEventId: null,
        mode: "PLANNER",
        asOfRevision: branchGraph.revision + 1,
      })
    ).rejects.toThrow("exact revision snapshot")
    await expect(
      gateway.executeTool("wrong-capability", {
        type: "workspace.project",
        scopeSectionEventId: null,
        mode: "PLANNER",
      })
    ).rejects.toThrow("invalid or expired")

    runtime.exit(0)
    await vi.waitFor(async () => {
      expect(
        (await commands.getDocument(context, branchWorkspace.id))?.agentRuns[0]
          ?.status
      ).toBe("SUCCEEDED")
    })

    const sectionFixture = TARGET_CONTRACT_FIXTURES.find(
      (candidate) => candidate.id === "01-root-city-and-local-scope"
    )!.cases.find((candidate) => candidate.id === "root-city-chain")!
    const sectionGraph = structuredClone(sectionFixture.input.graph!)
    sectionGraph.ownerId = ownerId
    const sectionWorkspace = await createWorkspace(context, {
      graph: sectionGraph,
      now: new Date(now),
    })
    const sectionRuntime = new FakeRuntime()
    const sectionGateway = new AgentGateway(commands, sectionRuntime, {
      backendUrl: "http://127.0.0.1:3002",
      projectRoot: "/workspace/periplus",
      heartbeatIntervalMs: null,
    })
    await sectionGateway.start(
      context,
      sectionWorkspace.id,
      "read section",
      "auto",
      vi.fn()
    )
    const section = await sectionGateway.executeTool(
      capabilityToken(sectionRuntime),
      {
        type: "workspace.project",
        scopeSectionEventId: "city-a",
        mode: "PLANNER",
      }
    )
    expect(section.projection!.events.map((event) => event.eventId)).toEqual([
      "visit-a",
      "local-transit",
      "visit-b",
      "meal-a",
    ])
    sectionRuntime.exit(0)
  })

  it("attributes live place calls to the scoped run and rejects cross-Workspace event targets", async () => {
    const workspace = await createWorkspace(context, {
      graph: graph(`agent-place-${randomUUID()}`),
      now: new Date(now),
    })
    const foreignWorkspace = await createWorkspace(context, {
      graph: graph(`agent-place-foreign-${randomUUID()}`),
      now: new Date(now),
    })
    const repository = {
      search: vi.fn().mockResolvedValue({ candidates: [], topConfidence: 0 }),
      findById: vi.fn().mockResolvedValue(null),
      persistLiveCandidates: vi.fn().mockResolvedValue(undefined),
      linkProviderMatch: vi.fn().mockResolvedValue(undefined),
      persistMatchReview: vi.fn().mockResolvedValue("review-1"),
    }
    const provider = {
      search: vi.fn().mockResolvedValue({
        candidates: [
          {
            candidateId: "amap-west-lake",
            provider: "amap" as const,
            providerId: "B-west-lake",
            name: "西湖",
            normalizedName: "西湖",
            aliases: [],
            category: "SIGHT" as const,
            city: "杭州市",
            coordinates: [
              {
                provider: "amap" as const,
                coordinateSystem: "GCJ02" as const,
                lat: 30.25,
                lng: 120.15,
                accuracy: "provider_poi" as const,
                source: "provider_search" as const,
              },
            ],
            sources: [{ provider: "amap" as const, providerId: "B-west-lake" }],
            sourceConfidence: 0.8,
            fromLiveProvider: true,
          },
        ],
        warnings: [],
      }),
    }
    const commands = new WorkspaceCommandService()
    const runtime = new FakeRuntime()
    const gateway = new AgentGateway(commands, runtime, {
      backendUrl: "http://127.0.0.1:3002",
      projectRoot: "/workspace/periplus",
      heartbeatIntervalMs: null,
      placeService: new PlaceIntelligenceService(repository, provider),
    })
    await gateway.start(context, workspace.id, "find place", "auto", vi.fn())
    const token = capabilityToken(runtime)
    await gateway.executeTool(token, {
      type: "place.search",
      requestId: `place-search-${workspace.id}`,
      input: {
        query: "西湖",
        city: "杭州",
        includeLiveProvider: true,
        workspaceId: foreignWorkspace.id,
      },
    })

    await expect(
      prisma.providerUsageLog.findFirstOrThrow({
        where: { requestId: `place-search-${workspace.id}` },
      })
    ).resolves.toMatchObject({
      provider: "amap",
      purpose: "place_search",
      status: "success",
      userId: ownerId,
      workspaceId: workspace.id,
      agentRunId: expect.any(String),
    })
    await expect(
      gateway.executeTool(token, {
        type: "place.resolve_for_journey_event",
        requestId: `place-foreign-${workspace.id}`,
        input: {
          text: "西湖",
          eventId: `${foreignWorkspace.headGraph.id}-visit`,
        },
      })
    ).rejects.toThrow("active event in the current Workspace")
    expect(provider.search).toHaveBeenCalledOnce()
    expect(
      await prisma.providerUsageLog.count({
        where: { requestId: `place-foreign-${workspace.id}` },
      })
    ).toBe(0)

    runtime.exit(0)
  })

  it("reclaims an expired crash-orphan without persisting an uncommitted draft", async () => {
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
    const draft = await gateway1.executeTool(capabilityToken(runtime1), {
      type: "workspace.validate_draft",
      expectedRevision: 0,
      idempotencyKey: "draft-before-crash",
      commands: [visitDescriptionCommand(workspace.headGraph.id, "不应持久化")],
    })
    expect(draft.validation.valid).toBe(true)
    runtime1.observer?.onStdout("partial stdout is durable")
    await vi.waitFor(async () => {
      const document = await commands.getDocument(context, workspace.id, clock)
      expect(document?.messages.at(-1)?.content).toBe(
        "partial stdout is durable"
      )
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
    expect(runtime2.request).not.toBeNull()

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
    expect(recovered?.session.headGraph.events[0]?.description).toBeUndefined()

    runtime2.exit(0)
    await vi.waitFor(async () => {
      const document = await commands.getDocument(context, workspace.id, clock)
      expect(document?.agentRuns.at(-1)?.status).toBe("SUCCEEDED")
    })
  })
})
