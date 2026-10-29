import {
  journeySummarySchema,
  type JourneySnapshot,
} from "@/modules/data-model/contracts"
export function summarizeJourney(journey: JourneySnapshot) {
  const dates = journey.events
    .flatMap((event) => (event.date ? [event.date] : []))
    .sort()
  const photos = journey.events.flatMap((event) => event.photos)
  const { events: _events, ...metadata } = journey
  return journeySummarySchema.parse({
    ...metadata,
    coverUrl: (photos.find((photo) => photo.isCover) ?? photos[0])?.url ?? null,
    eventCount: journey.events.length,
    photoCount: photos.length,
    startDate: dates[0] ?? null,
    endDate: dates.at(-1) ?? null,
  })
}
