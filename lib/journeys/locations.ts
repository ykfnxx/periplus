import type { TargetJourneyEvent } from "@/modules/data-model/contracts"

export type JourneyLngLat = [number, number]
export type LocationJourneyEvent = Extract<
  TargetJourneyEvent,
  { type: "SECTION" | "VISIT" | "STAY" | "MEAL" | "ACTIVITY" }
>

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
  event: TargetJourneyEvent
): event is LocationJourneyEvent {
  return (
    event.type === "SECTION" ||
    event.type === "VISIT" ||
    event.type === "STAY" ||
    event.type === "MEAL" ||
    event.type === "ACTIVITY"
  )
}

export function plannedLocationOf(
  event: TargetJourneyEvent | undefined
): JourneyLocation | null {
  if (!event || !isLocationEvent(event)) return null
  if (event.type === "SECTION") {
    if (
      event.detail.kind !== "CITY" ||
      event.detail.lat === undefined ||
      event.detail.lng === undefined
    ) {
      return null
    }
    return {
      eventId: event.id,
      name: event.title,
      lat: event.detail.lat,
      lng: event.detail.lng,
      placeId: event.detail.placeId,
      coordinateSystem: event.detail.coordinateSystem,
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
  event: TargetJourneyEvent | undefined
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
