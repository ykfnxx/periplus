import Anthropic from "@anthropic-ai/sdk"
import type { AgentTool } from "@earendil-works/pi-agent-core"
import { Type, type TSchema } from "typebox"
import { z } from "zod"
import {
  draftAddCityCardInputSchema,
  draftAddHotelStayCardInputSchema,
  draftAddPlaceCardInputSchema,
  draftAddPlaceStayCardInputSchema,
  draftAddTransitCardInputSchema,
  draftChangePlaceInputSchema,
  draftCommitInputSchema,
  draftConnectCardsInputSchema,
  draftDisconnectCardsInputSchema,
  draftGetInputSchema,
  draftMoveCardInputSchema,
  draftOpenInputSchema,
  draftPrepareTransitInputSchema,
  draftRemoveCardInputSchema,
  draftUpdateCityCardInputSchema,
  draftUpdateScheduleInputSchema,
  draftUpdateTransitCardInputSchema,
  draftValidateInputSchema,
} from "@/backend/mcp/schemas/draft"
import {
  placeEnrichInputSchema,
  placeFallbackInputSchema,
  placeResolveInputSchema,
  placeSearchInputSchema,
} from "@/backend/mcp/schemas/place"
import { hotelSearchInputSchema } from "@/backend/mcp/schemas/hotel"
import {
  journeyCurrentValidationInputSchema,
  journeyProjectionInputSchema,
  workspaceContextInputSchema,
} from "@/backend/mcp/schemas/workspace"
import type { AgentToolRequest } from "./gateway"

