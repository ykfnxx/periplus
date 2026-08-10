import { readFileSync } from "node:fs"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { Type } from "typebox"
import type { TraceCarrier } from "../../observability"

interface PiRunConfig {
  backendUrl?: string
  capabilityToken?: string
  traceCarrier?: TraceCarrier
  model: string
  toolNames: string[]
  webSearchEnabled: boolean
  maxWebSearches: number
}

interface AgentToolResponse {
  result?: unknown
  error?: { code: string; message: string }
}

function runConfig(): PiRunConfig {
  const configPath = process.env.PERIPLUS_PI_RUN_CONFIG
  if (!configPath) throw new Error("PERIPLUS_PI_RUN_CONFIG is required")
  return JSON.parse(readFileSync(configPath, "utf8")) as PiRunConfig
}

async function callAgentTool(
  config: PiRunConfig,
  request: unknown,
  signal?: AbortSignal
) {
  if (!config.backendUrl || !config.capabilityToken) {
    throw new Error("Periplus tool capability is unavailable")
  }
  const response = await fetch(`${config.backendUrl}/internal/agent-tool`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.traceCarrier?.traceparent
        ? { traceparent: config.traceCarrier.traceparent }
        : {}),
      ...(config.traceCarrier?.tracestate
        ? { tracestate: config.traceCarrier.tracestate }
        : {}),
    },
    body: JSON.stringify({ capabilityToken: config.capabilityToken, request }),
    signal,
  })
  const body = (await response.json()) as AgentToolResponse
  if (!response.ok || body.error) {
    throw new Error(body.error?.message ?? "Periplus tool failed")
  }
  return body.result
}

function textResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    details: {},
  }
}

export function responseSources(response: Record<string, unknown>) {
  const sources: Array<{ title?: string; url: string }> = []
  const output = Array.isArray(response.output) ? response.output : []
  for (const item of output) {
    if (!item || typeof item !== "object") continue
    const content = Array.isArray((item as { content?: unknown }).content)
      ? ((item as { content: unknown[] }).content ?? [])
      : []
    for (const part of content) {
      if (!part || typeof part !== "object") continue
      const annotations = Array.isArray(
        (part as { annotations?: unknown }).annotations
      )
        ? ((part as { annotations: unknown[] }).annotations ?? [])
        : []
      for (const annotation of annotations) {
        if (!annotation || typeof annotation !== "object") continue
        const candidate = annotation as { title?: unknown; url?: unknown }
        if (typeof candidate.url === "string") {
          sources.push({
            url: candidate.url,
            ...(typeof candidate.title === "string"
              ? { title: candidate.title }
              : {}),
          })
        }
      }
    }
  }
  return sources
}

export function responseText(response: Record<string, unknown>) {
  if (typeof response.output_text === "string" && response.output_text) {
    return response.output_text
  }
  const output = Array.isArray(response.output) ? response.output : []
  return output
    .filter(
      (item): item is { type: string; content: unknown[] } =>
        Boolean(item) &&
        typeof item === "object" &&
        (item as { type?: unknown }).type === "message" &&
        Array.isArray((item as { content?: unknown }).content)
    )
    .flatMap((item) => item.content)
    .filter(
      (part): part is { type: string; text: string } =>
        Boolean(part) &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "output_text" &&
        typeof (part as { text?: unknown }).text === "string"
    )
    .map((part) => part.text)
    .join("\n")
}

