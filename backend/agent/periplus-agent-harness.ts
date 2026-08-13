import {
  Agent,
  DEFAULT_COMPACTION_SETTINGS,
  estimateContextTokens,
  generateSummaryWithUsage,
  type AgentMessage,
} from "@earendil-works/pi-agent-core"
import {
  createModels,
  createProvider,
  type Api,
  type AssistantMessage,
  type Context,
  type Model,
  type SimpleStreamOptions,
  type Usage,
} from "@earendil-works/pi-ai"
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy"
import type { PlannerBaseline } from "./planner-baseline"
import type { AgentToolRequest } from "./tool-contract"
import {
  canonicalPiCoreToolName,
  createPiCoreTools,
  piCoreToolCatalogVersion,
} from "./pi-core-tools"

const EMPTY_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
}

export interface PersistedAgentMessage {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: string
}

export interface PeriplusAgentHarnessRequest {
  runId: string
  workspaceId: string
  systemPrompt: string
  conversationSummary: string
  baseline: PlannerBaseline
  currentUserRequest: string
  defaultTripStartDate: string
  executeTool: (
    request: AgentToolRequest,
    toolCallId: string,
    signal?: AbortSignal
  ) => Promise<unknown>
  changeLogContext: () => unknown
}

export interface PeriplusAgentHarnessResult {
  status: "succeeded" | "cancelled" | "failed"
  finalOutput?: string
  error?: Error
}

export type PeriplusHarnessEvent =
  | {
      type: "context_prepared"
      input: string
      messageCount: number
      estimatedTokens: number
      compacted: boolean
      summaryStatus: "READY" | "EMPTY"
      baselineRevision: number
      toolCatalogVersion: string
    }
  | {
      type: "model_start"
      requestId: string
      provider: string
      model: string
      input: string
      startedAt: number
    }
  | {
      type: "model_end"
      requestId: string
      output: string
      toolCalls: Array<{ id: string; name: string; arguments: unknown }>
      usage: Usage
      stopReason: string
      endedAt: number
    }
  | { type: "message_delta"; text: string }
  | { type: "message_end"; text: string }
  | {
      type: "tool_start"
      toolCallId: string
      toolName: string
      providerToolName: string
      args: unknown
    }
  | {
      type: "tool_end"
      toolCallId: string
      toolName: string
      providerToolName: string
      result: unknown
      isError: boolean
    }
  | { type: "run_end"; result: PeriplusAgentHarnessResult }

export interface PeriplusAgentHarnessObserver {
  onEvent: (event: PeriplusHarnessEvent) => void
}

export interface PeriplusAgentHarnessRun {
  cancel: () => void
}

interface PeriplusAgentHarnessOptions {
  apiKey: string
  model: string
  webSearchEnabled: boolean
  timeoutMs: number
}

function deepSeekModel(model: string): Model<"openai-responses"> {
  return {
    id: model,
    name: "DeepSeek Responses",
    api: "openai-responses",
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com",
    reasoning: true,
    thinkingLevelMap: {
      off: null,
      minimal: null,
      low: null,
      medium: null,
      high: "high",
      xhigh: null,
      max: "max",
    },
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 32_768,
  }
}

function createDeepSeekModels(
  model: Model<"openai-responses">,
  apiKey: string
) {
  const models = createModels()
  models.setProvider(
    createProvider({
      id: "deepseek",
      name: "DeepSeek",
      baseUrl: model.baseUrl,
      auth: {
        apiKey: {
          name: "DeepSeek API key",
          resolve: async () => ({ auth: { apiKey } }),
        },
      },
      models: [model],
      api: openAIResponsesApi(),
    })
  )
  return models
}

function toPiMessages(
  messages: PersistedAgentMessage[],
  model: string
): AgentMessage[] {
  return messages
    .filter((message) => message.content.trim())
    .map((message) => {
      const timestamp = Date.parse(message.createdAt)
      if (message.role === "user") {
        return { role: "user" as const, content: message.content, timestamp }
      }
      return {
        role: "assistant" as const,
        content: [{ type: "text" as const, text: message.content }],
        api: "openai-responses" as const,
        provider: "deepseek",
        model,
        usage: EMPTY_USAGE,
        stopReason: "stop" as const,
        timestamp,
      }
    })
}

function assistantText(message: AssistantMessage) {
  return message.content
    .filter((content) => content.type === "text")
    .map((content) => content.text)
    .join("")
}

function assistantToolCalls(message: AssistantMessage) {
  return message.content.flatMap((content) =>
    content.type === "toolCall"
      ? [
          {
            id: content.id,
            name: canonicalPiCoreToolName(content.name) ?? content.name,
            arguments: content.arguments,
          },
        ]
      : []
  )
}

