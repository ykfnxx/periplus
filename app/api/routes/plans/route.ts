import { NextRequest, NextResponse } from "next/server"
import {
  AuthRequiredError,
  requireCurrentUser,
} from "@/modules/auth/server/context"
import { routePlanningService } from "@/modules/data/routes/route-planning-service"
import type { RoutePlanEndpoint, RoutePlanRequest } from "@/lib/routes/planning"
import {
  ROUTE_PREFERENCES,
  ROUTE_REQUEST_MODES,
  type RoutePreference,
  type RouteRequestMode,
} from "@/types/route"

const MAX_EDGES_PER_REQUEST = 20

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function endpoint(value: unknown): RoutePlanEndpoint | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  if (
    typeof record.name !== "string" ||
    !finiteNumber(record.lat) ||
    !finiteNumber(record.lng) ||
    record.lat < -90 ||
    record.lat > 90 ||
    record.lng < -180 ||
    record.lng > 180
  ) {
    return null
  }
  return {
    name: record.name,
    lat: record.lat,
    lng: record.lng,
    coordinateSystem:
      typeof record.coordinateSystem === "string"
        ? record.coordinateSystem
        : undefined,
    providerPlaceId:
      typeof record.providerPlaceId === "string"
        ? record.providerPlaceId
        : undefined,
    cityCode: typeof record.cityCode === "string" ? record.cityCode : undefined,
  }
}

function parseRequests(body: unknown): RoutePlanRequest[] | null {
  if (!body || typeof body !== "object") return null
  const requests = (body as Record<string, unknown>).requests
  if (
    !Array.isArray(requests) ||
    requests.length === 0 ||
    requests.length > MAX_EDGES_PER_REQUEST
  ) {
    return null
  }

  const parsed: RoutePlanRequest[] = []
  for (const item of requests) {
    if (!item || typeof item !== "object") return null
    const record = item as Record<string, unknown>
    const origin = endpoint(record.origin)
    const destination = endpoint(record.destination)
    if (
      typeof record.edgeId !== "string" ||
      !origin ||
      !destination ||
      typeof record.mode !== "string" ||
      !ROUTE_REQUEST_MODES.includes(record.mode as RouteRequestMode) ||
      typeof record.preference !== "string" ||
      !ROUTE_PREFERENCES.includes(record.preference as RoutePreference)
    ) {
      return null
    }
    parsed.push({
      edgeId: record.edgeId,
      origin,
      destination,
      mode: record.mode as RouteRequestMode,
      preference: record.preference as RoutePreference,
      departAt:
        typeof record.departAt === "string" ? record.departAt : undefined,
      alternatives:
        finiteNumber(record.alternatives) && record.alternatives >= 1
          ? Math.min(Math.floor(record.alternatives), 3)
          : 3,
    })
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
  const requests = parseRequests(body)
  if (!requests) {
    return NextResponse.json(
      { error: "Invalid route plan requests" },
      { status: 400 }
    )
  }

  try {
    await requireCurrentUser()
    const result = await routePlanningService.planMany(requests)
    return NextResponse.json(result)
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
