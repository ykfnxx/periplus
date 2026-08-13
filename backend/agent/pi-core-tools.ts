import Anthropic from "@anthropic-ai/sdk"
import { createHash } from "node:crypto"
import type { AgentTool } from "@earendil-works/pi-agent-core"
import { Type, type TSchema } from "typebox"
import { z } from "zod"
import {
  cityResolveToolSchema,
  hotelSearchToolSchema,
  pathAppendEventToolSchema,
  pathCommitToolSchema,
  pathRemoveEventToolSchema,
  pathReplaceEventToolSchema,
  pathValidateToolSchema,
  placeResolveToolSchema,
  routeResolveToolSchema,
  type AgentToolRequest,
} from "./tool-contract"

type ToolExecutor = (
  request: AgentToolRequest,
  toolCallId: string,
  signal?: AbortSignal
) => Promise<unknown>

interface PeriplusToolDefinition {
  canonicalName: string
  label: string
  description: string
  input: z.ZodType
  requestType: AgentToolRequest["type"]
  sequential?: boolean
}

const providerToolName = (canonicalName: string) =>
  canonicalName.replaceAll(".", "__")

function providerToolResult(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(providerToolResult)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      key === "allowedTools" && Array.isArray(entry)
        ? entry.map((tool) =>
            typeof tool === "string" ? providerToolName(tool) : tool
          )
        : providerToolResult(entry),
    ])
  )
}

export interface PiCoreToolOptions {
  execute: ToolExecutor
  webSearch?: {
    apiKey: string
    model: string
    maxSearches: number
  }
}

function result(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(providerToolResult(value), null, 2),
      },
    ],
    details: value,
  }
}

function parameters(input: z.ZodType): TSchema {
  return Type.Unsafe(z.toJSONSchema(input))
}

const definitions: PeriplusToolDefinition[] = [
  {
    canonicalName: "city.resolve",
    label: "Resolve canonical city",
    description:
      "Resolve one human city query. Canonical identity remains backend-only.",
    input: cityResolveToolSchema,
    requestType: "city.resolve",
    sequential: true,
  },
  {
    canonicalName: "place.resolve",
    label: "Resolve canonical place",
    description:
      "Resolve one explicit place inside a city and bind the fact to a proposal item key.",
    input: placeResolveToolSchema,
    requestType: "place.resolve",
    sequential: true,
  },
  {
    canonicalName: "hotel.search",
    label: "Search hotel",
    description:
      "Search one concrete stay request and bind the stable first result to a proposal item key.",
    input: hotelSearchToolSchema,
    requestType: "hotel.search",
    sequential: true,
  },
  {
    canonicalName: "route.resolve",
    label: "Resolve route",
    description:
      "Resolve route facts between two already resolved proposal items without changing the path.",
    input: routeResolveToolSchema,
    requestType: "route.resolve",
    sequential: true,
  },
  {
    canonicalName: "path.append_event",
    label: "Append path event",
    description:
      "Append one strict typed event to the run-scoped ChangeLog. Workspace is not modified.",
    input: pathAppendEventToolSchema,
    requestType: "path.append_event",
    sequential: true,
  },
  {
    canonicalName: "path.replace_event",
    label: "Replace path event",
    description:
      "Append one complete semantic replacement to the ChangeLog. No partial patch is accepted.",
    input: pathReplaceEventToolSchema,
    requestType: "path.replace_event",
    sequential: true,
  },
  {
    canonicalName: "path.remove_event",
    label: "Remove path event",
    description:
      "Append one semantic removal to the ChangeLog. Workspace is not modified.",
    input: pathRemoveEventToolSchema,
    requestType: "path.remove_event",
    sequential: true,
  },
  {
    canonicalName: "path.validate",
    label: "Validate path",
    description:
      "Fold the immutable baseline plus append-only ChangeLog and validate the complete candidate path.",
    input: pathValidateToolSchema,
    requestType: "path.validate",
    sequential: true,
  },
  {
    canonicalName: "path.commit",
    label: "Commit path",
    description:
      "CAS commit the last validated ChangeLog fold as one Workspace revision, then discard the log.",
    input: pathCommitToolSchema,
    requestType: "path.commit",
    sequential: true,
  },
]