function contextInput(context: {
  systemPrompt?: string
  messages: unknown
  tools?: ReadonlyArray<{
    name: string
    description: string
    parameters: unknown
    executionMode?: string
  }>
}) {
  return JSON.stringify({
    systemPrompt: context.systemPrompt ?? "",
    messages: context.messages,
    tools: context.tools?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      executionMode: tool.executionMode,
    })),
  })
}

function throwIfAborted(signal: AbortSignal) {
  if (!signal.aborted) return
  const error = new Error("Pi core run was cancelled")
  error.name = "AbortError"
  throw error
}

function runContextMessage(request: PeriplusAgentHarnessRequest): AgentMessage {
  return {
    role: "user",
    content: [
      "[UNCOMMITTED_CHANGE_LOG]",
      JSON.stringify(request.changeLogContext()),
      "",
      "[NEXT_ACTION]",
      "Continue from the immutable committed baseline plus this bounded append-only log. Do not infer state from prior Tool transcript.",
    ].join("\n"),
    timestamp: Date.now(),
  }
}

export class PeriplusAgentHarness {
  readonly id = "pi-agent-core"
  private readonly model: Model<"openai-responses">
  private readonly models: ReturnType<typeof createDeepSeekModels>

  constructor(private readonly options: PeriplusAgentHarnessOptions) {
    this.model = deepSeekModel(options.model)
    this.models = createDeepSeekModels(this.model, options.apiKey)
  }

  start(
    request: PeriplusAgentHarnessRequest,
    observer: PeriplusAgentHarnessObserver
  ): PeriplusAgentHarnessRun {
    if (!this.options.apiKey) {
      throw new Error("DEEPSEEK_API_KEY is required for the Pi core harness")
    }

    const abortController = new AbortController()
    let cancelled = false
    let activeAgent: Agent | null = null
    const timeout = setTimeout(() => {
      cancelled = true
      abortController.abort()
      activeAgent?.abort()
    }, this.options.timeoutMs)
    timeout.unref?.()
    let commitCompleted = false

    let settled = false
    const settle = (result: PeriplusAgentHarnessResult) => {
      if (settled) return
      settled = true
      observer.onEvent({ type: "run_end", result })
    }
    void (async () => {
      try {
        const prepared = this.prepareContext(request, abortController.signal)
        throwIfAborted(abortController.signal)
        const tools = createPiCoreTools({
          execute: async (toolRequest, toolCallId, signal) => {
            const result = await request.executeTool(
              toolRequest,
              toolCallId,
              signal
            )
            if (
              toolRequest.type === "path.commit" &&
              result &&
              typeof result === "object" &&
              "status" in result &&
              result.status === "ok"
            ) {
              commitCompleted = true
            }
            return result
          },
          ...(this.options.webSearchEnabled
            ? {
                webSearch: {
                  apiKey: this.options.apiKey,
                  model: this.options.model,
                  maxSearches: 3,
                },
              }
            : {}),
        })
        observer.onEvent({
          type: "context_prepared",
          input: contextInput({
            systemPrompt: prepared.systemPrompt,
            messages: prepared.messages,
            tools,
          }),
          messageCount: prepared.messages.length,
          estimatedTokens: estimateContextTokens(prepared.messages).tokens,
          compacted: Boolean(request.conversationSummary),
          summaryStatus: request.conversationSummary ? "READY" : "EMPTY",
          baselineRevision: request.baseline.workspaceRevision,
          toolCatalogVersion: piCoreToolCatalogVersion(),
        })

        let requestSequence = 0
        const streamFn = (
          model: Model<Api>,
          context: Context,
          options?: SimpleStreamOptions
        ) => {
          const requestId = `${request.runId}:model:${requestSequence++}`
          const startedAt = performance.now()
          observer.onEvent({
            type: "model_start",
            requestId,
            provider: model.provider,
            model: model.id,
            input: contextInput(context),
            startedAt,
          })
          const signal = options?.signal
            ? AbortSignal.any([abortController.signal, options.signal])
            : abortController.signal
          return this.models.streamSimple(model, context, {
            ...options,
            apiKey: this.options.apiKey,
            signal,
          })
        }
        const agent = new Agent({
          initialState: {
            systemPrompt: prepared.systemPrompt,
            model: this.model,
            thinkingLevel: "high",
            messages: prepared.messages,
            tools,
          },
          streamFn,
          getApiKey: () => this.options.apiKey,
          shouldStopAfterTurn: () => commitCompleted,
          transformContext: async (messages) => {
            const currentRequest = messages.find(
              (message) => message.role === "user"
            )
            return [
              ...(currentRequest ? [currentRequest] : []),
              runContextMessage(request),
            ]
          },
        })
        activeAgent = agent
        agent.subscribe((event) => {
          if (
            event.type === "message_update" &&
            event.assistantMessageEvent.type === "text_delta"
          ) {
            observer.onEvent({
              type: "message_delta",
              text: event.assistantMessageEvent.delta,
            })
          }
          if (
            event.type === "message_end" &&
            event.message.role === "assistant"
          ) {
            const output = assistantText(event.message)
            observer.onEvent({ type: "message_end", text: output })
            observer.onEvent({
              type: "model_end",
              requestId: `${request.runId}:model:${requestSequence - 1}`,
              output,
              toolCalls: assistantToolCalls(event.message),
              usage: event.message.usage,
              stopReason: event.message.stopReason,
              endedAt: performance.now(),
            })
          }
          if (event.type === "tool_execution_start") {
            const toolName =
              canonicalPiCoreToolName(event.toolName) ?? event.toolName
            observer.onEvent({
              type: "tool_start",
              toolCallId: event.toolCallId,
              toolName,
              providerToolName: event.toolName,
              args: event.args,
            })
          }
          if (event.type === "tool_execution_end") {
            const toolName =
              canonicalPiCoreToolName(event.toolName) ?? event.toolName
            observer.onEvent({
              type: "tool_end",
              toolCallId: event.toolCallId,
              toolName,
              providerToolName: event.toolName,
              result: event.result,
              isError: event.isError,
            })
          }
        })
        await agent.continue()
        const error = agent.state.errorMessage
          ? new Error(agent.state.errorMessage)
          : undefined
        const finalAssistantMessage = [...agent.state.messages]
          .reverse()
          .find((message) => message.role === "assistant")
        const finalOutput = finalAssistantMessage
          ? assistantText(finalAssistantMessage)
          : ""
        settle({
          status: commitCompleted
            ? "succeeded"
            : cancelled
              ? "cancelled"
              : error
                ? "failed"
                : "succeeded",
          ...(finalOutput.trim() ? { finalOutput } : {}),
          ...(error ? { error } : {}),
        })
      } catch (error) {
        settle({
          status:
            cancelled || abortController.signal.aborted
              ? "cancelled"
              : "failed",
          ...(cancelled || abortController.signal.aborted
            ? {}
            : {
                error:
                  error instanceof Error ? error : new Error(String(error)),
              }),
        })
      } finally {
        clearTimeout(timeout)
      }
    })()

    return {
      cancel: () => {
        cancelled = true
        abortController.abort()
        activeAgent?.abort()
      },
    }
  }

