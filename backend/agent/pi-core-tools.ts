import Anthropic from "@anthropic-ai/sdk"
import { createHash } from "node:crypto"
import type { AgentTool } from "@earendil-works/pi-agent-core"
import { Type, type TSchema } from "typebox"
import { z } from "zod"
import {
  cardMoveToolSchema,
  cardRemoveToolSchema,
  cardUpdateToolSchema,
  cityAddToolSchema,
  draftCommitToolSchema,
  draftOpenToolSchema,
  draftPrepareTransitToolSchema,
  draftProjectToolSchema,
  draftValidateToolSchema,
  hotelSearchToolSchema,
  placeEventAddToolSchema,
  placeResolveToolSchema,
  stayAddToolSchema,
  transitAddToolSchema,
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
    canonicalName: "periplus.draft.open",
    label: "Open Agent draft",
    description:
      "Open the run's single draft at the Harness-owned immutable baseline.",
    input: draftOpenToolSchema,
    requestType: "draft.open",
    sequential: true,
  },
  {
    canonicalName: "periplus.city.add",
    label: "Add City card",
    description:
      "Add a CITY in Root order. The backend creates IDs, timezone and Links.",
    input: cityAddToolSchema,
    requestType: "city.add",
    sequential: true,
  },
  {
    canonicalName: "periplus.place.resolve",
    label: "Resolve writable place",
    description:
      "Resolve a name inside an active City draft into a run-scoped evidence handle.",
    input: placeResolveToolSchema,
    requestType: "place.resolve",
  },
  {
    canonicalName: "periplus.placeEvent.add",
    label: "Add place event",
    description:
      "Add VISIT, MEAL, or ACTIVITY from resolved evidence at a concrete time.",
    input: placeEventAddToolSchema,
    requestType: "placeEvent.add",
    sequential: true,
  },
  {
    canonicalName: "periplus.hotel.search",
    label: "Search route-near hotels",
    description:
      "Derive dates, nights, occupancy and route anchors from one City, then return one selection handle.",
    input: hotelSearchToolSchema,
    requestType: "hotel.search",
  },
  {
    canonicalName: "periplus.stay.add",
    label: "Add hotel stay",
    description:
      "Add a STAY from a one-time hotel selection; dates are backend-derived.",
    input: stayAddToolSchema,
    requestType: "stay.add",
    sequential: true,
  },
  {
    canonicalName: "periplus.transit.add",
    label: "Add Transit card",
    description:
      "Insert one TRANSIT between adjacent cards; the backend derives request mode and route data.",
    input: transitAddToolSchema,
    requestType: "transit.add",
    sequential: true,
  },
  {
    canonicalName: "periplus.card.update",
    label: "Update card",
    description:
      "Update only the business fields allowed by the card's strict type-specific changes schema.",
    input: cardUpdateToolSchema,
    requestType: "card.update",
    sequential: true,
  },
  {
    canonicalName: "periplus.card.move",
    label: "Move card",
    description:
      "Move a card after another card in the same scope, or to scope start with null.",
    input: cardMoveToolSchema,
    requestType: "card.move",
    sequential: true,
  },
  {
    canonicalName: "periplus.card.remove",
    label: "Remove card",
    description:
      "Remove one card; optional recursive City removal is explicit.",
    input: cardRemoveToolSchema,
    requestType: "card.remove",
    sequential: true,
  },
  {
    canonicalName: "periplus.draft.project",
    label: "Project current draft",
    description: "Read a compact ordered projection of the active draft.",
    input: draftProjectToolSchema,
    requestType: "draft.project",
  },
  {
    canonicalName: "periplus.draft.validate",
    label: "Validate Agent draft",
    description:
      "Purely validate the draft; at most five non-Transit repair validations are allowed.",
    input: draftValidateToolSchema,
    requestType: "draft.validate",
    sequential: true,
  },
  {
    canonicalName: "periplus.draft.prepare_transit",
    label: "Prepare Transit route",
    description:
      "Fetch and select one validator-approved Transit route without using a repair attempt.",
    input: draftPrepareTransitToolSchema,
    requestType: "draft.prepare_transit",
    sequential: true,
  },
  {
    canonicalName: "periplus.draft.commit",
    label: "Commit validated Agent draft",
    description:
      "Atomically commit one VALID draft as a single Workspace revision.",
    input: draftCommitToolSchema,
    requestType: "draft.commit",
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
