// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type JsonObject,
} from "@earendil-works/pi-ai"
import type { StreamFn } from "@earendil-works/pi-agent-core"
import { periplusServerConfig } from "@/config/periplus.server"
import {
  AmapPlaces,
  type AmapConnection,
} from "@/modules/planning/server/amap-places"
import { createPiPlanningRuntime } from "@/modules/planning/server/pi-runtime"
import type { PlanningRunInput } from "@/modules/planning/server/runtime-contract"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})
const tools = [
  {
    name: "maps_text_search",
    inputSchema: {
      type: "object",
      properties: { keywords: { type: "string" }, city: { type: "string" } },
      required: ["keywords"],
    },
  },
  {
    name: "maps_around_search",
    inputSchema: {
      type: "object",
      properties: {
        keywords: { type: "string" },
        location: { type: "string" },
        radius: { type: "string" },
      },
      required: ["keywords", "location"],
    },
  },
  {
    name: "maps_search_detail",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
]
const config = {
  model: "deepseek-flash",
  apiKey: "test-model-key",
  amapKey: "test-amap-key",
  amapRetentionPolicyId: "",
  amapRetentionFields: [],
}
const changes = {
  kind: "changes",
  operations: [],
  constraints: [],
  unverified: [],
  sources: [],
}
function input(overrides: Partial<PlanningRunInput> = {}): PlanningRunInput {
  return {
    proposalId: "proposal-1",
    runId: "run-1",
    journeyId: "journey-1",
    parentVersion: 0,
    baseRevision: 12,
    mode: "adjust",
    message: "2026年11月15日在杭州安排午餐",
    userMessages: ["2026年11月15日在杭州安排午餐"],
    baseEvents: [],
    previewEvents: [],
    operations: [],
    constraints: [],
    rebaseConflicts: [],
    deadline: new Date(Date.now() + 120000).toISOString(),
    signal: new AbortController().signal,
    onProgress: vi.fn(),
    onLivePlaces: vi.fn(),
    ...overrides,
  }
}
function connection(): AmapConnection {
  return {
    listTools: vi.fn().mockResolvedValue(tools),
    callTool: vi.fn().mockResolvedValue({ structuredContent: { pois: [] } }),
    close: vi.fn().mockResolvedValue(undefined),
  }
}
function places(
  client: AmapConnection,
  options: Partial<ConstructorParameters<typeof AmapPlaces>[0]> = {}
) {
  return new AmapPlaces({
    key: "test-key",
    policy: { id: "", fields: [] },
    events: [],
    signal: new AbortController().signal,
    onLivePlaces: vi.fn(),
    connect: async () => client,
    ...options,
  })
}
function response(content: AssistantMessage["content"], error?: string) {
  const message: AssistantMessage = {
    role: "assistant",
    content,
    api: "openai-completions",
    provider: "deepseek",
    model: "deepseek-flash",
    timestamp: Date.now(),
    stopReason: error
      ? "error"
      : content.some((part) => part.type === "toolCall")
        ? "toolUse"
        : "stop",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    ...(error ? { errorMessage: error } : {}),
  }
  const stream = createAssistantMessageEventStream()
  queueMicrotask(() => {
    stream.push({ type: "start", partial: message })
    if (error) stream.push({ type: "error", reason: "error", error: message })
    else
      stream.push({
        type: "done",
        reason: message.stopReason as "stop" | "toolUse",
        message,
      })
  })
  return stream
}
function call(name: string, args: JsonObject, id = name) {
  return { type: "toolCall" as const, id, name, arguments: args }
}

describe("AMap per-run adapter", () => {
  it("opens lazily once, verifies discovery and limits each response to five candidates", async () => {
    const client = connection()
    const connect = vi.fn().mockResolvedValue(client)
    vi.mocked(client.callTool).mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            pois: Array.from({ length: 7 }, (_, i) => ({
              id: `real-${i}`,
              name: `Place ${i}`,
            })),
          }),
        },
      ],
    })
    const session = places(client, { connect })
    expect(connect).not.toHaveBeenCalled()
    const result = await session.findPlaces("餐厅", "杭州")
    expect(result.status).toBe("ambiguous")
    expect(result.candidates).toHaveLength(5)
    expect(JSON.stringify(result)).not.toContain("real-0")
    expect(result.candidates![0].coordinates).toBeUndefined()
    await session.findPlaces("博物馆", "成都")
    expect(connect).toHaveBeenCalledTimes(1)
    expect(client.listTools).toHaveBeenCalledTimes(1)
    await session.close()
    expect(client.close).toHaveBeenCalledTimes(1)
  })

  it("uses the searched ID for detail, distinguishes missing coordinates and rejects stale references", async () => {
    const client = connection()
    vi.mocked(client.callTool)
      .mockResolvedValueOnce({
        structuredContent: { pois: [{ id: "real-poi", name: "Museum" }] },
      })
      .mockResolvedValueOnce({
        structuredContent: { id: "real-poi", name: "Museum", city: "杭州市" },
      })
      .mockResolvedValueOnce({
        structuredContent: {
          id: "real-poi",
          name: "Museum",
          city: "杭州市",
          location: "120.15,30.25",
        },
      })
    const session = places(client)
    expect((await session.inspectPlace("invented-id")).status).toBe(
      "expired_reference"
    )
    const found = await session.findPlaces("Museum", "杭州")
    const ref = found.candidates![0].candidateRef
    expect((await session.findNearby("餐厅", ref)).status).toBe(
      "needs_location"
    )
    expect((await session.inspectPlace(ref)).status).toBe("missing_coordinates")
    const inspected = await session.inspectPlace(ref)
    expect(inspected.status).toBe("found")
    expect(inspected.candidates![0].coordinates?.coordinateSystem).toBe("GCJ02")
    expect(client.callTool).toHaveBeenNthCalledWith(
      2,
      "maps_search_detail",
      { id: "real-poi" },
      expect.objectContaining({ timeoutMs: 8000 })
    )
    await session.close()
    const resumed = places(connection())
    expect((await resumed.inspectPlace(ref)).status).toBe("expired_reference")
    await resumed.close()
  })

  it("converts a known WGS84 center exactly once and serializes the remote radius as a string", async () => {
    const client = connection()
    const event = {
      id: "event-1",
      location: {
        coordinates: { lng: 120.15, lat: 30.25, coordinateSystem: "WGS84" },
      },
    } as PlanningRunInput["previewEvents"][number]
    const original = structuredClone(event)
    const session = places(client, { events: [event] })
    expect((await session.findNearby("午餐", "event-1", 500)).status).toBe(
      "empty"
    )
    const args = vi.mocked(client.callTool).mock.calls[0][1]
    expect(args.radius).toBe("500")
    expect(args.location).not.toBe("120.15,30.25")
    expect(String(args.location).split(",").map(Number)).toEqual([
      expect.closeTo(120.1548, 3),
      expect.closeTo(30.2477, 3),
    ])
    expect(event).toEqual(original)
    await session.close()
  })

  it("separates absent tools, incompatible schemas, empty results and provider failures", async () => {
    const client = connection()
    vi.mocked(client.listTools).mockResolvedValue([
      tools[0],
      {
        ...tools[1],
        inputSchema: {
          ...tools[1].inputSchema,
          required: ["keywords", "location", "unknown_required"],
        },
      },
    ])
    const session = places(client)
    expect((await session.findPlaces("unmatched")).status).toBe("empty")
    expect((await session.inspectPlace("unknown")).status).toBe(
      "expired_reference"
    )
    const incompatible = places(client, {
      events: [
        {
          id: "e",
          location: {
            coordinates: { lng: 0, lat: 0, coordinateSystem: "GCJ02" },
          },
        } as PlanningRunInput["previewEvents"][number],
      ],
    })
    expect((await incompatible.findNearby("shop", "e")).status).toBe(
      "tool_unavailable"
    )
    vi.mocked(client.callTool).mockResolvedValue({
      isError: true,
      content: [{ type: "text", text: "secret upstream error" }],
    })
    expect(await session.findPlaces("shop")).toEqual({
      status: "query_unavailable",
    })
    vi.mocked(client.callTool).mockResolvedValue({
      content: [{ type: "text", text: "invalid JSON" }],
    })
    expect(await session.findPlaces("shop")).toEqual({
      status: "query_unavailable",
    })
    vi.mocked(client.callTool).mockResolvedValue({
      structuredContent: { status: "0", infocode: "10003", pois: [] },
    })
    expect(await session.findPlaces("shop")).toEqual({
      status: "query_unavailable",
    })
    await session.close()
    await incompatible.close()
  })

  it("enforces sixteen business calls and never returns an upstream error string", async () => {
    const client = connection()
    const session = places(client)
    for (let i = 0; i < 16; i++) await session.findPlaces("text")
    expect(await session.findPlaces("over limit")).toEqual({
      status: "call_limit",
    })
    expect(client.callTool).toHaveBeenCalledTimes(16)
    await session.close()
    const failed = connection()
    vi.mocked(failed.listTools).mockRejectedValue(
      new Error("https://private.invalid?key=secret")
    )
    const bad = places(failed)
    expect(await bad.findPlaces("text")).toEqual({
      status: "query_unavailable",
    })
    await bad.close()
    expect(failed.close).toHaveBeenCalledTimes(1)
  })

  it("bounds an unresponsive HTTP tool call using the actual MCP client's eight-second timeout", async () => {
    vi.useFakeTimers()
    const requests: string[] = []
    vi.stubGlobal("fetch", async (_url: unknown, init?: RequestInit) => {
      if (init?.method === "DELETE") return new Response(null, { status: 204 })
      const request = JSON.parse(String(init?.body))
      requests.push(request.method)
      if (!request.id) return new Response(null, { status: 202 })
      if (request.method === "tools/call")
        return new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener(
            "abort",
            () => reject(new Error("request cancelled")),
            { once: true }
          )
        })
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          result:
            request.method === "initialize"
              ? {
                  protocolVersion: "2025-03-26",
                  capabilities: { tools: {} },
                  serverInfo: { name: "test-amap", version: "1" },
                }
              : { tools },
        }),
        { headers: { "Content-Type": "application/json" } }
      )
    })
    const session = new AmapPlaces({
      key: "test-key",
      policy: { id: "", fields: [] },
      events: [],
      signal: new AbortController().signal,
      onLivePlaces: vi.fn(),
    })
    const pending = session.findPlaces("shop")
    await vi.waitFor(() => expect(requests).toContain("tools/call"))
    await vi.advanceTimersByTimeAsync(8000)
    expect(await pending).toEqual({ status: "query_unavailable" })
    expect(requests.filter((method) => method === "tools/call")).toHaveLength(1)
    await session.close()
  })

  it("ignores a provider response that arrives after cancellation", async () => {
    const client = connection(),
      controller = new AbortController(),
      publish = vi.fn()
    let finish!: (
      value: Awaited<ReturnType<AmapConnection["callTool"]>>
    ) => void
    vi.mocked(client.callTool).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const session = places(client, {
      signal: controller.signal,
      onLivePlaces: publish,
    })
    const pending = session.findPlaces("shop")
    await vi.waitFor(() => expect(client.callTool).toHaveBeenCalledTimes(1))
    controller.abort()
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    })
    finish({
      structuredContent: { pois: [{ id: "late", name: "late private name" }] },
    })
    await rejected
    expect(publish).not.toHaveBeenCalled()
    expect(session.result()).toEqual({
      permittedFacts: [],
      displayOnlyValues: [],
    })
    await session.close()
  })

  it("retains no fields by default and issues only facts covered by explicit current authorization", async () => {
    const client = connection()
    vi.mocked(client.callTool).mockResolvedValue({
      structuredContent: {
        pois: [
          { id: "real-poi", name: "Private place", address: "Private address" },
        ],
      },
    })
    const unlicensed = places(client)
    await unlicensed.findPlaces("shop")
    expect(unlicensed.result().permittedFacts).toEqual([])
    expect(unlicensed.result().displayOnlyValues).toContain("Private place")
    const licensed = places(client, {
      policy: { id: "authorization-1", fields: ["name"] },
    })
    const result = await licensed.findPlaces("shop")
    const fact = result.candidates![0].facts[0]
    const runtime = createPiPlanningRuntime({
      config: {
        ...config,
        amapRetentionPolicyId: "authorization-1",
        amapRetentionFields: ["name"],
      },
    })
    expect(runtime.canRetain(fact)).toBe(true)
    expect(
      runtime.canRetain({ ...fact, policyId: "authorization-1:address" })
    ).toBe(false)
    expect(createPiPlanningRuntime({ config }).canRetain(fact)).toBe(false)
    expect(licensed.result().displayOnlyValues).toContain("Private address")
    await unlicensed.close()
    await licensed.close()
  })
})