const id = Type.String({ minLength: 1 })
const dateTime = Type.String({ format: "date-time" })
const date = Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })
const coordinateSystem = Type.Union([
  Type.Literal("WGS84"),
  Type.Literal("GCJ02"),
  Type.Literal("BD09LL"),
])
const placeIntent = Type.Union([
  Type.Literal("sightseeing"),
  Type.Literal("walkable"),
  Type.Literal("museum"),
  Type.Literal("performance"),
  Type.Literal("family"),
  Type.Literal("food"),
  Type.Literal("hotel"),
])
const placeCategory = Type.Union([
  Type.Literal("SIGHT"),
  Type.Literal("PARK"),
  Type.Literal("MUSEUM"),
  Type.Literal("CULTURE"),
  Type.Literal("PERFORMANCE"),
  Type.Literal("SPORTS"),
  Type.Literal("ENTERTAINMENT"),
  Type.Literal("RESTAURANT"),
  Type.Literal("HOTEL"),
  Type.Literal("TRANSIT"),
  Type.Literal("OTHER"),
])
const transportMode = Type.Union([
  Type.Literal("FLIGHT"),
  Type.Literal("TRAIN"),
  Type.Literal("CAR"),
  Type.Literal("BUS"),
  Type.Literal("WALK"),
  Type.Literal("TAXI"),
  Type.Literal("SUBWAY"),
  Type.Literal("RENTAL"),
])
const transitRequestMode = Type.Union([
  Type.Literal("DRIVE"),
  Type.Literal("WALK"),
  Type.Literal("TRANSIT"),
])
const transitPreference = Type.Union([
  Type.Literal("RECOMMENDED"),
  Type.Literal("FASTEST"),
  Type.Literal("LOW_COST"),
  Type.Literal("FEWER_TRANSFERS"),
  Type.Literal("LESS_WALKING"),
])
const cardPosition = Type.Union([
  Type.Object(
    {
      placement: Type.Union([Type.Literal("START"), Type.Literal("END")]),
      scopeCityCardId: Type.Union([id, Type.Null()]),
    },
    { additionalProperties: false }
  ),
  Type.Object(
    {
      placement: Type.Union([Type.Literal("BEFORE"), Type.Literal("AFTER")]),
      anchorCardId: id,
    },
    { additionalProperties: false }
  ),
])
const mutationMeta = {
  draftId: id,
  operationId: id,
  issueId: Type.Optional(id),
}
const schedule = {
  plannedStartAt: dateTime,
  plannedEndAt: Type.Optional(dateTime),
}

