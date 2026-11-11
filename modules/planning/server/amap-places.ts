import { randomUUID } from "node:crypto"
import { McpClient, StreamableHttpTransport } from "@earendil-works/pi-mcp"
import gcoord from "gcoord"
import { z } from "zod"
import type { PlanningEventSummary, PlanningLivePlace } from "../contracts"
import type { PlanningProviderFact } from "./runtime-contract"

export const AMAP_CALL_LIMIT = 16
export const AMAP_CALL_TIMEOUT_MS = 8000
export const AMAP_FIELDS = ["name", "city", "address", "coordinates"] as const
export type AmapField = (typeof AMAP_FIELDS)[number]
export interface AmapPolicy {
  id: string
  fields: readonly AmapField[]
}
type RemoteTool = {
  name: string
  inputSchema: {
    type?: string
    properties?: Record<string, unknown>
    required?: string[]
  }
}
export interface AmapConnection {
  listTools(options: {
    signal: AbortSignal
    timeoutMs: number
  }): Promise<RemoteTool[]>
  callTool(
    name: string,
    args: Record<string, unknown>,
    options: { signal: AbortSignal; timeoutMs: number }
  ): Promise<{
    isError?: boolean
    structuredContent?: unknown
    content?: unknown[]
  }>
  close(): Promise<void>
}
interface Candidate extends PlanningLivePlace {
  poiId: string
  expectedCity?: string
  inspected: boolean
}
export interface PlaceResult {
  status:
    | "found"
    | "ambiguous"
    | "empty"
    | "missing_coordinates"
    | "needs_location"
    | "expired_reference"
    | "tool_unavailable"
    | "query_unavailable"
    | "call_limit"
  candidates?: (PlanningLivePlace & {
    facts: PlanningProviderFact[]
    inspected: boolean
  })[]
}
export interface AmapPlacesOptions {
  key: string
  policy: AmapPolicy
  events: PlanningEventSummary[]
  signal: AbortSignal
  onLivePlaces: (places: PlanningLivePlace[]) => void
  connect?: (signal: AbortSignal) => Promise<AmapConnection>
}

const poiSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  city: z.string().optional(),
  address: z.string().optional(),
  location: z.string().optional(),
})
const requiredFields: Record<string, Record<string, string>> = {
  maps_text_search: { keywords: "string", city: "string" },
  maps_around_search: {
    keywords: "string",
    location: "string",
    radius: "string",
  },
  maps_search_detail: { id: "string" },
}
const mandatoryFields: Record<string, string[]> = {
  maps_text_search: ["keywords"],
  maps_around_search: ["keywords", "location"],
  maps_search_detail: ["id"],
}
function compatible(tool: RemoteTool) {
  const expected = requiredFields[tool.name]
  if (!expected || tool.inputSchema.type !== "object") return false
  const { properties = {}, required = [] } = tool.inputSchema
  return (
    mandatoryFields[tool.name].every((key) => required.includes(key)) &&
    required.every((key) => key in expected) &&
    Object.entries(expected).every(
      ([key, type]) =>
        z.object({ type: z.literal(type) }).safeParse(properties[key]).success
    )
  )
}
function coordinates(location: string | undefined) {
  if (!location) return undefined
  const parts = location.split(",").map(Number)
  if (
    parts.length !== 2 ||
    parts.some((value) => !Number.isFinite(value)) ||
    Math.abs(parts[0]) > 180 ||
    Math.abs(parts[1]) > 90
  )
    throw new Error("Invalid place coordinates")
  return { lng: parts[0], lat: parts[1], coordinateSystem: "GCJ02" as const }
}
function publicPlace(candidate: Candidate): PlanningLivePlace {
  return {
    candidateRef: candidate.candidateRef,
    name: candidate.name,
    ...(candidate.city ? { city: candidate.city } : {}),
    ...(candidate.address ? { address: candidate.address } : {}),
    ...(candidate.coordinates ? { coordinates: candidate.coordinates } : {}),
  }
}
function parseResult(result: Awaited<ReturnType<AmapConnection["callTool"]>>) {
  if (result.isError) throw new Error("Place query failed")
  const data =
    result.structuredContent ??
    JSON.parse(
      (result.content ?? [])
        .flatMap((part) => {
          const text = z
            .object({ type: z.literal("text"), text: z.string() })
            .safeParse(part)
          return text.success ? [text.data.text] : []
        })
        .join("\n")
    )
  const status = z
    .object({
      status: z.union([z.string(), z.number()]).optional(),
      infocode: z.string().optional(),
    })
    .parse(data)
  if (
    (status.status !== undefined && String(status.status) !== "1") ||
    (status.infocode !== undefined && status.infocode !== "10000")
  )
    throw new Error("Place query unavailable")
  return data
}

