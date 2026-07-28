import { describe, expect, it, vi } from "vitest"
import { AgentGateway } from "@/backend/agent/gateway"
import type {
  AgentRuntime,
  AgentRuntimeExit,
  AgentRuntimeObserver,
  AgentRuntimeRequest,
} from "@/backend/agent/runtime"
import { DraftSessionService } from "@/modules/workspace/server/draft-session-service"
import type { AgentEvent } from "@/backend/types"

class FakeRuntime implements AgentRuntime {
  readonly id = "fake-runtime"
  request: AgentRuntimeRequest | null = null
  observer: AgentRuntimeObserver | null = null
  cancel = vi.fn()

  async start(
    request: AgentRuntimeRequest,
    observer: AgentRuntimeObserver
  ) {
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
      metadata: {
        runtimeId: this.id,
        workDir: "/tmp/fake-runtime",
      },
    }
    this.observer?.onExit(result)
  }
}

function setup() {
  const store = new DraftSessionService()
  const runtime = new FakeRuntime()
  const events: AgentEvent[] = []
  const gateway = new AgentGateway(store, runtime, {
    backendUrl: "http://127.0.0.1:3002",
    projectRoot: "/workspace/periplus",
  })
  const emit = (_sessionId: string, event: AgentEvent) => events.push(event)
  return { store, runtime, events, gateway, emit }
}

describe("AgentGateway", () => {
  it("runs through a generic runtime and injects the draft tool server", async () => {
    const { store, runtime, events, gateway, emit } = setup()

    await gateway.start("session-1", "规划杭州路线", "auto", emit)

    expect(runtime.request).toMatchObject({
      prompt: expect.stringContaining("规划杭州路线"),
      toolServers: [
        {
          id: "periplus-draft",
          configFile: {
            argument: "--config",
            content: expect.stringContaining('"sessionId": "session-1"'),
          },
        },
      ],
    })
    expect(store.isLocked("session-1")).toBe(true)
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "draft.locked" }),
        expect.objectContaining({
          type: "agent.run.started",
          payload: expect.objectContaining({ runtimeId: "fake-runtime" }),
        }),
      ])
    )

    runtime.observer?.onStdout("已完成")
    runtime.exit(0)

    expect(store.isLocked("session-1")).toBe(false)
    expect(store.getConversationMessages("session-1")).toMatchObject([
      { role: "user", content: "规划杭州路线" },
      { role: "assistant", content: "已完成" },
    ])
    expect(events.at(-1)).toMatchObject({
      type: "agent.run.completed",
      payload: {
        runtimeId: "fake-runtime",
        workDir: "/tmp/fake-runtime",
      },
    })
  })

  it("starts suggest mode without runtime tool servers and can cancel it", async () => {
    const { runtime, gateway, emit } = setup()

    await gateway.start("session-1", "给出修改建议", "suggest", emit)
    expect(runtime.request?.toolServers).toEqual([])

    gateway.cancel("session-1")
    expect(runtime.cancel).toHaveBeenCalledOnce()

    runtime.exit(0)
  })
})
