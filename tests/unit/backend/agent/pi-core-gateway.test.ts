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
      "auto",
      (id, event) => {
        expect(id).toBe(workspace.id)
        events.push(event)
      }
    )

    expect(harness.request?.messages.at(-1)).toMatchObject({
      role: "user",
      content: "安排西湖上午游览",
    })
    harness.emit({
      type: "context_prepared",
      input: "effective Pi context",
      messageCount: harness.request?.messages.length ?? 0,
      estimatedTokens: 42,
      compacted: false,
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
    })
    expect(
      events.find((event) => event.type === "agent.message.delta")
    ).toBeTruthy()
    expect(events.at(-1)?.type).toBe("agent.run.completed")
  })
})
