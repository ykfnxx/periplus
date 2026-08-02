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

class StateDiffFailingTraceSink implements EvalTraceSink {
  readonly delegate = new MemoryEvalTraceSink()
  private failure: Error | null = null

  get events(): readonly EvalTraceEvent[] {
    return this.delegate.events
  }

  async emit(input: EvalTraceInput) {
    if (input.type === "state.diff.recorded") {
      this.failure = new Error("injected state diff trace failure")
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
        parentSectionEventId: null,
        placementStatus: "SCHEDULED",
        origin: "ORIGINAL",
        title: "西湖",
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

describe.sequential("P3 persistent AgentGateway", () => {
  it("emits a complete headless Eval Trace around Agent commands", async () => {
    const sink = new MemoryEvalTraceSink()
    const { workspace, commands, runtime, gateway, emit } = await setup({
      scenarioId: "gateway-command-observability",
      sink,
    })
    await gateway.start(context, workspace.id, "更新西湖标题", "auto", emit)
    await gateway.executeTool(capabilityToken(runtime), {
      type: "workspace.command",
      expectedRevision: 0,
      idempotencyKey: "eval-update-visit",
      command: {
        name: "journey.update_event",
        payload: {
          eventId: `${workspace.headGraph.id}-visit`,
          patch: { type: "VISIT", title: "西湖（可观测）" },
        },
      },
    })
    const replay = await gateway.executeTool(capabilityToken(runtime), {
      type: "workspace.command",
      expectedRevision: 0,
      idempotencyKey: "eval-update-visit",
      command: {
        name: "journey.update_event",
        payload: {
          eventId: `${workspace.headGraph.id}-visit`,
          patch: { type: "VISIT", title: "西湖（可观测）" },
        },
      },
    })
    expect(replay.result.replayedFromIdempotencyKey).toBe(true)
    await expect(
      gateway.executeTool(capabilityToken(runtime), {
        type: "workspace.command",
        expectedRevision: 0,
        idempotencyKey: "eval-stale-update",
        command: {
          name: "journey.update_event",
          payload: {
            eventId: `${workspace.headGraph.id}-visit`,
            patch: { type: "VISIT", title: "不应写入" },
          },
        },
      })
    ).rejects.toThrow("updated by another request")
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
        "command.applied",
        "state.diff.recorded",
        "command.rejected",
        "tool.failed",
        "tool.completed",
        "run.completed",
      ])
    )
    expect(
      validateWriteProtocolCapability("gateway-command", sink.events).hardPass
    ).toBe(true)
    expect(
      sink.events.filter((event) => event.type === "state.diff.recorded")
    ).toHaveLength(1)
    expect(sink.events).toContainEqual(
      expect.objectContaining({
        type: "command.applied",
        payload: expect.objectContaining({
          replayedFromIdempotencyKey: true,
        }),
      })
    )
  })

  it("does not change a committed command result when Eval Trace persistence fails", async () => {
    const sink = new StateDiffFailingTraceSink()
    const { workspace, commands, runtime, gateway, emit } = await setup({
      scenarioId: "gateway-trace-failure-isolation",
      sink,
    })
    await gateway.start(context, workspace.id, "更新西湖标题", "auto", emit)

    const mutation = await gateway.executeTool(capabilityToken(runtime), {
      type: "workspace.command",
      expectedRevision: 0,
      idempotencyKey: "eval-trace-failure-update",
      command: {
        name: "journey.update_event",
        payload: {
          eventId: `${workspace.headGraph.id}-visit`,
          patch: { type: "VISIT", title: "西湖（Trace 失败后仍提交）" },
        },
      },
    })

    expect(mutation.result).toMatchObject({ newRevision: 1 })
    expect(
      (await commands.getDocument(context, workspace.id))?.session.headGraph
        .events[0]?.title
    ).toBe("西湖（Trace 失败后仍提交）")
    expect(sink.events.map((event) => event.type)).toEqual([
      "run.started",
      "tool.started",
      "command.dispatched",
    ])
    expect(sink.events.some((event) => event.type === "command.rejected")).toBe(
      false
    )
    expect(verifyEvalTrace(sink.events).valid).toBe(false)
    await expect(sink.close()).rejects.toThrow(
      "injected state diff trace failure"
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

    const token = capabilityToken(runtime)
    const mutation = await gateway.executeTool(token, {
      type: "workspace.command",
      expectedRevision: 0,
      idempotencyKey: "agent-update-visit",
      command: {
        name: "journey.update_event",
        payload: {
          eventId: `${workspace.headGraph.id}-visit`,
          patch: { type: "VISIT", title: "西湖（Agent）" },
        },
      },
    })
    expect(mutation.result).toMatchObject({ newRevision: 1 })

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
    expect(restarted?.session.headGraph.events[0]?.title).toBe("西湖（Agent）")
    await expect(
      gateway.executeTool(token, { type: "workspace.get" })
    ).rejects.toThrow("invalid or expired")
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

  it("returns lifecycle identities through the Agent tool round-trip", async () => {
    const { workspace, commands, runtime, gateway, emit } = await setup()
    await gateway.start(context, workspace.id, "fork workspace", "auto", emit)
    const result = await gateway.executeTool(capabilityToken(runtime), {
      type: "workspace.command",
      expectedRevision: 0,
      idempotencyKey: "agent-fork-workspace",
      command: {
        name: "workspace.fork",
        payload: { fromWorkspaceRevision: 0 },
      },
    })
    expect(result.result.outcome).toMatchObject({
      type: "workspace.forked",
      sourceWorkspaceId: workspace.id,
      sourceWorkspaceRevision: 0,
      headWorkspaceRevision: 0,
      workspaceId: expect.any(String),
    })
    const forkWorkspaceId = (result.result.outcome as { workspaceId: string })
      .workspaceId
    expect(
      (await commands.getDocument(context, forkWorkspaceId))?.session
    ).toMatchObject({
      id: forkWorkspaceId,
      headWorkspaceRevision: 0,
      headGraph: workspace.headGraph,
    })
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
    ).rejects.toThrow("not a SECTION")
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
      (candidate) => candidate.id === "02-city-day-event-drilldown"
    )!.cases.find((candidate) => candidate.id === "city-day-drilldown")!
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
        scopeSectionEventId: "day",
        mode: "PLANNER",
      }
    )
    expect(section.projection!.events.map((event) => event.eventId)).toEqual([
      "morning",
      "afternoon",
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

  it("reclaims an expired crash-orphan without losing persisted messages or commands", async () => {
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
    await gateway1.executeTool(capabilityToken(runtime1), {
      type: "workspace.command",
      expectedRevision: 0,
      idempotencyKey: "command-before-crash",
      command: {
        name: "journey.update_event",
        payload: {
          eventId: `${workspace.headGraph.id}-visit`,
          patch: { type: "VISIT", title: "persisted before crash" },
        },
      },
    })
    runtime1.observer?.onStdout("partial stdout is intentionally not durable")

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
      "resume prompt",
    ])
    expect(recovered?.session.headGraph.events[0]?.title).toBe(
      "persisted before crash"
    )

    runtime2.exit(0)
    await vi.waitFor(async () => {
      const document = await commands.getDocument(context, workspace.id, clock)
      expect(document?.agentRuns.at(-1)?.status).toBe("SUCCEEDED")
    })
  })
})
