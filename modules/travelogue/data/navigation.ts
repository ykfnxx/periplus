import type { RecordingLocation } from "@/modules/data-model/contracts/recording"

export type JourneyOpenRequest = {
  eventId?: string
  add?: boolean
  location?: RecordingLocation
}
export function journeyHref(id: string, request?: JourneyOpenRequest) {
  const query = new URLSearchParams()
  if (request?.eventId) query.set("event", request.eventId)
  if (request?.add) query.set("add", "1")
  const coordinate = request?.location?.coordinates
  if (coordinate) {
    query.set("lat", String(coordinate.lat))
    query.set("lng", String(coordinate.lng))
  }
  return `/journeys/${encodeURIComponent(id)}${query.size ? `?${query}` : ""}`
}
