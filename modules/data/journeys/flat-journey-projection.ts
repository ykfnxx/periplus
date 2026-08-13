import { createHash } from "node:crypto"
import type {
  TargetFlatJourneyCity,
  TargetFlatJourneyEvent,
  TargetFlatJourneySnapshot,
  TargetJourneyEvent,
  TargetJourneyGraphSnapshot,
} from "@/modules/data-model/contracts"
import { targetFlatJourneySnapshotSchema } from "@/modules/data-model/contracts"
import { resolveJourneyProjection } from "./journey-projection"

function activeAtRevision(
  value: { introducedRevision: number; retiredRevision?: number | null },
  revision: number
) {
  return (
    value.introducedRevision <= revision &&
    (!value.retiredRevision || value.retiredRevision > revision)
  )
}

function cityKey(cityEventId: string, name: string) {
  return `city-${createHash("sha256")
    .update(`${cityEventId}:${name}`)
    .digest("hex")
    .slice(0, 16)}`
}

function cityOf(
  graph: TargetJourneyGraphSnapshot,
  event: TargetJourneyEvent
): TargetFlatJourneyCity | null {
  const city = event.parentSectionEventId
    ? graph.events.find(
        (candidate) =>
          candidate.id === event.parentSectionEventId &&
          candidate.type === "SECTION" &&
          candidate.detail.kind === "CITY"
      )
    : null
  if (!city || city.type !== "SECTION") return null
  return {
    key: cityKey(city.id, city.title),
    name: city.title,
    timeZone: city.detail.timeZone,
  }
}

function locationEvent(
  graph: TargetJourneyGraphSnapshot,
  event: Exclude<TargetJourneyEvent, { type: "SECTION" | "NOTE" | "TRANSIT" }>
): TargetFlatJourneyEvent | null {
  const city = cityOf(graph, event)
  if (!city) return null
  const base = {
    eventId: event.id,
    title: event.title,
    ...(event.description ? { description: event.description } : {}),
    city,
    ...(event.plannedStartAt ? { plannedStartAt: event.plannedStartAt } : {}),
    ...(event.plannedEndAt ? { plannedEndAt: event.plannedEndAt } : {}),
  }
  const place = {
    name: event.title,
    ...(event.detail.coordinateProvider === undefined
      ? {}
      : { provider: event.detail.coordinateProvider }),
    ...(event.detail.providerPlaceId === undefined
      ? {}
      : { providerPlaceId: event.detail.providerPlaceId }),
    lat: event.detail.plannedLat,
    lng: event.detail.plannedLng,
    coordinateSystem: event.detail.coordinateSystem,
  }
  const detail = {
    place: {
      ...place,
      provider: place.provider ?? "periplus",
    },
    ...(event.detail.plannedDurationMinutes === undefined
      ? {}
      : { plannedDurationMinutes: event.detail.plannedDurationMinutes }),
  }
  if (event.type === "VISIT") {
    return {
      ...base,
      kind: "VISIT",
      detail: {
        ...detail,
        ...(event.detail.providerCoverImage
          ? { coverImageUrl: event.detail.providerCoverImage.url }
          : {}),
      },
    }
  }
  if (event.type === "MEAL") {
    return {
      ...base,
      kind: "MEAL",
      detail: {
        ...detail,
        ...(event.detail.cuisine ? { cuisine: event.detail.cuisine } : {}),
      },
    }
  }
  if (event.type === "ACTIVITY") {
    return {
      ...base,
      kind: "ACTIVITY",
      detail: {
        ...detail,
        ...(event.detail.bookingReference
          ? { bookingReference: event.detail.bookingReference }
          : {}),
      },
    }
  }
  return {
    ...base,
    kind: "STAY",
    detail: {
      ...detail,
      ...(event.detail.checkInNote
        ? { checkInNote: event.detail.checkInNote }
        : {}),
      hotel: event.detail.hotelOffer
        ? {
            provider: "rollinggo",
            name: event.title,
            ...(event.detail.hotelOffer.address
              ? { address: event.detail.hotelOffer.address }
              : {}),
            ...(event.detail.hotelOffer.startingPrice
              ? { startingPrice: event.detail.hotelOffer.startingPrice }
              : {}),
            ...(event.detail.hotelOffer.coverImageUrl
              ? { coverImageUrl: event.detail.hotelOffer.coverImageUrl }
              : {}),
            ...(event.detail.hotelOffer.externalUrl
              ? { externalUrl: event.detail.hotelOffer.externalUrl }
              : {}),
            fetchedAt: event.detail.hotelOffer.fetchedAt,
          }
        : {
            provider: "rollinggo",
            name: event.title,
            fetchedAt: event.updatedAt,
          },
    },
  }
}

