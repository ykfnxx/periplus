import { readFileSync } from "node:fs"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { Type } from "typebox"

interface PiRunConfig {
  backendUrl?: string
  capabilityToken?: string
  model: string
  toolNames: string[]
  webSearchEnabled: boolean
  maxWebSearches: number
}

interface AgentToolError {
  code: string
  message: string
}

interface AgentToolResponse {
  result?: unknown
  error?: AgentToolError
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
    headers: { "Content-Type": "application/json" },
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

function collectSources(response: Record<string, unknown>) {
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

export default function periplusRuntimeExtension(pi: ExtensionAPI) {
  const config = runConfig()
  const enabled = (name: string) => config.toolNames.includes(name)
  const register = (
    name: string,
    label: string,
    description: string,
    parameters: ReturnType<typeof Type.Object>,
    toRequest: (params: Record<string, unknown>) => unknown,
    executionMode: "parallel" | "sequential" = "parallel"
  ) => {
    if (!enabled(name)) return
    pi.registerTool({
      name,
      label,
      description,
      parameters,
      executionMode,
      async execute(_toolCallId, params, signal) {
        return textResult(
          await callAgentTool(config, toRequest(params), signal)
        )
      },
    })
  }

  register(
    "periplus_workspace_get",
    "Get current Workspace",
    "Read the persistent Periplus Workspace and headWorkspaceRevision.",
    Type.Object({}),
    () => ({ type: "workspace.get" })
  )
  register(
    "periplus_workspace_project",
    "Resolve ordered Workspace projection",
    "Resolve the authoritative ordered route and time view for one scope.",
    Type.Object({
      scopeSectionEventId: Type.Union([Type.String(), Type.Null()]),
      mode: Type.String(),
      asOfRevision: Type.Optional(Type.Number()),
    }),
    (params) => ({ type: "workspace.project", ...params })
  )
  register(
    "periplus_workspace_validate_plan",
    "Validate journey plan",
    "Validate the Periplus journey plan at the expected Workspace revision.",
    Type.Object({ expectedRevision: Type.Number() }),
    (params) => ({ type: "workspace.validate_plan", ...params })
  )
  register(
    "periplus_workspace_validate_draft",
    "Validate journey draft",
    "Validate a bounded journey-command draft before it is written.",
    Type.Object({
      expectedRevision: Type.Number(),
      idempotencyKey: Type.String(),
      commands: Type.Array(Type.Object({}, { additionalProperties: true })),
      previousDraftId: Type.Optional(Type.String()),
    }),
    (params) => ({ type: "workspace.validate_draft", ...params }),
    "sequential"
  )
  register(
    "periplus_workspace_commit_draft",
    "Commit validated journey draft",
    "Atomically commit a previously validated journey draft.",
    Type.Object({ draftId: Type.String() }),
    (params) => ({ type: "workspace.commit_draft", ...params }),
    "sequential"
  )
  register(
    "periplus_workspace_prepare_transit",
    "Prepare transit for a draft",
    "Fetch one Transit result for a previous invalid draft, then return a new draft for deterministic validation and commit.",
    Type.Object({
      previousDraftId: Type.String(),
      idempotencyKey: Type.String(),
      eventId: Type.String(),
    }),
    (params) => ({ type: "workspace.prepare_transit", ...params }),
    "sequential"
  )

  register(
    "periplus_place_search",
    "Search places",
    "Search the Periplus place catalog. Supply requestId and optional query, city, categories, or intent.",
    Type.Object({
      requestId: Type.String(),
      query: Type.Optional(Type.String()),
      city: Type.Optional(Type.String()),
      adcode: Type.Optional(Type.String()),
      categories: Type.Optional(Type.Array(Type.String())),
      intent: Type.Optional(Type.String()),
      near: Type.Optional(
        Type.Object({
          lat: Type.Number(),
          lng: Type.Number(),
          coordinateSystem: Type.String(),
        })
      ),
      radiusMeters: Type.Optional(Type.Number()),
      limit: Type.Optional(Type.Number()),
      includeLiveProvider: Type.Optional(Type.Boolean()),
      coordinatePreference: Type.Optional(Type.String()),
    }),
    ({ requestId, ...input }) => ({ type: "place.search", requestId, input })
  )
  register(
    "periplus_place_resolve",
    "Resolve place",
    "Resolve a place phrase into a Periplus place or ambiguity set.",
    Type.Object({
      requestId: Type.String(),
      text: Type.String(),
      city: Type.Optional(Type.String()),
      intent: Type.Optional(Type.String()),
      journeyContext: Type.Optional(
        Type.Object({
          currentCity: Type.Optional(Type.String()),
          nearbyEventIds: Type.Optional(Type.Array(Type.String())),
        })
      ),
      requireExact: Type.Optional(Type.Boolean()),
    }),
    ({ requestId, ...input }) => ({ type: "place.resolve", requestId, input })
  )
  register(
    "periplus_place_resolve_for_journey_event",
    "Resolve place for journey event",
    "Resolve a place for an existing event and return its canonical update command.",
    Type.Object({
      requestId: Type.String(),
      eventId: Type.String(),
      text: Type.String(),
      city: Type.Optional(Type.String()),
      intent: Type.Optional(Type.String()),
      journeyContext: Type.Optional(
        Type.Object({
          currentCity: Type.Optional(Type.String()),
          nearbyEventIds: Type.Optional(Type.Array(Type.String())),
        })
      ),
      requireExact: Type.Optional(Type.Boolean()),
    }),
    ({ requestId, ...input }) => ({
      type: "place.resolve_for_journey_event",
      requestId,
      input,
    })
  )
  register(
    "periplus_place_enrich",
    "Enrich place",
    "Read enrichment details for a Periplus place.",
    Type.Object({
      requestId: Type.String(),
      placeId: Type.Optional(Type.String()),
      provider: Type.Optional(Type.String()),
      providerId: Type.Optional(Type.String()),
      fields: Type.Array(Type.String()),
    }),
    ({ requestId, ...input }) => ({ type: "place.enrich", requestId, input })
  )
  register(
    "periplus_hotel_search",
    "Search hotel recommendations",
    "Search RollingGo hotel candidates. Supply a clear destination, stay details, and requestId.",
    Type.Object({
      requestId: Type.String(),
      originQuery: Type.String(),
      place: Type.String(),
      placeType: Type.String(),
      countryCode: Type.Optional(Type.String()),
      checkInDate: Type.Optional(Type.String()),
      stayNights: Type.Optional(Type.Number()),
      adultCount: Type.Optional(Type.Number()),
      size: Type.Optional(Type.Number()),
    }),
    ({ requestId, ...input }) => ({ type: "hotel.search", requestId, input })
  )

  if (!config.webSearchEnabled) return
  let remainingSearches = config.maxWebSearches
  pi.registerTool({
    name: "web_search",
    label: "Web search",
    description:
      "Search the current web for timely information and return the answer with source links.",
    parameters: Type.Object({ query: Type.String() }),
    async execute(_toolCallId, { query }, signal) {
      if (remainingSearches <= 0) throw new Error("Web search limit reached")
      const apiKey = process.env.DEEPSEEK_API_KEY
      if (!apiKey)
        throw new Error("DEEPSEEK_API_KEY is required for web search")
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
        sources: collectSources(body),
        usage: body.usage,
      })
    },
  })
}