type ToolExecutor = (
  request: AgentToolRequest,
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
    canonicalName: "periplus.workspace.get_context",
    label: "Get planning context",
    description:
      "Read the current Workspace revision and City cards needed to plan.",
    input: workspaceContextInputSchema,
    requestType: "workspace.get_context",
  },
  {
    canonicalName: "periplus.journey.project",
    label: "Read ordered card chain",
    description:
      "Read the authoritative PLANNER order for Root or one City scope.",
    input: journeyProjectionInputSchema,
    requestType: "journey.project",
  },
  {
    canonicalName: "periplus.journey.validate_current",
    label: "Validate committed journey",
    description:
      "Validate the committed Journey at the exact revision returned by draft commit.",
    input: journeyCurrentValidationInputSchema,
    requestType: "journey.validate_current",
  },
  {
    canonicalName: "periplus.draft.open",
    label: "Open Agent draft",
    description: "Open the single non-persistent draft for this Agent run.",
    input: draftOpenInputSchema,
    requestType: "draft.open",
    sequential: true,
  },
  {
    canonicalName: "periplus.draft.get",
    label: "Get Agent draft",
    description: "Recover the current run-scoped draft summary.",
    input: draftGetInputSchema,
    requestType: "draft.get",
  },
  {
    canonicalName: "periplus.draft.add_city_card",
    label: "Add City card",
    description: "Add one CITY card to the Root chain.",
    input: draftAddCityCardInputSchema,
    requestType: "draft.add_city_card",
    sequential: true,
  },
  {
    canonicalName: "periplus.draft.add_place_card",
    label: "Add place card",
    description:
      "Add one VISIT, MEAL, or ACTIVITY card from a resolved place handle.",
    input: draftAddPlaceCardInputSchema,
    requestType: "draft.add_place_card",
    sequential: true,
  },
  {
    canonicalName: "periplus.draft.add_hotel_stay_card",
    label: "Add recommended hotel stay",
    description:
      "Add one STAY card from the first hotel-search selection handle.",
    input: draftAddHotelStayCardInputSchema,
    requestType: "draft.add_hotel_stay_card",
    sequential: true,
  },
  {
    canonicalName: "periplus.draft.add_place_stay_card",
    label: "Add named hotel stay",
    description: "Add one STAY card from a resolved place handle.",
    input: draftAddPlaceStayCardInputSchema,
    requestType: "draft.add_place_stay_card",
    sequential: true,
  },
  {
    canonicalName: "periplus.draft.add_transit_card",
    label: "Add Transit card",
    description:
      "Insert one TRANSIT card between adjacent cards without fetching a route.",
    input: draftAddTransitCardInputSchema,
    requestType: "draft.add_transit_card",
    sequential: true,
  },
  {
    canonicalName: "periplus.draft.update_city_card",
    label: "Update City card",
    description: "Update one CITY card's display fields or time zone.",
    input: draftUpdateCityCardInputSchema,
    requestType: "draft.update_city_card",
    sequential: true,
  },
  {
    canonicalName: "periplus.draft.update_schedule",
    label: "Update card schedule",
    description: "Update planned start or end time on one executable card.",
    input: draftUpdateScheduleInputSchema,
    requestType: "draft.update_schedule",
    sequential: true,
  },
  {
    canonicalName: "periplus.draft.change_place",
    label: "Change card place",
    description:
      "Replace a location card's place binding from a resolved handle.",
    input: draftChangePlaceInputSchema,
    requestType: "draft.change_place",
    sequential: true,
  },
  {
    canonicalName: "periplus.draft.update_transit_card",
    label: "Update Transit card",
    description:
      "Update only schedule and route-request fields on one TRANSIT card.",
    input: draftUpdateTransitCardInputSchema,
    requestType: "draft.update_transit_card",
    sequential: true,
  },
  {
    canonicalName: "periplus.draft.move_card",
    label: "Move card",
    description: "Move one card while the backend maintains linear MAIN links.",
    input: draftMoveCardInputSchema,
    requestType: "draft.move_card",
    sequential: true,
  },
  {
    canonicalName: "periplus.draft.remove_card",
    label: "Remove card",
    description:
      "Remove one card; non-empty CITY cards require a child policy.",
    input: draftRemoveCardInputSchema,
    requestType: "draft.remove_card",
    sequential: true,
  },
  {
    canonicalName: "periplus.draft.connect_cards",
    label: "Repair missing card connection",
    description:
      "Connect cards only when the latest validator issue allows it.",
    input: draftConnectCardsInputSchema,
    requestType: "draft.connect_cards",
    sequential: true,
  },
  {
    canonicalName: "periplus.draft.disconnect_cards",
    label: "Repair invalid card connection",
    description:
      "Disconnect cards only when the latest validator issue allows it.",
    input: draftDisconnectCardsInputSchema,
    requestType: "draft.disconnect_cards",
    sequential: true,
  },
  {
    canonicalName: "periplus.draft.validate",
    label: "Validate Agent draft",
    description:
      "Purely validate the draft; at most five non-Transit repair validations are allowed.",
    input: draftValidateInputSchema,
    requestType: "draft.validate",
    sequential: true,
  },
  {
    canonicalName: "periplus.draft.prepare_transit",
    label: "Prepare Transit route",
    description:
      "Fetch and select one validator-approved Transit route without using a repair attempt.",
    input: draftPrepareTransitInputSchema,
    requestType: "draft.prepare_transit",
    sequential: true,
  },
  {
    canonicalName: "periplus.draft.commit",
    label: "Commit validated Agent draft",
    description:
      "Atomically commit one VALID draft as a single Workspace revision.",
    input: draftCommitInputSchema,
    requestType: "draft.commit",
    sequential: true,
  },
  {
    canonicalName: "periplus.place.search",
    label: "Search places",
    description:
      "Discover place names; a selected result must still be resolved.",
    input: placeSearchInputSchema,
    requestType: "place.search",
  },
  {
    canonicalName: "periplus.place.resolve",
    label: "Resolve place",
    description:
      "Resolve one place phrase into a run-scoped evidence handle or ambiguity.",
    input: placeResolveInputSchema,
    requestType: "place.resolve",
  },
  {
    canonicalName: "periplus.place.fallback",
    label: "Register fallback place",
    description:
      "Register a WebSearch-backed unverified place after place.resolve permits fallback.",
    input: placeFallbackInputSchema,
    requestType: "place.fallback",
  },
  {
    canonicalName: "periplus.place.enrich",
    label: "Enrich resolved place",
    description:
      "Optionally verify available images for a resolved place handle.",
    input: placeEnrichInputSchema,
    requestType: "place.enrich",
  },
  {
    canonicalName: "periplus.hotel.search",
    label: "Search hotel recommendations",
    description:
      "Search hotel cards and return the first valid run-scoped selection handle.",
    input: hotelSearchInputSchema,
    requestType: "hotel.search",
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
      const { query } = z.object({ query: z.string().min(1) }).parse(params)
      if (remaining <= 0) throw new Error("Web search limit reached")
      remaining -= 1
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
        block.type === "web_search_tool_result" && Array.isArray(block.content)
          ? block.content.map((source) => ({
              title: source.title,
              url: source.url,
            }))
          : []
      )
      return result({
        answer: message.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("\n"),
        sources,
        usage: message.usage,
      })
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
    async execute(_toolCallId, params, signal) {
      const input = definition.input.parse(params)
      return result(
        await options.execute(
          {
            type: definition.requestType,
            ...(input as object),
          } as AgentToolRequest,
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
