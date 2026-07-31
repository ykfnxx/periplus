import type {
  JourneyEvent,
  JourneyLngLat,
  LocationJourneyEvent,
} from "@/types/journey"

export interface JourneyLocation {
  eventId: string
  name: string
  lat: number
  lng: number
  placeId?: string
  coordinateSystem?: string
  coordinateProvider?: string
  providerPlaceId?: string
}

export function isLocationEvent(
  event: JourneyEvent
): event is LocationJourneyEvent {
  return ["SECTION", "VISIT", "STAY", "MEAL", "ACTIVITY"].includes(event.type)
}

export function plannedLocationOf(
  event: JourneyEvent | undefined
): JourneyLocation | null {
  if (!event || !isLocationEvent(event)) return null

  if (event.type === "SECTION") {
    if (event.detail.lat === undefined || event.detail.lng === undefined) {
      return null
    }
    return {
      eventId: event.id,
      name: event.title,
      lat: event.detail.lat,
      lng: event.detail.lng,
      placeId: event.detail.placeId,
      coordinateSystem: event.detail.coordinateSystem,
      coordinateProvider: event.detail.coordinateProvider,
      providerPlaceId: event.detail.providerPlaceId,
    }
  }

  return {
    eventId: event.id,
    name: event.title,
    lat: event.detail.plannedLat,
    lng: event.detail.plannedLng,
    placeId: event.detail.plannedPlaceId,
    coordinateSystem: event.detail.coordinateSystem,
    coordinateProvider: event.detail.coordinateProvider,
    providerPlaceId: event.detail.providerPlaceId,
  }
}

export function effectiveLocationOf(
  event: JourneyEvent | undefined
): JourneyLocation | null {
  const planned = plannedLocationOf(event)
  if (!planned || !event || event.type === "SECTION") return planned
  if (!isLocationEvent(event)) return null

  return {
    ...planned,
    lat: event.detail.actualLat ?? planned.lat,
    lng: event.detail.actualLng ?? planned.lng,
    placeId: event.detail.actualPlaceId ?? planned.placeId,
  }
}

export function journeyLngLat(location: JourneyLocation): JourneyLngLat {
  return [location.lng, location.lat]
}
