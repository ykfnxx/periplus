import {
  Agent,
  DEFAULT_COMPACTION_SETTINGS,
  estimateContextTokens,
  generateSummaryWithUsage,
  shouldCompact,
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
import type { AgentMode } from "../types"
import type { AgentToolRequest } from "./gateway"
import { canonicalPiCoreToolName, createPiCoreTools } from "./pi-core-tools"

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

export interface AgentContextCheckpoint {
  summary: string
  throughMessageId: string
}

export interface PeriplusAgentHarnessRequest {
  runId: string
  workspaceId: string
  mode: AgentMode
  systemPrompt: string
  messages: PersistedAgentMessage[]
  checkpoint: AgentContextCheckpoint | null
  executeTool: (
    request: AgentToolRequest,
    signal?: AbortSignal
  ) => Promise<unknown>
  saveCheckpoint: (checkpoint: AgentContextCheckpoint) => Promise<void>
}

export interface PeriplusAgentHarnessResult {
  status: "succeeded" | "cancelled" | "failed"
  error?: Error
}

export type PeriplusHarnessEvent =
  | {
      type: "context_prepared"
      input: string
      messageCount: number
      estimatedTokens: number
      compacted: boolean
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

function recentMessageStart(
  messages: AgentMessage[],
  keepRecentTokens: number
) {
  let tokens = 0
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    tokens += estimateContextTokens([messages[index]!]).tokens
    if (tokens > keepRecentTokens) return index + 1
  }
  return 0
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

export class PeriplusAgentHarness {
  readonly id = "pi-agent-core"
  private readonly model: Model<"openai-responses">
  private readonly models: ReturnType<typeof createDeepSeekModels>

  constructor(private readonly options: PeriplusAgentHarnessOptions) {
    this.model = deepSeekModel(options.model)
    this.models = createDeepSeekModels(this.model, options.apiKey)
  }

  async start(
    request: PeriplusAgentHarnessRequest,
    observer: PeriplusAgentHarnessObserver
  ): Promise<PeriplusAgentHarnessRun> {
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

    let prepared
    try {
      prepared = await this.prepareContext(
        request,
        observer,
        abortController.signal
      )
    } catch (error) {
      clearTimeout(timeout)
      throw error
    }
    const tools =
      request.mode === "auto"
        ? createPiCoreTools({
            execute: request.executeTool,
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
        : []
    observer.onEvent({
      type: "context_prepared",
      input: contextInput({
        systemPrompt: prepared.systemPrompt,
        messages: prepared.messages,
        tools,
      }),
      messageCount: prepared.messages.length,
      estimatedTokens: estimateContextTokens(prepared.messages).tokens,
      compacted: prepared.compacted,
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
      toolExecution: "sequential",
    })
    activeAgent = agent

    let settled = false
    const settle = (result: PeriplusAgentHarnessResult) => {
      if (settled) return
      settled = true
      observer.onEvent({ type: "run_end", result })
    }
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
      if (event.type === "message_end" && event.message.role === "assistant") {
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

    void agent
      .continue()
      .then(() => {
        const error = agent.state.errorMessage
          ? new Error(agent.state.errorMessage)
          : undefined
        return settle({
          status: cancelled ? "cancelled" : error ? "failed" : "succeeded",
          ...(error ? { error } : {}),
        })
      })
      .catch((error) =>
        settle({
          status: cancelled ? "cancelled" : "failed",
          error: error instanceof Error ? error : new Error(String(error)),
        })
      )
      .finally(() => clearTimeout(timeout))

    return {
      cancel: () => {
        cancelled = true
        abortController.abort()
        agent.abort()
      },
    }
  }

  private async prepareContext(
    request: PeriplusAgentHarnessRequest,
    observer: PeriplusAgentHarnessObserver,
    signal: AbortSignal
  ) {
    let checkpoint = request.checkpoint
    const checkpointIndex = checkpoint
      ? request.messages.findIndex(
          (message) => message.id === checkpoint!.throughMessageId
        )
      : -1
    let visibleMessages = request.messages.slice(checkpointIndex + 1)
    const piMessages = toPiMessages(visibleMessages, this.options.model)
    const checkpointTokens = checkpoint
      ? Math.ceil(checkpoint.summary.length / 4)
      : 0
    const contextTokens =
      estimateContextTokens(piMessages).tokens + checkpointTokens
    let compacted = false
    if (
      shouldCompact(
        contextTokens,
        this.model.contextWindow,
        DEFAULT_COMPACTION_SETTINGS
      )
    ) {
      const retainedStart = recentMessageStart(
        piMessages,
        DEFAULT_COMPACTION_SETTINGS.keepRecentTokens
      )
      const summarizedMessages = piMessages.slice(0, retainedStart)
      const summarizedPersisted = visibleMessages
        .filter((message) => message.content.trim())
        .slice(0, retainedStart)
      if (!summarizedMessages.length || !summarizedPersisted.length) {
        throw new Error("Pi context compaction has no durable message boundary")
      }
      const requestId = `${request.runId}:compaction`
      const startedAt = performance.now()
      observer.onEvent({
        type: "model_start",
        requestId,
        provider: this.model.provider,
        model: this.model.id,
        input: JSON.stringify({
          operation: "context_compaction",
          messages: summarizedMessages,
        }),
        startedAt,
      })
      const summary = await generateSummaryWithUsage(
        summarizedMessages,
        this.models,
        this.model,
        DEFAULT_COMPACTION_SETTINGS.reserveTokens,
        signal,
        undefined,
        checkpoint?.summary,
        "high"
      )
      if (!summary.ok) {
        observer.onEvent({
          type: "model_end",
          requestId,
          output: summary.error.message,
          toolCalls: [],
          usage: EMPTY_USAGE,
          stopReason: "error",
          endedAt: performance.now(),
        })
        throw summary.error
      }
      observer.onEvent({
        type: "model_end",
        requestId,
        output: summary.value.text,
        toolCalls: [],
        usage: summary.value.usage,
        stopReason: "stop",
        endedAt: performance.now(),
      })
      checkpoint = {
        summary: summary.value.text,
        throughMessageId: summarizedPersisted.at(-1)!.id,
      }
      await request.saveCheckpoint(checkpoint)
      visibleMessages = request.messages.slice(
        request.messages.findIndex(
          (message) => message.id === checkpoint!.throughMessageId
        ) + 1
      )
      compacted = true
    }
    return {
      systemPrompt: checkpoint
        ? `${request.systemPrompt}\n\n[COMPACTED_CONVERSATION]\n${checkpoint.summary}`
        : request.systemPrompt,
      messages: toPiMessages(visibleMessages, this.options.model),
      compacted,
    }
  }
}
