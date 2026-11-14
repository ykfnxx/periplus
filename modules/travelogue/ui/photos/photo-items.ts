import type { JourneySnapshot } from "@/modules/data-model/contracts/index"
import { eventTitle, recordingCoordinateToMap } from "../formatting/display"

export function photoItems(events: JourneySnapshot["events"]) {
  return events.flatMap((entry) =>
    entry.photos.map((photo) => {
      const location = photo.location ?? entry.location
      return {
        ...photo,
        id: `${entry.id}:${photo.assetId}`,
        eventId: entry.id,
        eventTitle: eventTitle(entry),
        location,
        inherited: photo.location === null,
        coordinate: location?.coordinates
          ? recordingCoordinateToMap(location.coordinates)
          : null,
      }
    })
  )
}
export type PhotoItem = ReturnType<typeof photoItems>[number] & {
  journeyTitle?: string
}
