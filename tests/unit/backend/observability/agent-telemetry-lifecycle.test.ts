import { randomUUID } from "node:crypto"
import {
  trace,
  type Span,
  type SpanOptions,
  type Tracer,
} from "@opentelemetry/api"
import { beforeAll, describe, expect, it, vi } from "vitest"
import type {
  AgentRuntime,
  AgentRuntimeExit,
  AgentRuntimeObserver,
  AgentRuntimeRequest,
} from "@/backend/agent/runtime"
import type { AgentEvent } from "@/backend/types"
import type { TargetJourneyGraphSnapshot } from "@/modules/data-model/contracts"
import { prisma } from "@/modules/data/db/prisma"
import { createWorkspace } from "@/modules/data/workspaces/workspace-repository"
import { WorkspaceCommandService } from "@/modules/workspace/server/workspace-command-service"

const ownerId = `agent-telemetry-owner-${randomUUID()}`
const context = { userId: ownerId, role: "user" as const }
const now = "2026-08-01T00:00:00.000Z"

type RecordedEvent = {
  name: string
  attributes: Record<string, unknown>
}

type RecordedSpan = {
  name: string
  attributes: Record<string, unknown>
  events: RecordedEvent[]
  startOrder: number
  endOrder: number | null
}

function graph(id: string): TargetJourneyGraphSnapshot {
  return {
    id,
    ownerId,
    revision: 1,
    status: "DRAFT",
    visibility: "PRIVATE",
    title: "Agent observability workspace",
    events: [
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

class LifecycleRuntime implements AgentRuntime {
  readonly id = "fake-observability-runtime"
  request: AgentRuntimeRequest | null = null
  observer: AgentRuntimeObserver | null = null

  async start(request: AgentRuntimeRequest, observer: AgentRuntimeObserver) {
    this.request = request
    this.observer = observer
    return {
      metadata: { runtimeId: this.id, workDir: "/tmp/fake-observability" },
      cancel: vi.fn(),
    }
  }

  exit(code: number | null) {
    const result: AgentRuntimeExit = {
      code,
      metadata: { runtimeId: this.id, workDir: "/tmp/fake-observability" },
    }
    this.observer?.onExit(result)
  }
}

function createRecordingTracer(spans: RecordedSpan[]): Tracer {
  let order = 0
  let spanId = 0

  return {
    startSpan(name: string, options?: SpanOptions) {
      const record: RecordedSpan = {
        name,
        attributes: { ...(options?.attributes ?? {}) },
        events: [],
        startOrder: ++order,
        endOrder: null,
      }
      spans.push(record)

      const span = {
        spanContext: () => ({
          traceId: "1".repeat(32),
          spanId: (++spanId).toString(16).padStart(16, "0"),
          traceFlags: 1,
          isRemote: false,
        }),
        setAttribute(key: string, value: unknown) {
          record.attributes[key] = value
          return span
        },
        setAttributes(attributes: Record<string, unknown>) {
          Object.assign(record.attributes, attributes)
          return span
        },
        addEvent(eventName: string, attributes?: Record<string, unknown>) {
          record.events.push({
            name: eventName,
            attributes: { ...(attributes ?? {}) },
          })
          return span
        },
        recordException() {
          return span
        },
        setStatus() {
          return span
        },
        updateName(name: string) {
          record.name = name
          return span
        },
        end() {
          record.endOrder ??= ++order
        },
        isRecording() {
          return record.endOrder === null
        },
      } as unknown as Span
      return span
    },
  } as Tracer
}

beforeAll(async () => {
  await prisma.user.create({
    data: {
      id: ownerId,
      name: "Agent telemetry owner",
      email: `${ownerId}@periplus.local`,
      emailVerified: true,
    },
  })
})

describe.sequential("Agent telemetry execution contract", () => {
  it("records cumulative stream lifecycle data after persistence and before unlock", async () => {
    const spans: RecordedSpan[] = []
    const tracer = createRecordingTracer(spans)
    const getTracer = vi.spyOn(trace, "getTracer").mockReturnValue(tracer)
    const { AgentGateway } = await import("@/backend/agent/gateway")

    try {
      const journeyId = `agent-observability-${randomUUID()}`
      const workspace = await createWorkspace(context, {
        graph: graph(journeyId),
        now: new Date(now),
      })
      const commands = new WorkspaceCommandService()
      const runtime = new LifecycleRuntime()
      const events: AgentEvent[] = []
      const broadcastReads: Promise<void>[] = []
      const gateway = new AgentGateway(commands, runtime, {
        backendUrl: "http://127.0.0.1:3002",
        projectRoot: "/workspace/periplus",
        heartbeatIntervalMs: null,
      })
      const firstDelta = "第一段，含有不应进入 trace 的正文"
      const secondDelta = "second secret chunk"
      const emit = (_workspaceId: string, event: AgentEvent) => {
        events.push(event)
        if (
          event.type !== "agent.message.delta" ||
          typeof event.payload !== "object" ||
          event.payload === null ||
          !("stream" in event.payload) ||
          event.payload.stream !== "stdout" ||
          !("text" in event.payload) ||
          typeof event.payload.text !== "string"
        ) {
          return
        }
        const text = event.payload.text
        broadcastReads.push(
          commands.getDocument(context, workspace.id).then((document) => {
            const assistantMessage = document?.messages.find(
              (message) => message.role === "ASSISTANT"
            )
            expect(assistantMessage?.content).toContain(text)
          })
        )
      }

      await gateway.start(
        context,
        workspace.id,
        "记录 Agent 执行",
        "auto",
        emit
      )
      const toolConfig = runtime.request?.toolServers[0]?.configFile?.content
      if (!toolConfig) throw new Error("Workspace tool config was not created")
      const capabilityToken = JSON.parse(toolConfig).capabilityToken as string
      const draft = await gateway.executeTool(capabilityToken, {
        type: "workspace.validate_draft",
        expectedRevision: 0,
        idempotencyKey: "telemetry-draft",
        commands: [
          {
            name: "journey.update_event",
            payload: {
              eventId: `${journeyId}-visit`,
              patch: { type: "VISIT", description: "OTel 草稿" },
            },
          },
        ],
      })
      await gateway.executeTool(capabilityToken, {
        type: "workspace.commit_draft",
        draftId: draft.draftId,
      })
      runtime.observer?.onStdout(firstDelta)
      runtime.observer?.onStdout(secondDelta)
      runtime.exit(0)

      await vi.waitFor(
        async () => {
          expect(
            (await commands.getDocument(context, workspace.id))?.agentRuns.at(
              -1
            )?.status
          ).toBe("SUCCEEDED")
        },
        { timeout: 5_000 }
      )
      await Promise.all(broadcastReads)

      const stream = spans.find((span) => span.name === "agent.runtime.stream")
      const persistence = spans.find(
        (span) => span.name === "agent.stream.persist"
      )
      const root = spans.find((span) => span.name === "agent.run")
      const initialLoad = spans.find(
        (span) => span.name === "agent.workspace.load"
      )
      const runPersist = spans.find((span) => span.name === "agent.run.persist")
      const unlock = spans.find(
        (span) => span.name === "agent.workspace.unlock.load"
      )
      const draftValidation = spans.find(
        (span) => span.name === "workspace.validate_draft"
      )
      const draftCommit = spans.find(
        (span) => span.name === "workspace.commit_draft"
      )

      expect(stream).toBeDefined()
      expect(persistence).toBeDefined()
      expect(root).toBeDefined()
      expect(initialLoad).toBeDefined()
      expect(runPersist).toBeDefined()
      expect(unlock).toBeDefined()
      expect(draftValidation?.attributes).toMatchObject({
        "periplus.validation.valid": true,
      })
      expect(draftCommit?.attributes).toMatchObject({
        "periplus.command.name": "journey.apply_draft",
        "periplus.workspace.revision": 1,
      })
      expect(draftValidation?.endOrder).not.toBeNull()
      expect(draftCommit?.endOrder).not.toBeNull()
      expect(stream?.attributes).toMatchObject({
        "periplus.stream.delta_count": 2,
        "periplus.stream.byte_count": Buffer.byteLength(
          firstDelta + secondDelta,
          "utf8"
        ),
        "periplus.stream.first_delta_sequence": 1,
        "periplus.stream.last_delta_sequence": 2,
      })
      expect(stream?.attributes).toHaveProperty(
        "periplus.stream.first_delta_at_ms"
      )
      expect(stream?.attributes).toHaveProperty(
        "periplus.stream.last_delta_at_ms"
      )
      expect(stream?.attributes).not.toHaveProperty(
        "periplus.stream.first_delta"
      )
      expect(stream?.attributes).not.toHaveProperty(
        "periplus.stream.last_delta"
      )
      expect(JSON.stringify(stream?.attributes)).not.toContain(firstDelta)
      expect(JSON.stringify(stream?.attributes)).not.toContain(secondDelta)

      expect(persistence?.attributes).toMatchObject({
        "periplus.stream.persisted_count": 2,
      })
      expect(
        persistence?.events.filter((event) => event.name === "stream.persisted")
      ).toHaveLength(2)
      expect(root?.startOrder).toBeLessThan(initialLoad?.startOrder ?? 0)
      expect(runPersist?.endOrder).toBeLessThan(unlock?.startOrder ?? 0)
      expect(unlock?.endOrder).toBeLessThan(root?.endOrder ?? 0)
      expect(
        events.filter(
          (event) =>
            event.type === "agent.message.delta" &&
            typeof event.payload === "object" &&
            event.payload !== null &&
            "stream" in event.payload &&
            event.payload.stream === "stdout"
        )
      ).toHaveLength(2)
    } finally {
      getTracer.mockRestore()
    }
  })
})