export class AmapPlaces {
  private connection?: Promise<AmapConnection>
  private available = new Set<string>()
  private candidates = new Map<string, Candidate>()
  private facts = new Map<string, PlanningProviderFact>()
  private displayValues: unknown[] = []
  private calls = 0
  private closed = false
  constructor(private readonly options: AmapPlacesOptions) {}

  private async open() {
    if (!this.connection)
      this.connection = (async () => {
        let client: AmapConnection | undefined
        try {
          if (this.options.connect)
            client = await this.options.connect(this.options.signal)
          else {
            const mcp = new McpClient({
              name: "periplus-planning",
              version: "1.0.0",
              requestTimeoutMs: AMAP_CALL_TIMEOUT_MS,
            })
            client = mcp
            const url = new URL("https://mcp.amap.com/mcp")
            url.searchParams.set("key", this.options.key)
            await mcp.connect(
              new StreamableHttpTransport({
                url,
                openGetStream: false,
                reconnect: { maxRetries: 0 },
                fetch: (input, init) =>
                  fetch(input, {
                    ...init,
                    signal: AbortSignal.any([
                      this.options.signal,
                      ...(init?.signal ? [init.signal] : []),
                      AbortSignal.timeout(AMAP_CALL_TIMEOUT_MS),
                    ]),
                  }),
              })
            )
          }
          const tools = await client.listTools({
            signal: this.options.signal,
            timeoutMs: AMAP_CALL_TIMEOUT_MS,
          })
          this.options.signal.throwIfAborted()
          this.available = new Set(
            tools.filter(compatible).map((tool) => tool.name)
          )
          return client
        } catch {
          await client?.close()
          throw new Error("AMap connection unavailable")
        }
      })()
    return this.connection
  }

  private async query(
    name: string,
    args: Record<string, unknown>,
    consume: (data: unknown) => PlaceResult
  ): Promise<PlaceResult> {
    this.options.signal.throwIfAborted()
    if (this.closed) throw new Error("Place session is closed")
    if (!this.options.key && !this.options.connect)
      return { status: "query_unavailable" }
    if (this.calls >= AMAP_CALL_LIMIT) return { status: "call_limit" }
    try {
      const client = await this.open()
      this.options.signal.throwIfAborted()
      if (!this.available.has(name)) return { status: "tool_unavailable" }
      this.calls++
      const result = await client.callTool(name, args, {
        signal: this.options.signal,
        timeoutMs: AMAP_CALL_TIMEOUT_MS,
      })
      this.options.signal.throwIfAborted()
      return consume(parseResult(result))
    } catch {
      this.options.signal.throwIfAborted()
      return { status: "query_unavailable" }
    }
  }

