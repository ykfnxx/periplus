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
})
