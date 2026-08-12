import { Agent, type AgentTool } from "@earendil-works/pi-agent-core"
import {
  Type,
  createFauxCore,
  fauxAssistantMessage,
  fauxToolCall,
} from "@earendil-works/pi-ai"
import { describe, expect, it, vi } from "vitest"
import { buildPrompt } from "@/backend/agent/prompt"
import { createPiCoreTools } from "@/backend/agent/pi-core-tools"

function result(value: string) {
  return {
    content: [{ type: "text" as const, text: value }],
    details: { value },
  }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

function tool(
  name: string,
  execute: () => Promise<ReturnType<typeof result>>,
  executionMode?: "sequential"
): AgentTool {
  return {
    name,
    label: name,
    description: name,
    parameters: Type.Object({}),
    ...(executionMode ? { executionMode } : {}),
    execute: async () => execute(),
  }
}

function agentForBatch(tools: AgentTool[]) {
  const faux = createFauxCore({ provider: "pi-core-test" })
  faux.setResponses([
    fauxAssistantMessage([
      fauxToolCall(tools[0]!.name, {}),
      fauxToolCall(tools[1]!.name, {}),
    ]),
    fauxAssistantMessage("done"),
  ])
  return new Agent({
    initialState: {
      model: faux.getModel(),
      messages: [{ role: "user", content: "plan", timestamp: Date.now() }],
      tools,
    },
    streamFn: faux.streamSimple,
  })
}

describe("Pi core runtime semantics", () => {
  it("keeps prompt names identical to the provider tool payload", async () => {
    const faux = createFauxCore({ provider: "pi-core-test" })
    faux.setResponses([fauxAssistantMessage("done")])
    const tools = createPiCoreTools({ execute: vi.fn().mockResolvedValue({}) })
    let providerToolNames: string[] = []
    const agent = new Agent({
      initialState: {
        systemPrompt: buildPrompt(),
        model: faux.getModel(),
        messages: [{ role: "user", content: "plan", timestamp: Date.now() }],
        tools,
      },
      streamFn: (model, context, options) => {
        providerToolNames = context.tools?.map((entry) => entry.name) ?? []
        return faux.streamSimple(model, context, options)
      },
    })

    await agent.continue()

    const promptToolNames = buildPrompt().match(/periplus__[A-Za-z_]+/g) ?? []
    expect(promptToolNames).not.toHaveLength(0)
    expect(providerToolNames).toEqual(tools.map((entry) => entry.name))
    expect(
      promptToolNames.every((name) => providerToolNames.includes(name))
    ).toBe(true)
    expect(buildPrompt()).not.toMatch(/periplus\.[a-z_]+/)
  })

  it("runs a pure read batch in parallel", async () => {
    const first = deferred()
    const second = deferred()
    const started: string[] = []
    const agent = agentForBatch([
      tool("read_one", async () => {
        started.push("read_one")
        await first.promise
        return result("one")
      }),
      tool("read_two", async () => {
        started.push("read_two")
        await second.promise
        return result("two")
      }),
    ])

    const run = agent.continue()
    await vi.waitFor(() => expect(started).toEqual(["read_one", "read_two"]))
    first.resolve()
    second.resolve()
    await run
  })

  it("serializes a mixed batch when it includes a write", async () => {
    const read = deferred()
    const write = deferred()
    const started: string[] = []
    const agent = agentForBatch([
      tool("read_one", async () => {
        started.push("read_one")
        await read.promise
        return result("one")
      }),
      tool(
        "write_one",
        async () => {
          started.push("write_one")
          await write.promise
          return result("written")
        },
        "sequential"
      ),
    ])

    const run = agent.continue()
    await vi.waitFor(() => expect(started).toEqual(["read_one"]))
    read.resolve()
    await vi.waitFor(() => expect(started).toEqual(["read_one", "write_one"]))
    write.resolve()
    await run
  })
})