function orderedActiveEvents(graph: TargetJourneyGraphSnapshot) {
  const byId = new Map(graph.events.map((event) => [event.id, event]))
  const ordered: TargetJourneyEvent[] = []
  const root = resolveJourneyProjection({
    graph,
    scopeSectionEventId: null,
    mode: "PLANNER",
  })
  for (const entry of root.events) {
    const event = byId.get(entry.eventId)
    if (!event) continue
    if (event.type !== "SECTION") {
      ordered.push(event)
      continue
    }
    const city = resolveJourneyProjection({
      graph,
      scopeSectionEventId: event.id,
      mode: "PLANNER",
    })
    for (const cityEntry of city.events) {
      const cityEvent = byId.get(cityEntry.eventId)
      if (cityEvent) ordered.push(cityEvent)
    }
  }
  return ordered.filter(
    (event) =>
      event.placementStatus === "SCHEDULED" &&
      activeAtRevision(event, graph.revision) &&
      event.type !== "SECTION" &&
      event.type !== "NOTE"
  )
}

export function projectFlatJourney(
  graph: TargetJourneyGraphSnapshot,
  workspaceRevision: number
): TargetFlatJourneySnapshot {
  const ordered = orderedActiveEvents(graph)
  const locationById = new Map(
    ordered.flatMap((event) => {
      if (
        event.type === "SECTION" ||
        event.type === "NOTE" ||
        event.type === "TRANSIT"
      ) {
        return []
      }
      const projected = locationEvent(graph, event)
      return projected ? [[event.id, projected] as const] : []
    })
  )
  const events = ordered.flatMap((event, index): TargetFlatJourneyEvent[] => {
    if (event.type !== "TRANSIT") {
      const projected = locationById.get(event.id)
      return projected ? [projected] : []
    }
    const previous = [...ordered.slice(0, index)]
      .reverse()
      .find((candidate) => locationById.has(candidate.id))
    const next = ordered
      .slice(index + 1)
      .find((candidate) => locationById.has(candidate.id))
    if (!previous || !next) return []
    const from = locationById.get(previous.id)
    const to = locationById.get(next.id)
    if (!from || !to || from.kind === "TRANSIT" || to.kind === "TRANSIT") {
      return []
    }
    return [
      {
        eventId: event.id,
        kind: "TRANSIT",
        title: event.title,
        ...(event.description ? { description: event.description } : {}),
        ...(event.plannedStartAt
          ? { plannedStartAt: event.plannedStartAt }
          : {}),
        ...(event.plannedEndAt ? { plannedEndAt: event.plannedEndAt } : {}),
        detail: {
          fromEventKey: previous.id,
          toEventKey: next.id,
          fromCity: from.city,
          toCity: to.city,
          transportMode: event.detail.transportMode,
          ...(event.detail.preference
            ? { preference: event.detail.preference }
            : {}),
          ...(event.detail.plannedDurationMinutes === undefined
            ? {}
            : {
                plannedDurationMinutes: event.detail.plannedDurationMinutes,
              }),
          ...(event.detail.plannedDistanceKm === undefined
            ? {}
            : { plannedDistanceKm: event.detail.plannedDistanceKm }),
          routeState: event.detail.routeState,
        },
      },
    ]
  })
  return targetFlatJourneySnapshotSchema.parse({
    schemaVersion: 1,
    journeyId: graph.id,
    revision: workspaceRevision,
    title: graph.title,
    ...(graph.description ? { description: graph.description } : {}),
    events,
  })
}
