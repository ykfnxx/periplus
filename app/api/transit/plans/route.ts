import { NextRequest, NextResponse } from "next/server"
import {
  AuthRequiredError,
  requireCurrentUser,
} from "@/modules/auth/server/context"
import { transitPlanningService } from "@/modules/data/transit/transit-planning-service"
import type {
  TransitPlanEndpoint,
  TransitPlanRequest,
} from "@/lib/journeys/planning"
import {
  TRANSIT_PREFERENCES,
  TRANSIT_REQUEST_MODES,
  TRANSPORT_MODES,
  type TransitPreference,
  type TransitRequestMode,
  type TransportMode,
} from "@/types/journey"

const MAX_EVENTS_PER_REQUEST = 20

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function endpoint(value: unknown): TransitPlanEndpoint | null {
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

function parseRequests(body: unknown): TransitPlanRequest[] | null {
  if (!body || typeof body !== "object") return null
  const requests = (body as Record<string, unknown>).requests
  if (
    !Array.isArray(requests) ||
    requests.length === 0 ||
    requests.length > MAX_EVENTS_PER_REQUEST
  ) {
    return null
  }

  const parsed: TransitPlanRequest[] = []
  for (const item of requests) {
    if (!item || typeof item !== "object") return null
    const record = item as Record<string, unknown>
    const origin = endpoint(record.origin)
    const destination = endpoint(record.destination)
    const transportMode =
      typeof record.transportMode === "string" &&
      TRANSPORT_MODES.includes(record.transportMode as TransportMode)
        ? (record.transportMode as TransportMode)
        : undefined
    if (
      typeof record.transitEventId !== "string" ||
      !origin ||
      !destination ||
      typeof record.mode !== "string" ||
      !TRANSIT_REQUEST_MODES.includes(record.mode as TransitRequestMode) ||
      (record.transportMode !== undefined && !transportMode) ||
      typeof record.preference !== "string" ||
      !TRANSIT_PREFERENCES.includes(record.preference as TransitPreference)
    ) {
      return null
    }
    parsed.push({
      transitEventId: record.transitEventId,
      origin,
      destination,
      mode: record.mode as TransitRequestMode,
      transportMode,
      preference: record.preference as TransitPreference,
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
      { error: "Invalid transit plan requests" },
      { status: 400 }
    )
  }

  try {
    await requireCurrentUser()
    return NextResponse.json(await transitPlanningService.planMany(requests))
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
