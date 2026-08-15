import Anthropic from "@anthropic-ai/sdk"
import { createHash } from "node:crypto"
import type { AgentTool } from "@earendil-works/pi-agent-core"
import { Type, type TSchema } from "typebox"
import { z } from "zod"
import {
  eventAddToolSchema,
  eventMoveToolSchema,
  eventRemoveToolSchema,
  eventUpdateToolSchema,
  hotelSearchToolSchema,
  pathCommitToolSchema,
  pathReadToolSchema,
  pathValidateToolSchema,
  placeSearchToolSchema,
  routeSearchToolSchema,
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
    canonicalName: "place.search",
    label: "Search place candidates",
    description:
      "Search ranked VISIT, MEAL, or ACTIVITY candidates without changing the run-local path. city is a loose provider search/ranking keyword and query is one concrete place intent; neither must be a canonical administrative value. Choose one returned selectionId and pass it to event.add or event.update. Never copy provider identities, coordinates, canonical titles, or exact timestamps into a mutation.",
    input: placeSearchToolSchema,
    requestType: "place.search",
    sequential: true,
  },
  {
    canonicalName: "hotel.search",
    label: "Search hotel candidates",
    description:
      "Search hotel candidates for one current stayRequirementId without changing the path. The backend derives city, dates, nights, occupancy, and anchors from that requirement; supply only an optional user preference. Choose a returned selectionId and use event.add with source HOTEL and the same requirement. A stale requirement must be refreshed from the latest materialized path.",
    input: hotelSearchToolSchema,
    requestType: "hotel.search",
    sequential: true,
  },
  {
    canonicalName: "route.search",
    label: "Search route candidates",
    description:
      "Search route candidates for one current routeRequirementId without changing the path. The backend owns both endpoints, coordinates, departure time, and adjacency. Supply only mode and route preferences. Choose a returned selectionId and use event.add with source ROUTE and the same requirement. Do not invent endpoints, duration, coordinates, or insertion position.",
    input: routeSearchToolSchema,
    requestType: "route.search",
    sequential: true,
  },
  {
    canonicalName: "path.read",
    label: "Read planning path",
    description:
      "Read the authoritative run-local materialized event chain, current route/stay requirements, conflicts, warnings, and remaining validation budget. This does not change planning state. Mutation results already include the same projection, so call this when you need to refresh after a stale requirement or to inspect the initial state.",
    input: pathReadToolSchema,
    requestType: "path.read",
    sequential: true,
  },
  {
    canonicalName: "event.add",
    label: "Add selected event",
    description:
      "Add one event to the run-local path from a valid selection. PLACE adds require a place selection, event type, order anchor, and optional semantic schedule intent; dayIndex is 1-based from the default trip start date. HOTEL and ROUTE adds require selections bound to the current requirement; the backend owns their position and exact times. The backend materializes canonical facts, IDs, links, timestamps, and returns the full path and new requirements.",
    input: eventAddToolSchema,
    requestType: "event.add",
    sequential: true,
  },
  {
    canonicalName: "event.update",
    label: "Update event semantics",
    description:
      "Apply a semantic patch to one existing non-derived event. You may replace its place selection, event type, schedule intent, or notes; do not resend a complete card. The backend keeps canonical facts and recomputes exact times and affected requirements. Inspect the returned materialized path before the next decision.",
    input: eventUpdateToolSchema,
    requestType: "event.update",
    sequential: true,
  },
  {
    canonicalName: "event.move",
    label: "Move path event",
    description:
      "Move one existing non-derived event after another item, or to the beginning with null, and optionally provide a new semantic schedule intent. Ordering is separate from event.update. The backend invalidates stale adjacency selections, rematerializes exact times, and returns the authoritative path.",
    input: eventMoveToolSchema,
    requestType: "event.move",
    sequential: true,
  },
  {
    canonicalName: "event.remove",
    label: "Remove path event",
    description:
      "Remove one event from the run-local path. The backend also removes derived events made stale by the new adjacency and returns fresh route/stay requirements. Use itemKey from the latest materialized path and provide a concise business reason.",
    input: eventRemoveToolSchema,
    requestType: "event.remove",
    sequential: true,
  },
  {
    canonicalName: "path.validate",
    label: "Validate path",
    description:
      "Run the deterministic invariant safety net only after the latest materialized path reports no route/stay requirements or conflicts. Normal candidate-driven planning should validate once. A valid result permits commit; pending requirements must be completed with search plus event.add rather than repaired by hand-written cards.",
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
