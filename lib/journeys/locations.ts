import type { JourneyEvent } from "@/modules/data-model/contracts"
import { bd09ToGcj02, wgs84ToGcj02 } from "./coordinates"

export type JourneyLngLat = [number, number]
export interface JourneyLocation {
  eventId: string
  name: string
  lat: number
  lng: number
}

export function effectiveLocationOf(
  event: JourneyEvent | undefined
): JourneyLocation | null {
  const location = event?.location
  const coordinates = location?.coordinates
  if (!event || !location || !coordinates) return null
  const { lng, lat, coordinateSystem } = coordinates
  const point =
    coordinateSystem === "WGS84"
      ? wgs84ToGcj02(lng, lat)
      : coordinateSystem === "BD09"
        ? bd09ToGcj02(lng, lat)
        : [lng, lat]
  return {
    eventId: event.id,
    name: location.name,
    lng: point[0],
    lat: point[1],
  }
}

export function journeyLngLat(location: JourneyLocation): JourneyLngLat {
  return [location.lng, location.lat]
}