  private remember(
    poi: z.infer<typeof poiSchema>,
    expectedCity?: string,
    previous?: Candidate
  ) {
    const candidate: Candidate = {
      candidateRef: previous?.candidateRef ?? `amap:${randomUUID()}`,
      poiId: poi.id,
      name: poi.name,
      city: poi.city,
      address: poi.address,
      coordinates: coordinates(poi.location),
      expectedCity,
      inspected: Boolean(previous),
    }
    this.candidates.set(candidate.candidateRef, candidate)
    this.displayValues.push(poi.id)
    const facts: PlanningProviderFact[] = []
    for (const field of AMAP_FIELDS) {
      const value = candidate[field]
      if (value === undefined || value === "") continue
      if (
        this.options.policy.id &&
        this.options.policy.fields.includes(field)
      ) {
        const fact = {
          factRef: `${candidate.candidateRef}:${field}`,
          provider: "amap",
          policyId: `${this.options.policy.id}:${field}`,
          value,
        }
        facts.push(fact)
        this.facts.set(fact.factRef, fact)
      } else this.displayValues.push(value)
    }
    return { ...publicPlace(candidate), facts, inspected: candidate.inspected }
  }

  private publish() {
    this.options.signal.throwIfAborted()
    this.options.onLivePlaces([...this.candidates.values()].map(publicPlace))
  }

  async findPlaces(keywords: string, city?: string): Promise<PlaceResult> {
    return this.query(
      "maps_text_search",
      { keywords, ...(city ? { city } : {}) },
      (data) => {
        const pois = z
          .object({ pois: z.array(poiSchema) })
          .parse(data)
          .pois.slice(0, 5)
        const candidates = pois.map((poi) => this.remember(poi, city))
        this.publish()
        return {
          status:
            candidates.length > 1
              ? "ambiguous"
              : candidates.length
                ? "found"
                : "empty",
          candidates,
        }
      }
    )
  }

  async findNearby(
    keywords: string,
    centerRef: string,
    radius?: number
  ): Promise<PlaceResult> {
    this.options.signal.throwIfAborted()
    const point =
      this.candidates.get(centerRef)?.coordinates ??
      this.options.events.find((event) => event.id === centerRef)?.location
        ?.coordinates
    if (!point)
      return {
        status:
          this.candidates.has(centerRef) ||
          this.options.events.some((event) => event.id === centerRef)
            ? "needs_location"
            : "expired_reference",
      }
    const [lng, lat] = gcoord.transform(
      [point.lng, point.lat],
      gcoord[point.coordinateSystem],
      gcoord.GCJ02
    )
    return this.query(
      "maps_around_search",
      {
        keywords,
        location: `${lng},${lat}`,
        ...(radius === undefined ? {} : { radius: String(radius) }),
      },
      (data) => {
        const pois = z
          .object({ pois: z.array(poiSchema) })
          .parse(data)
          .pois.slice(0, 5)
        const candidates = pois.map((poi) => this.remember(poi))
        this.publish()
        return {
          status:
            candidates.length > 1
              ? "ambiguous"
              : candidates.length
                ? "found"
                : "empty",
          candidates,
        }
      }
    )
  }

  async inspectPlace(candidateRef: string): Promise<PlaceResult> {
    this.options.signal.throwIfAborted()
    const previous = this.candidates.get(candidateRef)
    if (!previous) return { status: "expired_reference" }
    return this.query("maps_search_detail", { id: previous.poiId }, (data) => {
      const poi = poiSchema.parse(data)
      if (poi.id !== previous.poiId) throw new Error("Place identity changed")
      const candidate = this.remember(poi, previous.expectedCity, previous)
      this.publish()
      const cityMismatch =
        previous.expectedCity &&
        (!candidate.city ||
          !candidate.city
            .replace(/市$/, "")
            .includes(previous.expectedCity.replace(/市$/, "")))
      return {
        status: cityMismatch
          ? "ambiguous"
          : candidate.coordinates
            ? "found"
            : "missing_coordinates",
        candidates: [candidate],
      }
    })
  }

  result() {
    return {
      permittedFacts: [...this.facts.values()],
      displayOnlyValues: this.displayValues,
    }
  }

  hasCandidate(reference: string) {
    return this.candidates.has(reference)
  }

  async close() {
    this.closed = true
    if (this.connection) {
      // A failed connection was already closed in open().
      const client = await this.connection.catch(() => undefined)
      try {
        await client?.close()
      } catch {
        throw new Error("AMap connection cleanup failed")
      }
    }
    this.candidates.clear()
  }
}