  private prepareContext(
    request: PeriplusAgentHarnessRequest,
    signal: AbortSignal
  ) {
    throwIfAborted(signal)
    const effectiveSystemPrompt = [
      request.systemPrompt,
      "",
      "[CONVERSATION_SUMMARY]",
      request.conversationSummary || "{}",
      "",
      "[WORKSPACE_BASELINE]",
      JSON.stringify(request.baseline),
      "",
      "[CURRENT_USER_REQUEST_METADATA]",
      JSON.stringify({
        defaultTripStartDate: request.defaultTripStartDate,
        runId: request.runId,
      }),
    ].join("\n")
    const messages = toPiMessages(
      [
        {
          id: `${request.runId}:current-user`,
          role: "user",
          content: request.currentUserRequest,
          createdAt: new Date().toISOString(),
        },
      ],
      this.options.model
    )
    return {
      systemPrompt: effectiveSystemPrompt,
      messages,
    }
  }

  async generateConversationSummary(
    messages: PersistedAgentMessage[],
    previousSummary: string | undefined,
    signal: AbortSignal
  ) {
    throwIfAborted(signal)
    const piMessages = toPiMessages(messages, this.options.model)
    if (!piMessages.length) return "{}"
    const result = await generateSummaryWithUsage(
      piMessages,
      this.models,
      this.model,
      DEFAULT_COMPACTION_SETTINGS.reserveTokens,
      signal,
      [
        "Return one compact JSON object containing only durable business memory.",
        "Allowed content: current user goals, preferences, constraints, confirmed decisions, unresolved business matters, and the previous run outcome.",
        "Exclude route cards, provider candidates, tool transcripts, draft/evidence handles, validator issues, credentials, headers, file paths, and facts reconstructible from the Workspace baseline.",
        "Fields may be absent and arrays may be empty. Output JSON only.",
      ].join(" "),
      previousSummary,
      "high"
    )
    throwIfAborted(signal)
    if (!result.ok) throw result.error
    const text = result.value.text.trim()
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Conversation summary must be a JSON object")
    }
    if (Buffer.byteLength(text, "utf8") > 32_768) {
      throw new Error("Conversation summary exceeds 32 KiB")
    }
    return JSON.stringify(parsed)
  }
}
