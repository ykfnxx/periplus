import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { ZodError, type ZodObject, type ZodRawShape } from "zod"
import { mcpErrorResult, mcpJsonResult } from "../errors"
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
} from "../schemas/draft"
import {
  journeyCurrentValidationInputSchema,
  journeyProjectionInputSchema,
  workspaceContextInputSchema,
} from "../schemas/workspace"
import { callWorkspaceBackend } from "../workspace-client"

type ToolInput = Record<string, unknown>

function result(value: ReturnType<typeof mcpJsonResult>): CallToolResult {
  return value as CallToolResult
}

function errorResult(error: unknown): CallToolResult {
  if (error instanceof ZodError) {
    return result(
      mcpErrorResult(
        "invalid_input",
        error.issues.map((issue) => issue.message).join("; ")
      )
    )
  }
  return result(
    mcpErrorResult(
      "internal_error",
      error instanceof Error ? error.message : "Unexpected Workspace tool error"
    )
  )
}

function registerTool<TSchema extends ZodObject<ZodRawShape>>(
  server: McpServer,
  name: string,
  title: string,
  description: string,
  schema: TSchema,
  type: string
) {
  server.registerTool(
    name,
    {
      title,
      description,
      inputSchema: schema.shape,
    },
    async (input: ToolInput) => {
      try {
        return callWorkspaceBackend({ type, ...schema.parse(input) })
      } catch (error) {
        return errorResult(error)
      }
    }
  )
}

export function registerWorkspaceTools(server: McpServer): void {
  registerTool(
    server,
    "periplus.workspace.get_context",
    "Get planning context",
    "Read only the current Workspace revision, Journey identity, status, and City cards needed to plan.",
    workspaceContextInputSchema,
    "workspace.get_context"
  )
  registerTool(
    server,
    "periplus.journey.project",
    "Read ordered card chain",
    "Read the authoritative PLANNER order for the Root scope or one City scope. Never infer order from a raw graph.",
    journeyProjectionInputSchema,
    "journey.project"
  )
  registerTool(
    server,
    "periplus.journey.validate_current",
    "Validate committed journey",
    "Validate the committed Journey at an exact Workspace revision after draft.commit.",
    journeyCurrentValidationInputSchema,
    "journey.validate_current"
  )
  registerTool(
    server,
    "periplus.draft.open",
    "Open Agent draft",
    "Open the single run-scoped draft and lock its base Workspace revision. The draft is not persisted.",
    draftOpenInputSchema,
    "draft.open"
  )
  registerTool(
    server,
    "periplus.draft.get",
    "Get Agent draft",
    "Recover the current run-scoped draft summary without exposing canonical command internals.",
    draftGetInputSchema,
    "draft.get"
  )
  registerTool(
    server,
    "periplus.draft.add_city_card",
    "Add City card",
    "Add one CITY card to the Root chain.",
    draftAddCityCardInputSchema,
    "draft.add_city_card"
  )
  registerTool(
    server,
    "periplus.draft.add_place_card",
    "Add place card",
    "Add one VISIT, MEAL, or ACTIVITY card using a placeResolutionId; provider fields are filled by the backend.",
    draftAddPlaceCardInputSchema,
    "draft.add_place_card"
  )
  registerTool(
    server,
    "periplus.draft.add_hotel_stay_card",
    "Add recommended hotel stay",
    "Add one STAY card using the current run's first hotelSelectionId.",
    draftAddHotelStayCardInputSchema,
    "draft.add_hotel_stay_card"
  )
  registerTool(
    server,
    "periplus.draft.add_place_stay_card",
    "Add named hotel stay",
    "Add one explicitly named STAY card using a placeResolutionId resolved with hotel intent.",
    draftAddPlaceStayCardInputSchema,
    "draft.add_place_stay_card"
  )
  registerTool(
    server,
    "periplus.draft.add_transit_card",
    "Add Transit card",
    "Insert one TRANSIT card between two existing adjacent cards in the same scope. This does not fetch a route.",
    draftAddTransitCardInputSchema,
    "draft.add_transit_card"
  )
  registerTool(
    server,
    "periplus.draft.update_city_card",
    "Update City card",
    "Update one CITY card's display fields or IANA time zone.",
    draftUpdateCityCardInputSchema,
    "draft.update_city_card"
  )
  registerTool(
    server,
    "periplus.draft.update_schedule",
    "Update card schedule",
    "Update only planned start/end times on one executable card.",
    draftUpdateScheduleInputSchema,
    "draft.update_schedule"
  )
  registerTool(
    server,
    "periplus.draft.change_place",
    "Change card place",
    "Replace a location card's place binding using a run-scoped placeResolutionId.",
    draftChangePlaceInputSchema,
    "draft.change_place"
  )
  registerTool(
    server,
    "periplus.draft.update_transit_card",
    "Update Transit card",
    "Update only route-request and schedule fields on one TRANSIT card; route data becomes stale when needed.",
    draftUpdateTransitCardInputSchema,
    "draft.update_transit_card"
  )
  registerTool(
    server,
    "periplus.draft.move_card",
    "Move card",
    "Move one card in a linear scope while the backend maintains MAIN links.",
    draftMoveCardInputSchema,
    "draft.move_card"
  )
  registerTool(
    server,
    "periplus.draft.remove_card",
    "Remove card",
    "Remove one card; a non-empty CITY requires an explicit children policy.",
    draftRemoveCardInputSchema,
    "draft.remove_card"
  )
  registerTool(
    server,
    "periplus.draft.connect_cards",
    "Repair missing card connection",
    "Connect two cards only when the latest validator issue explicitly allows this repair.",
    draftConnectCardsInputSchema,
    "draft.connect_cards"
  )
  registerTool(
    server,
    "periplus.draft.disconnect_cards",
    "Repair invalid card connection",
    "Disconnect two cards only when the latest validator issue explicitly allows this repair.",
    draftDisconnectCardsInputSchema,
    "draft.disconnect_cards"
  )
  registerTool(
    server,
    "periplus.draft.validate",
    "Validate Agent draft",
    "Purely validate the current draft. The first validation is free; at most five non-Transit repair validations are allowed.",
    draftValidateInputSchema,
    "draft.validate"
  )
  registerTool(
    server,
    "periplus.draft.prepare_transit",
    "Prepare Transit route",
    "Fetch and select a route for one validator-approved TRANSIT card, then revalidate without consuming a repair attempt.",
    draftPrepareTransitInputSchema,
    "draft.prepare_transit"
  )
  registerTool(
    server,
    "periplus.draft.commit",
    "Commit validated Agent draft",
    "Atomically commit the VALID run-scoped draft as one Workspace revision after rechecking its base revision.",
    draftCommitInputSchema,
    "draft.commit"
  )
}
