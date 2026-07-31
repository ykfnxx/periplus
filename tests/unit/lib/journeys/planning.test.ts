import { describe, expect, it } from "vitest"
import {
  applyTransitPlanBundle,
  buildTransitPlanRequest,
  transitPlanFingerprint,
} from "@/lib/journeys/planning"
import { validateJourneyGraph } from "@/lib/journeys/graph"
import type { JourneyEvent, TransitEvent } from "@/types/journey"

function events(): JourneyEvent[] {
  return [
    {
      id: "from",
      type: "VISIT",
      executionStatus: "PLANNED",
      origin: "ORIGINAL",
      title: "起点",
      detail: { plannedLat: 30, plannedLng: 120 },
    },
    {
      id: "transit",
      type: "TRANSIT",
      executionStatus: "PLANNED",
      origin: "ORIGINAL",
      title: "交通",
      detail: {
        plannedFromEventId: "from",
        plannedToEventId: "to",
        transportMode: "CAR",
        requestMode: "DRIVE",
      },
    },
    {
      id: "to",
      type: "VISIT",
      executionStatus: "PLANNED",
      origin: "ORIGINAL",
      title: "终点",
      detail: { plannedLat: 31, plannedLng: 121 },
    },
  ]
}

describe("TRANSIT planning", () => {
  it("builds requests from explicit event endpoint ids", () => {
    const input = events()
    const request = buildTransitPlanRequest(input[1] as TransitEvent, input)
    expect(request).toMatchObject({
      transitEventId: "transit",
      origin: { name: "起点", lat: 30, lng: 120 },
      destination: { name: "终点", lat: 31, lng: 121 },
      mode: "DRIVE",
    })
  })

  it("applies a plan only to the addressed transit event", () => {
    const input = events()
    const transit = input[1] as TransitEvent
    const request = buildTransitPlanRequest(transit, input)!
    const fingerprint = transitPlanFingerprint(request)
    const updated = applyTransitPlanBundle(transit, {
      transitEventId: "transit",
      requestFingerprint: fingerprint,
      plans: [
        {
          id: "plan",
          provider: "mock",
          rank: 0,
          label: "推荐",
          strategy: "recommended",
          distanceMeters: 12_000,
          durationSeconds: 1_800,
          trafficBasis: "TYPICAL",
          calculatedAt: "2026-08-01T00:00:00.000Z",
          requestFingerprint: fingerprint,
          segments: [],
        },
      ],
    })
    expect(updated.detail.selectedPlanId).toBe("plan")
    expect(updated.detail.plannedDurationMinutes).toBe(30)
    expect(updated.detail.plannedDistanceKm).toBe(12)
  })

  it("rejects a selected transit plan that is not attached", () => {
    const input = events()
    const transit = input[1] as TransitEvent
    transit.detail.selectedPlanId = "missing-plan"
    expect(
      validateJourneyGraph({
        events: input,
        links: [
          {
            id: "from-transit",
            fromEventId: "from",
            toEventId: "transit",
            kind: "MAIN",
          },
          {
            id: "transit-to",
            fromEventId: "transit",
            toEventId: "to",
            kind: "MAIN",
          },
        ],
      })
    ).toEqual({
      ok: false,
      error: "transit event transit selected plan is missing",
    })
  })
})
