import { NextRequest, NextResponse } from "next/server"
import {
  AuthRequiredError,
  requireCurrentUser,
} from "@/modules/auth/server/context"
import { resolveEdgeGeometries } from "@/modules/data/routes/edge-geometry-service"
import { TRANSPORT_MODES, type TransportMode } from "@/types/route"

const MAX_EDGES_PER_REQUEST = 60

interface EdgePayload {
  from: { lat: number; lng: number }
  to: { lat: number; lng: number }
  transportMode?: TransportMode
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function parseEndpoint(value: unknown): { lat: number; lng: number } | null {
  if (!value || typeof value !== "object") return null
  const { lat, lng } = value as Record<string, unknown>
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null
  return { lat, lng }
}

function parseEdges(body: unknown): EdgePayload[] | null {
  if (!body || typeof body !== "object") return null
  const { edges } = body as Record<string, unknown>
  if (!Array.isArray(edges) || edges.length > MAX_EDGES_PER_REQUEST) return null

  const parsed: EdgePayload[] = []
  for (const edge of edges) {
    if (!edge || typeof edge !== "object") return null
    const record = edge as Record<string, unknown>
    const from = parseEndpoint(record.from)
    const to = parseEndpoint(record.to)
    if (!from || !to) return null

    let transportMode: TransportMode | undefined
    if (record.transportMode !== undefined) {
      if (
        typeof record.transportMode !== "string" ||
        !TRANSPORT_MODES.includes(record.transportMode as TransportMode)
      ) {
        return null
      }
      transportMode = record.transportMode as TransportMode
    }
    parsed.push({ from, to, transportMode })
  }
  return parsed
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const edges = parseEdges(body)
  if (!edges) {
    return NextResponse.json(
      { error: "Invalid edges payload" },
      { status: 400 }
    )
  }

  try {
    await requireCurrentUser()
    const results = await resolveEdgeGeometries(edges)
    return NextResponse.json({ results })
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      )
    }
    throw error
  }
}
