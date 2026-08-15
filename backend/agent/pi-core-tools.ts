import Anthropic from "@anthropic-ai/sdk"
import { createHash } from "node:crypto"
import type { AgentTool } from "@earendil-works/pi-agent-core"
import { Type, type TSchema } from "typebox"
import { z } from "zod"
import {
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
  const terminate =
    value !== null &&
    typeof value === "object" &&
    "status" in value &&
    value.status === "non_retryable_error"
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(providerToolResult(value), null, 2),
      },
    ],
    details: value,
    ...(terminate ? { terminate: true } : {}),
  }
}

function parameters(input: z.ZodType): TSchema {
  return Type.Unsafe(z.toJSONSchema(input))
}

const definitions: PeriplusToolDefinition[] = [
  {
    canonicalName: "place.resolve",
    label: "Resolve canonical place",
    description:
      "Resolve exactly one VISIT, MEAL, or ACTIVITY proposal item without changing the candidate path. Use one stable proposalItemKey for the later path event. cityQuery must contain only an administrative city name, while query must contain only one concrete place name; do not mix duration, exclusions, pace, or other itinerary constraints into either field. The backend first resolves the canonical city and then verifies the place inside that city. An ok result creates a run-scoped place fact only. For retryable_error, change only the rejected field or take allowedNextAction; never repeat identical arguments.",
    input: placeResolveToolSchema,
    requestType: "place.resolve",
    sequential: true,
  },
  {
    canonicalName: "hotel.search",
    label: "Search hotel",
    description:
      "Search and bind hotel facts for exactly one concrete overnight STAY proposal item without changing the candidate path. Use one stable proposalItemKey for the later STAY event. cityQuery must contain only an administrative city name. Provide the exact check-in date, nights, adults, and optional preference derived from the user's request; do not create a STAY for a same-day city segment. The backend resolves the city before searching. An ok result creates a run-scoped hotel fact only. Follow returned warnings and allowedNextAction; do not repeat identical arguments.",
    input: hotelSearchToolSchema,
    requestType: "hotel.search",
    sequential: true,
  },
  {
    canonicalName: "route.resolve",
    label: "Resolve route",
    description:
      "Resolve route facts for one planned TRANSIT between two already resolved non-transit proposal items without changing the candidate path. fromItemKey and toItemKey must identify the endpoints that will be adjacent in the ordered journey. Their cities, coordinates, and provider identities are derived from accepted facts or the committed snapshot; do not supply city names or coordinates. Use one stable proposalItemKey for the later TRANSIT event.",
    input: routeResolveToolSchema,
    requestType: "route.resolve",
    sequential: true,
  },
  {
    canonicalName: "path.append_event",
    label: "Append path event",
    description:
      "Append one complete typed event to the run-scoped planning state; this does not modify the committed Workspace. VISIT, MEAL, and ACTIVITY require an accepted place fact with the same proposalItemKey; STAY requires an accepted hotel fact; TRANSIT requires an accepted route fact. afterItemKey declares the global event order and may be null only for an empty path. Read stateDelta, planningState, and allowedNextAction before continuing.",
    input: pathAppendEventToolSchema,
    requestType: "path.append_event",
    sequential: true,
  },
  {
    canonicalName: "path.replace_event",
    label: "Replace path event",
    description:
      "Replace one existing proposal item with one complete typed event in the run-scoped planning state; this does not modify the committed Workspace. Partial patches are not accepted. The replacement must have every required accepted fact for its event kind. Read stateDelta, planningState, and allowedNextAction before continuing.",
    input: pathReplaceEventToolSchema,
    requestType: "path.replace_event",
    sequential: true,
  },
  {
    canonicalName: "path.remove_event",
    label: "Remove path event",
    description:
      "Remove one proposal item from the run-scoped planning state; this does not modify the committed Workspace. Use the proposal item key visible in the committed snapshot or current planningState. After removal, inspect stateDelta and planningState for invalidated adjacency or route work before validating.",
    input: pathRemoveEventToolSchema,
    requestType: "path.remove_event",
    sequential: true,
  },
  {
    canonicalName: "path.validate",
    label: "Validate path",
    description:
      "Validate the complete candidate journey produced from the immutable committed snapshot plus the current run-scoped planning changes. Call only after the intended ordered path and all required place, hotel, and route facts are present. The result returns the complete current planningState, structured issues, the remaining semantic revision budget, and the only allowed next action. A valid result permits commit; an invalid result permits only the stated repair.",
    input: pathValidateToolSchema,
    requestType: "path.validate",
    sequential: true,
  },
  {
    canonicalName: "path.commit",
    label: "Commit path",
    description:
      "Atomically commit the most recent still-valid candidate path as one new Workspace revision. Call only immediately after path.validate returns valid with COMMIT as allowedNextAction and do not call another planning tool afterward. This is the only tool that changes the committed journey; an ok result is the mechanical end of the Agent run.",
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
          received: params && typeof params === "object" ? params : {},
          fieldErrors: parsed.error.issues.map((issue) => ({
            field: issue.path.join(".") || "$",
            reason: issue.message,
          })),
          allowedNextAction: "RETRY_THIS_TOOL",
        })
      }
      const { query } = parsed.data
      if (remaining <= 0) {
        return result({
          status: "non_retryable_error",
          code: "WEB_SEARCH_LIMIT_REACHED",
          message: "This Agent run has used all available Web searches",
          received: { query },
          allowedNextAction: "STOP",
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
          allowedNextAction: "CONTINUE",
        })
      } catch (error) {
        if (signal?.aborted) throw error
        return result({
          status: "retryable_error",
          code: "WEB_SEARCH_FAILED",
          message: error instanceof Error ? error.message : "Web search failed",
          received: { query },
          allowedNextAction: "RETRY_THIS_TOOL",
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
          received: params && typeof params === "object" ? params : {},
          fieldErrors: parsed.error.issues.map((issue) => ({
            field: issue.path.join(".") || "$",
            reason: issue.message,
          })),
          allowedNextAction: "RETRY_THIS_TOOL",
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
          description: definition.description,
          schema: z.toJSONSchema(definition.input),
          sequential: Boolean(definition.sequential),
        }))
      )
    )
    .digest("hex")
}