export default function periplusRuntimeExtension(pi: ExtensionAPI) {
  const config = runConfig()
  const register = (
    name: string,
    label: string,
    description: string,
    parameters: ReturnType<typeof Type.Object>,
    requestType: string,
    sequential = false
  ) => {
    if (!config.toolNames.includes(name)) return
    pi.registerTool({
      name,
      label,
      description,
      parameters,
      executionMode: sequential ? "sequential" : "parallel",
      async execute(_toolCallId, params, signal) {
        return textResult(
          await callAgentTool(config, { type: requestType, ...params }, signal)
        )
      },
    })
  }

  register(
    "periplus_workspace_get_context",
    "Get planning context",
    "Read the current Workspace revision and City cards needed to plan.",
    Type.Object({}, { additionalProperties: false }),
    "workspace.get_context"
  )
  register(
    "periplus_journey_project",
    "Read ordered card chain",
    "Read the authoritative PLANNER order for Root or one City scope.",
    Type.Object(
      { scopeCityCardId: Type.Union([id, Type.Null()]) },
      { additionalProperties: false }
    ),
    "journey.project"
  )
  register(
    "periplus_journey_validate_current",
    "Validate committed journey",
    "Validate the committed Journey at the exact revision returned by draft commit.",
    Type.Object(
      { expectedWorkspaceRevision: Type.Integer({ minimum: 0 }) },
      { additionalProperties: false }
    ),
    "journey.validate_current"
  )
  register(
    "periplus_draft_open",
    "Open Agent draft",
    "Open the single non-persistent draft for this Agent run.",
    Type.Object(
      {
        expectedWorkspaceRevision: Type.Integer({ minimum: 0 }),
        idempotencyKey: id,
      },
      { additionalProperties: false }
    ),
    "draft.open",
    true
  )
  register(
    "periplus_draft_get",
    "Get Agent draft",
    "Recover the current run-scoped draft summary.",
    Type.Object({ draftId: id }, { additionalProperties: false }),
    "draft.get"
  )
  register(
    "periplus_draft_add_city_card",
    "Add City card",
    "Add one CITY card to the Root chain.",
    Type.Object(
      {
        ...mutationMeta,
        card: Type.Object(
          {
            cardId: id,
            title: id,
            description: Type.Optional(Type.String()),
            timeZone: id,
          },
          { additionalProperties: false }
        ),
        position: cardPosition,
      },
      { additionalProperties: false }
    ),
    "draft.add_city_card",
    true
  )
  register(
    "periplus_draft_add_place_card",
    "Add place card",
    "Add one VISIT, MEAL, or ACTIVITY card from a resolved place handle.",
    Type.Object(
      {
        ...mutationMeta,
        card: Type.Union([
          Type.Object(
            {
              cardId: id,
              type: Type.Literal("VISIT"),
              placeResolutionId: id,
              description: Type.Optional(Type.String()),
              ...schedule,
              plannedDurationMinutes: Type.Optional(
                Type.Integer({ minimum: 0 })
              ),
              includeAvailableCoverImage: Type.Optional(Type.Boolean()),
            },
            { additionalProperties: false }
          ),
          Type.Object(
            {
              cardId: id,
              type: Type.Literal("MEAL"),
              placeResolutionId: id,
              description: Type.Optional(Type.String()),
              ...schedule,
              plannedDurationMinutes: Type.Optional(
                Type.Integer({ minimum: 0 })
              ),
              cuisine: Type.Optional(Type.String()),
            },
            { additionalProperties: false }
          ),
          Type.Object(
            {
              cardId: id,
              type: Type.Literal("ACTIVITY"),
              placeResolutionId: id,
              description: Type.Optional(Type.String()),
              ...schedule,
              plannedDurationMinutes: Type.Optional(
                Type.Integer({ minimum: 0 })
              ),
              bookingReference: Type.Optional(Type.String()),
            },
            { additionalProperties: false }
          ),
        ]),
        cityCardId: id,
        position: cardPosition,
      },
      { additionalProperties: false }
    ),
    "draft.add_place_card",
    true
  )
  const stayCard = (handle: "hotelSelectionId" | "placeResolutionId") =>
    Type.Object(
      {
        cardId: id,
        [handle]: id,
        description: Type.Optional(Type.String()),
        ...schedule,
        checkInNote: Type.Optional(Type.String()),
      },
      { additionalProperties: false }
    )
  register(
    "periplus_draft_add_hotel_stay_card",
    "Add recommended hotel stay",
    "Add one STAY card from the first hotel-search selection handle.",
    Type.Object(
      {
        ...mutationMeta,
        card: stayCard("hotelSelectionId"),
        cityCardId: id,
        position: cardPosition,
      },
      { additionalProperties: false }
    ),
    "draft.add_hotel_stay_card",
    true
  )
  register(
    "periplus_draft_add_place_stay_card",
    "Add named hotel stay",
    "Add one explicitly named STAY card from a resolved place handle.",
    Type.Object(
      {
        ...mutationMeta,
        card: stayCard("placeResolutionId"),
        cityCardId: id,
        position: cardPosition,
      },
      { additionalProperties: false }
    ),
    "draft.add_place_stay_card",
    true
  )
  register(
    "periplus_draft_add_transit_card",
    "Add Transit card",
    "Insert one TRANSIT card between adjacent cards without fetching a route.",
    Type.Object(
      {
        ...mutationMeta,
        card: Type.Object(
          {
            cardId: id,
            fromCardId: id,
            toCardId: id,
            title: Type.Optional(id),
            description: Type.Optional(Type.String()),
            ...schedule,
            transportMode,
            requestMode: Type.Optional(transitRequestMode),
            preference: Type.Optional(transitPreference),
            plannedDepartAt: Type.Optional(dateTime),
            notes: Type.Optional(Type.String()),
          },
          { additionalProperties: false }
        ),
      },
      { additionalProperties: false }
    ),
    "draft.add_transit_card",
    true
  )
  register(
    "periplus_draft_update_city_card",
    "Update City card",
    "Update one CITY card's display fields or time zone.",
    Type.Object(
      {
        ...mutationMeta,
        cardId: id,
        patch: Type.Object(
          {
            title: Type.Optional(id),
            description: Type.Optional(
              Type.Union([Type.String(), Type.Null()])
            ),
            timeZone: Type.Optional(id),
          },
          { additionalProperties: false, minProperties: 1 }
        ),
      },
      { additionalProperties: false }
    ),
    "draft.update_city_card",
    true
  )
  register(
    "periplus_draft_update_schedule",
    "Update card schedule",
    "Update planned start or end time on one executable card.",
    Type.Object(
      {
        ...mutationMeta,
        cardId: id,
        patch: Type.Object(
          {
            plannedStartAt: Type.Optional(Type.Union([dateTime, Type.Null()])),
            plannedEndAt: Type.Optional(Type.Union([dateTime, Type.Null()])),
          },
          { additionalProperties: false, minProperties: 1 }
        ),
      },
      { additionalProperties: false }
    ),
    "draft.update_schedule",
    true
  )
  register(
    "periplus_draft_change_place",
    "Change card place",
    "Replace a location card's place binding from a resolved handle.",
    Type.Object(
      {
        ...mutationMeta,
        cardId: id,
        placeResolutionId: id,
        includeAvailableCoverImage: Type.Optional(Type.Boolean()),
      },
      { additionalProperties: false }
    ),
    "draft.change_place",
    true
  )
  register(
    "periplus_draft_update_transit_card",
    "Update Transit card",
    "Update only schedule and route-request fields on one TRANSIT card.",
    Type.Object(
      {
        ...mutationMeta,
        cardId: id,
        patch: Type.Object(
          {
            plannedStartAt: Type.Optional(dateTime),
            plannedEndAt: Type.Optional(Type.Union([dateTime, Type.Null()])),
            transportMode: Type.Optional(transportMode),
            requestMode: Type.Optional(transitRequestMode),
            preference: Type.Optional(transitPreference),
            plannedDepartAt: Type.Optional(Type.Union([dateTime, Type.Null()])),
            notes: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          },
          { additionalProperties: false, minProperties: 1 }
        ),
      },
      { additionalProperties: false }
    ),
    "draft.update_transit_card",
    true
  )
  register(
    "periplus_draft_move_card",
    "Move card",
    "Move one card while the backend maintains linear MAIN links.",
    Type.Object(
      { ...mutationMeta, cardId: id, position: cardPosition },
      { additionalProperties: false }
    ),
    "draft.move_card",
    true
  )
  register(
    "periplus_draft_remove_card",
    "Remove card",
    "Remove one card; non-empty CITY cards require a child policy.",
    Type.Object(
      {
        ...mutationMeta,
        cardId: id,
        cityChildrenPolicy: Type.Optional(
          Type.Union([Type.Literal("REMOVE_ALL"), Type.Literal("MOVE_TO_CITY")])
        ),
        destinationCityCardId: Type.Optional(id),
      },
      { additionalProperties: false }
    ),
    "draft.remove_card",
    true
  )
  const connection = Type.Object(
    { ...mutationMeta, fromCardId: id, toCardId: id },
    { additionalProperties: false }
  )
  register(
    "periplus_draft_connect_cards",
    "Repair missing card connection",
    "Connect cards only when the latest validator issue allows it.",
    connection,
    "draft.connect_cards",
    true
  )
  register(
    "periplus_draft_disconnect_cards",
    "Repair invalid card connection",
    "Disconnect cards only when the latest validator issue allows it.",
    connection,
    "draft.disconnect_cards",
    true
  )
  register(
    "periplus_draft_validate",
    "Validate Agent draft",
    "Purely validate the draft; at most five non-Transit repair validations are allowed.",
    Type.Object(
      { draftId: id, attemptId: id },
      { additionalProperties: false }
    ),
    "draft.validate",
    true
  )
  register(
    "periplus_draft_prepare_transit",
    "Prepare Transit route",
    "Fetch and select one validator-approved Transit route without using a repair attempt.",
    Type.Object(
      { draftId: id, operationId: id, transitCardId: id },
      { additionalProperties: false }
    ),
    "draft.prepare_transit",
    true
  )
  register(
    "periplus_draft_commit",
    "Commit validated Agent draft",
    "Atomically commit one VALID draft as a single Workspace revision.",
    Type.Object(
      { draftId: id, idempotencyKey: id },
      { additionalProperties: false }
    ),
    "draft.commit",
    true
  )
  register(
    "periplus_place_search",
    "Search places",
    "Discover place names; a selected result must still be resolved.",
    Type.Object(
      {
        requestId: id,
        query: Type.Optional(id),
        city: Type.Optional(Type.String()),
        categories: Type.Optional(Type.Array(placeCategory)),
        intent: Type.Optional(placeIntent),
        near: Type.Optional(
          Type.Object(
            { lat: Type.Number(), lng: Type.Number(), coordinateSystem },
            { additionalProperties: false }
          )
        ),
        radiusMeters: Type.Optional(
          Type.Integer({ minimum: 1, maximum: 50000 })
        ),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
      },
      { additionalProperties: false }
    ),
    "place.search"
  )
  register(
    "periplus_place_resolve",
    "Resolve place",
    "Resolve one place phrase into a run-scoped evidence handle or ambiguity.",
    Type.Object(
      {
        requestId: id,
        text: id,
        city: Type.Optional(Type.String()),
        intent: Type.Optional(placeIntent),
      },
      { additionalProperties: false }
    ),
    "place.resolve"
  )
  register(
    "periplus_place_fallback",
    "Register fallback place",
    "Register a WebSearch-backed unverified place only after place.resolve reports fallbackAllowed=true. Coordinates must be supported by the supplied HTTP(S) sources and never guessed.",
    Type.Object(
      {
        requestId: id,
        failedRequestId: id,
        name: id,
        city: id,
        address: Type.Optional(id),
        category: placeCategory,
        lat: Type.Number({ minimum: -90, maximum: 90 }),
        lng: Type.Number({ minimum: -180, maximum: 180 }),
        coordinateSystem,
        sourceUrls: Type.Array(
          Type.String({
            format: "uri",
            pattern: "^https?://",
            maxLength: 2048,
          }),
          { minItems: 1, maxItems: 5 }
        ),
      },
      { additionalProperties: false }
    ),
    "place.fallback"
  )
  register(
    "periplus_place_enrich",
    "Enrich resolved place",
    "Optionally verify available images for a resolved place handle.",
    Type.Object(
      {
        requestId: id,
        placeResolutionId: id,
        fields: Type.Array(Type.Literal("images"), { minItems: 1 }),
      },
      { additionalProperties: false }
    ),
    "place.enrich"
  )
  register(
    "periplus_hotel_search",
    "Search hotel recommendations",
    "Search hotel cards and return the first valid run-scoped selection handle.",
    Type.Object(
      {
        requestId: id,
        originQuery: id,
        place: id,
        placeType: Type.Union([
          Type.Literal("城市"),
          Type.Literal("机场"),
          Type.Literal("景点"),
          Type.Literal("火车站"),
          Type.Literal("地铁站"),
          Type.Literal("酒店"),
          Type.Literal("区/县"),
          Type.Literal("详细地址"),
        ]),
        countryCode: Type.Optional(Type.String({ minLength: 2, maxLength: 2 })),
        checkInDate: date,
        stayNights: Type.Integer({ minimum: 1, maximum: 30 }),
        adultCount: Type.Integer({ minimum: 1, maximum: 10 }),
        size: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
      },
      { additionalProperties: false }
    ),
    "hotel.search"
  )

  if (!config.webSearchEnabled) return
  let remainingSearches = config.maxWebSearches
  pi.registerTool({
    name: "web_search",
    label: "Web search",
    description:
      "Search the current web for timely information and return the answer with source links.",
    parameters: Type.Object(
      { query: Type.String({ minLength: 1 }) },
      { additionalProperties: false }
    ),
    async execute(_toolCallId, { query }, signal) {
      if (remainingSearches <= 0) throw new Error("Web search limit reached")
      const apiKey = process.env.DEEPSEEK_API_KEY
      if (!apiKey) {
        throw new Error("DEEPSEEK_API_KEY is required for web search")
      }
      remainingSearches -= 1
      const response = await fetch("https://api.deepseek.com/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          input: query,
          tools: [{ type: "web_search" }],
          tool_choice: { type: "web_search" },
          max_output_tokens: 4096,
        }),
        signal,
      })
      const body = (await response.json()) as Record<string, unknown>
      if (!response.ok) {
        throw new Error(
          typeof body.error === "object" && body.error !== null
            ? String(
                (body.error as { message?: unknown }).message ??
                  "Web search failed"
              )
            : "Web search failed"
        )
      }
      return textResult({
        answer: responseText(body),
        sources: responseSources(body),
        usage: body.usage,
      })
    },
  })
}