describe("Pi planning runtime", () => {
  it("executes the real Agent tool loop, returns one valid result and emits only static progress", async () => {
    const client = connection(),
      connect = vi.fn().mockResolvedValue(client),
      observed: unknown[] = []
    let turn = 0
    const streamFn: StreamFn = (_model, context) => {
      observed.push(context)
      turn++
      return response(
        turn === 1
          ? [
              { type: "text", text: "PRIVATE RAW MODEL TEXT" },
              call("find_places", { keywords: "餐厅", city: "杭州" }),
            ]
          : [
              call("finish_turn", changes, "first-finish"),
              call(
                "finish_turn",
                {
                  kind: "question",
                  message: "must not replace first",
                  choices: [],
                },
                "second-finish"
              ),
            ]
      )
    }
    const runInput = input()
    const result = await createPiPlanningRuntime({
      config,
      streamFn,
      connectAmap: connect,
    }).run(runInput)
    expect(result.output).toEqual(changes)
    expect(turn).toBe(2)
    expect(client.close).toHaveBeenCalledTimes(1)
    expect(
      JSON.stringify(vi.mocked(runInput.onProgress).mock.calls)
    ).not.toContain("PRIVATE")
    expect(JSON.stringify(observed)).not.toContain(config.apiKey)
    expect(JSON.stringify(observed)).not.toContain(config.amapKey)
  })

  it("allows text-only planning when AMap is unavailable and never opens MCP without a query", async () => {
    const connect = vi.fn(),
      runInput = input({
        mode: "rebase",
        rebaseConflicts: ["Deleted stop"],
        question: {
          runId: "prior-run",
          message: "请提供出发日期",
          choices: [],
        },
      })
    const seen: string[] = []
    const result = await createPiPlanningRuntime({
      config: { ...config, amapKey: "" },
      connectAmap: connect,
      streamFn: (_m, context) => {
        seen.push(JSON.stringify(context))
        return response([
          call("finish_turn", {
            kind: "question",
            message: "请提供出发日期",
            choices: [],
          }),
        ])
      },
    }).run(runInput)
    expect(result.output.kind).toBe("question")
    expect(connect).not.toHaveBeenCalled()
    expect(seen[0]).toContain("Deleted stop")
    expect(seen[0]).toContain("rebase")
    expect(seen[0]).toContain("prior-run")
  })

  it("requires place choiceRef to be a current candidateRef and keeps its real name out of the question", async () => {
    const client = connection(),
      runInput = input()
    vi.mocked(client.callTool).mockResolvedValue({
      structuredContent: {
        pois: [{ id: "real-poi", name: "Private supplier name" }],
      },
    })
    let turn = 0,
      reference = ""
    const runtime = createPiPlanningRuntime({
      config,
      connectAmap: async () => client,
      streamFn: (_m, context) => {
        turn++
        if (turn === 1)
          return response([call("find_places", { keywords: "shop" })])
        const tool = context.messages.find(
          (message) => message.role === "toolResult"
        )!
        if (tool.role !== "toolResult" || tool.content[0].type !== "text")
          throw new Error("Missing tool result")
        reference = JSON.parse(tool.content[0].text).candidates[0].candidateRef
        return response([
          call("finish_turn", {
            kind: "question",
            message: "请选择地点",
            choices: [
              {
                choiceRef: turn === 2 ? "amap:expired-reference" : reference,
                label: "候选地点1",
              },
            ],
          }),
        ])
      },
    })
    const result = await runtime.run(runInput)
    expect(turn).toBe(3)
    expect(result.output).toMatchObject({
      kind: "question",
      choices: [{ choiceRef: reference }],
    })
    expect(
      vi.mocked(runInput.onLivePlaces).mock.calls[0][0][0].candidateRef
    ).toBe(reference)
    expect(JSON.stringify(result.output)).not.toContain("Private supplier name")
  })

  it("lets an invalid finish be corrected, and stops after eight responses without a valid finish", async () => {
    let turns = 0
    const runtime = createPiPlanningRuntime({
      config,
      streamFn: () =>
        response([
          call(
            "finish_turn",
            ++turns === 1
              ? { kind: "changes", unsupported: "not allowed" }
              : changes
          ),
        ]),
    })
    expect((await runtime.run(input())).output).toEqual(changes)
    expect(turns).toBe(2)
    const never = vi.fn<StreamFn>(() =>
      response([{ type: "text", text: "No structured output" }])
    )
    await expect(
      createPiPlanningRuntime({ config, streamFn: never }).run(input())
    ).rejects.toThrow("RUN_FAILED")
    expect(never).toHaveBeenCalledTimes(8)
  })

  it("cancels a blocked model and does not accept its late finish", async () => {
    const controller = new AbortController()
    const late = createAssistantMessageEventStream()
    const called = vi.fn<StreamFn>(() => late)
    const pending = createPiPlanningRuntime({ config, streamFn: called }).run(
      input({ signal: controller.signal })
    )
    await vi.waitFor(() => expect(called).toHaveBeenCalledTimes(1))
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
    late.end()
  })

  it("continues a valid place selection across two runs without asking the user to choose again", async () => {
    const clients: AmapConnection[] = []
    let reference = "",
      resumed = false
    const runtime = createPiPlanningRuntime({
      config,
      connectAmap: async () => {
        const client = connection()
        vi.mocked(client.callTool).mockImplementation(async (name, args) => {
          if (name === "maps_search_detail") {
            expect(args.id).toBe("real-from-search")
            return {
              structuredContent: {
                id: "real-from-search",
                name: "Private restaurant",
                city: "杭州市",
                location: "120.15,30.25",
              },
            }
          }
          return {
            structuredContent: {
              pois: [{ id: "real-from-search", name: "Private restaurant" }],
            },
          }
        })
        clients.push(client)
        return client
      },
      streamFn: (_model, context) => {
        const message = context.messages.find((item) => item.role === "user")!
        if (message.role !== "user") throw new Error("Missing planning input")
        const prompt = JSON.parse(
          typeof message.content === "string"
            ? message.content
            : message.content
                .filter((part) => part.type === "text")
                .map((part) => part.text)
                .join("")
        )
        const result = context.messages.find(
          (item) => item.role === "toolResult"
        )
        if (prompt.replyToRunId) {
          resumed = true
          expect(prompt.selectedPlaceRef).toBe(reference)
          expect(prompt.resumedCandidates[0].candidateRef).toBe(reference)
          if (!result)
            return response([
              call("inspect_place", { candidateRef: reference }),
            ])
          return response([call("finish_turn", changes)])
        }
        if (!result)
          return response([
            call("find_places", { keywords: "餐厅", city: "杭州" }),
          ])
        if (result.role !== "toolResult" || result.content[0].type !== "text")
          throw new Error("Missing search result")
        reference = JSON.parse(result.content[0].text).candidates[0]
          .candidateRef
        return response([
          call("finish_turn", {
            kind: "question",
            message: "请选择地点",
            choices: [{ choiceRef: reference, label: "候选地点1" }],
          }),
        ])
      },
    })
    const first = await runtime.run(input())
    expect(first).toHaveProperty("livePlacesExpiresAt")
    if (first.output.kind !== "question")
      throw new Error("Expected place question")
    const next = input({
      runId: "run-2",
      replyToRunId: "run-1",
      choiceRef: reference,
      question: {
        runId: "run-1",
        message: first.output.message,
        choices: first.output.choices,
      },
      message: "候选地点1",
    })
    const second = await runtime.run(next)
    expect(resumed).toBe(true)
    expect(second.output).toEqual(changes)
    expect(clients).toHaveLength(2)
    expect(
      vi.mocked(clients[1].callTool).mock.calls.map(([name]) => name)
    ).toEqual(["maps_search_detail"])
    expect(vi.mocked(next.onLivePlaces).mock.calls[0][0][0].candidateRef).toBe(
      reference
    )
    expect(second.displayOnlyValues).toContain("Private restaurant")
    expect(second.permittedFacts).toEqual([])
    expect(
      clients.every((client) => vi.mocked(client.close).mock.calls.length === 1)
    ).toBe(true)
  })

  it.each(["expired", "restarted", "other-journey"])(
    "requires a renewed choice when a pending candidate is %s",
    async (reason) => {
      vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })
      let reference = "",
        missing = false
      const options = {
        config,
        connectAmap: async () => {
          const client = connection()
          vi.mocked(client.callTool).mockResolvedValue({
            structuredContent: {
              pois: [{ id: "searched-id", name: "Private restaurant" }],
            },
          })
          return client
        },
        streamFn: ((_model, context) => {
          const message = context.messages.find((item) => item.role === "user")!
          if (message.role !== "user") throw new Error("Missing planning input")
          const prompt = JSON.parse(
            typeof message.content === "string"
              ? message.content
              : message.content
                  .filter((part) => part.type === "text")
                  .map((part) => part.text)
                  .join("")
          )
          if (prompt.replyToRunId) {
            missing = true
            expect(prompt.selectedPlaceRef).toBeUndefined()
            expect(prompt.resumedCandidates).toEqual([])
          }
          const result = context.messages.find(
            (item) => item.role === "toolResult"
          )
          if (!result)
            return response([
              call("find_places", { keywords: "餐厅", city: "杭州" }),
            ])
          if (result.role !== "toolResult" || result.content[0].type !== "text")
            throw new Error("Missing search result")
          reference = JSON.parse(result.content[0].text).candidates[0]
            .candidateRef
          return response([
            call("finish_turn", {
              kind: "question",
              message: "请重新确认地点",
              choices: [{ choiceRef: reference, label: "候选地点1" }],
            }),
          ])
        }) as StreamFn,
      }
      let runtime = createPiPlanningRuntime(options)
      const first = await runtime.run(input())
      if (first.output.kind !== "question")
        throw new Error("Expected place question")
      const originalRef = reference
      if (reason === "expired") await vi.advanceTimersByTimeAsync(120001)
      if (reason === "restarted") runtime = createPiPlanningRuntime(options)
      const second = await runtime.run(
        input({
          runId: "run-2",
          replyToRunId: "run-1",
          choiceRef: originalRef,
          journeyId: reason === "other-journey" ? "other-journey" : "journey-1",
          question: {
            runId: "run-1",
            message: first.output.message,
            choices: first.output.choices,
          },
          message: "候选地点1",
        })
      )
      expect(missing).toBe(true)
      expect(second.output).toMatchObject({
        kind: "question",
        choices: [{ choiceRef: reference }],
      })
      expect(reference).not.toBe(originalRef)
    }
  )

  it("enforces a real deadline and rejects missing model configuration explicitly", async () => {
    const pending = createPiPlanningRuntime({
      config,
      streamFn: () => createAssistantMessageEventStream(),
    }).run(input({ deadline: new Date(Date.now() + 30).toISOString() }))
    await expect(pending).rejects.toMatchObject({ name: "TimeoutError" })
    await expect(
      createPiPlanningRuntime({ config: { ...config, apiKey: "" } }).run(
        input()
      )
    ).rejects.toThrow("DEEPSEEK_API_KEY is required")
    await expect(
      createPiPlanningRuntime({
        config: { ...config, model: "unknown-model" },
      }).run(input())
    ).rejects.toThrow("unknown PERIPLUS_PLANNING_MODEL")
  })

  it("does not expose raw provider/model errors", async () => {
    const runInput = input()
    await expect(
      createPiPlanningRuntime({
        config,
        streamFn: () => response([], "secret query key and model payload"),
      }).run(runInput)
    ).rejects.toThrow("RUN_FAILED: planning runtime could not finish this turn")
    expect(
      JSON.stringify(vi.mocked(runInput.onProgress).mock.calls)
    ).not.toContain("secret")
  })

  it("requires explicit recognized fields and a policy ID before allowing retention", () => {
    vi.stubEnv("PERIPLUS_AMAP_RETENTION_FIELDS", "")
    expect(periplusServerConfig.planning.amapRetentionFields).toEqual([])
    vi.stubEnv("PERIPLUS_AMAP_RETENTION_FIELDS", "name,photos")
    expect(() => periplusServerConfig.planning.amapRetentionFields).toThrow(
      "Invalid"
    )
    vi.stubEnv("PERIPLUS_AMAP_RETENTION_FIELDS", "name")
    vi.stubEnv("PERIPLUS_AMAP_RETENTION_POLICY_ID", "")
    expect(() => periplusServerConfig.planning.amapRetentionFields).toThrow(
      "POLICY_ID is required"
    )
  })
})
