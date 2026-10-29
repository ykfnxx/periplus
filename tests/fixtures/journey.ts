import type {
  JourneySnapshot,
  JourneyEvent,
} from "@/modules/data-model/contracts"
import {
  buildTransitPlanRequest,
  transitPlanFingerprint,
} from "@/lib/journeys/planning"
const NOW = "2026-10-29T00:00:00.000Z"
export function eventFixture(id: string, ownerId = "owner"): JourneyEvent {
  return {
    id,
    title: "",
    body: "",
    category: null,
    date: null,
    time: null,
    timeZone: null,
    location: null,
    source: { userId: ownerId, name: "Owner", image: null },
    canEdit: true,
    canRemove: true,
    photos: [],
    receipts: [],
    createdAt: NOW,
    updatedAt: NOW,
  }
}
export function journeyFixture(
  ownerId = "owner",
  id = "journey"
): JourneySnapshot {
  return {
    id,
    ownerId,
    role: "OWNER",
    revision: 1,
    title: "一段旅程",
    description: "",
    status: "DRAFT",
    visibility: "PRIVATE",
    events: [],
    createdAt: NOW,
    updatedAt: NOW,
  }
}
export function transitJourneyFixture(
  ownerId = "owner",
  id = "journey"
): JourneySnapshot {
  const journey = journeyFixture(ownerId, id)
  const start = {
    ...eventFixture(`${id}-start`, ownerId),
    title: "西湖",
    category: "VISIT" as const,
    location: {
      name: "西湖",
      address: null,
      coordinates: {
        lat: 30.25,
        lng: 120.15,
        coordinateSystem: "GCJ02" as const,
      },
    },
    planning: {
      startAt: "2026-10-29T01:00:00.000Z",
      endAt: "2026-10-29T02:00:00.000Z",
      provider: "amap",
    },
  }
  const end = {
    ...eventFixture(`${id}-end`, ownerId),
    title: "湖边茶室",
    category: "MEAL" as const,
    location: {
      name: "湖边茶室",
      address: null,
      coordinates: {
        lat: 30.251,
        lng: 120.151,
        coordinateSystem: "GCJ02" as const,
      },
    },
    planning: {
      startAt: "2026-10-29T02:10:00.000Z",
      endAt: "2026-10-29T03:00:00.000Z",
      provider: "amap",
    },
  }
  const transit: JourneyEvent = {
    ...eventFixture(`${id}-transit`, ownerId),
    title: "步行",
    category: "TRANSIT",
    planning: {
      startAt: "2026-10-29T02:00:00.000Z",
      endAt: "2026-10-29T02:10:00.000Z",
    },
    transit: {
      fromEventId: start.id,
      toEventId: end.id,
      transportMode: "WALK",
      routeState: "EMPTY",
    },
  }
  journey.events = [start, transit, end]
  const request = buildTransitPlanRequest(transit, journey.events)!,
    fingerprint = transitPlanFingerprint(request)
  transit.transit = {
    ...transit.transit!,
    routeState: "READY",
    route: {
      requestFingerprint: fingerprint,
      plans: [
        {
          id: "selected-plan",
          requestFingerprint: fingerprint,
          provider: "fixture",
          rank: 0,
          label: "步行",
          strategy: "RECOMMENDED",
          distanceMeters: 150,
          durationSeconds: 600,
          trafficBasis: "TYPICAL",
          calculatedAt: NOW,
          segments: [
            {
              id: "segment",
              order: 0,
              mode: "WALK",
              distanceMeters: 150,
              durationSeconds: 600,
              coordinateSystem: "GCJ02",
              geometryKind: "ROAD_NETWORK",
              positions: [
                [120.15, 30.25],
                [120.151, 30.251],
              ],
            },
          ],
        },
      ],
    },
  }
  return journey
}