function webSearchTool(options: NonNullable<PiCoreToolOptions["webSearch"]>) {
  let remaining = options.maxSearches
  const client = new Anthropic({
    apiKey: options.apiKey,
    baseURL: "https://api.deepseek.com/anthropic",
  })
  return {
    name: "web_search",
    label: "Web search",
    description:
      "Search the current web for timely information and return source links.",
    parameters: Type.Object({ query: Type.String({ minLength: 1 }) }),
    executionMode: "sequential" as const,
    async execute(_toolCallId: string, params: unknown, signal?: AbortSignal) {
      const parsed = z
        .object({ query: z.string().trim().min(1) })
        .strict()
        .safeParse(params)
      if (!parsed.success) {
        return result({
          status: "retryable_error",
          code: "INVALID_ARGUMENTS",
          message: z.prettifyError(parsed.error),
        })
      }
      const { query } = parsed.data
      if (remaining <= 0) {
        return result({
          status: "terminal_error",
          code: "WEB_SEARCH_LIMIT_REACHED",
          message: "This Agent run has used all available Web searches",
        })
      }
      remaining -= 1
      try {
        const message = await client.messages
          .stream(
            {
              model: options.model,
              max_tokens: 4096,
              messages: [{ role: "user", content: query }],
              tools: [{ type: "web_search_20260209", name: "web_search" }],
              tool_choice: { type: "any" },
            },
            { signal }
          )
          .finalMessage()
        const sources = message.content.flatMap((block) =>
          block.type === "web_search_tool_result" &&
          Array.isArray(block.content)
            ? block.content.map((source) => ({
                title: source.title,
                url: source.url,
              }))
            : []
        )
        return result({
          status: "ok",
          data: {
            answer: message.content
              .filter((block) => block.type === "text")
              .map((block) => block.text)
              .join("\n"),
            sources,
            usage: message.usage,
          },
        })
      } catch (error) {
        if (signal?.aborted) throw error
        return result({
          status: "retryable_error",
          code: "WEB_SEARCH_FAILED",
          message: error instanceof Error ? error.message : "Web search failed",
        })
      }
    },
  }
}

export function createPiCoreTools(options: PiCoreToolOptions): AgentTool[] {
  const tools: AgentTool[] = definitions.map((definition) => ({
    name: providerToolName(definition.canonicalName),
    label: definition.label,
    description: definition.description,
    parameters: parameters(definition.input),
    ...(definition.sequential ? { executionMode: "sequential" as const } : {}),
    async execute(toolCallId, params, signal) {
      const parsed = definition.input.safeParse(params)
      if (!parsed.success) {
        return result({
          status: "retryable_error",
          code: "INVALID_ARGUMENTS",
          message: z.prettifyError(parsed.error),
        })
      }
      return result(
        await options.execute(
          {
            type: definition.requestType,
            ...(parsed.data as object),
          } as AgentToolRequest,
          toolCallId,
          signal
        )
      )
    },
  }))
  if (options.webSearch) tools.push(webSearchTool(options.webSearch))
  return tools
}

export function canonicalPiCoreToolName(providerName: string) {
  return definitions.find(
    (definition) => providerToolName(definition.canonicalName) === providerName
  )?.canonicalName
}

export function piCoreToolCatalogVersion() {
  return createHash("sha256")
    .update(
      JSON.stringify(
        definitions.map((definition) => ({
          name: definition.canonicalName,
          schema: z.toJSONSchema(definition.input),
          sequential: Boolean(definition.sequential),
        }))
      )
    )
    .digest("hex")
}
