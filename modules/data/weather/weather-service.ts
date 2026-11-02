import type { AuthContext } from "@/modules/auth/server/context"
import {
  journeySnapshotSchema,
  eventWeatherSchema,
  type JourneyWeatherResult,
  type EventWeather,
} from "@/modules/data-model/contracts"
import { prisma } from "@/modules/data/db/prisma"
import { journeyReadScope } from "@/modules/data/journeys/recording-access"
import { RecordingNotFoundError } from "@/modules/data/journeys/recording-service"
import { eventWeatherInput, type WeatherInput } from "./weather-input"
import { fetchEventWeather } from "./open-meteo"

// Coalesce only concurrent requests for this event, not a shared weather cache.
const pending = new Map<string, Promise<EventWeather | null>>()
function fetchOnce(journeyId: string, eventId: string, input: WeatherInput) {
  const key = `${journeyId}:${eventId}:${input.key}`
  let request = pending.get(key)
  if (!request) {
    request = fetchEventWeather(input).finally(() => pending.delete(key))
    pending.set(key, request)
  }
  return request
}

export async function getJourneyWeather(
  context: AuthContext,
  journeyId: string
): Promise<JourneyWeatherResult> {
  const row = await prisma.journey.findFirst({
    where: { id: journeyId, deletedAt: null, ...journeyReadScope(context) },
  })
  if (!row) throw new RecordingNotFoundError()
  const journey = journeySnapshotSchema.parse(JSON.parse(row.snapshotJson))
  const existing = new Map(
    (await prisma.eventWeather.findMany({ where: { journeyId } })).map(
      (record) => [record.eventId, record]
    )
  )
  const events: JourneyWeatherResult["events"] = []
  for (let index = 0; index < journey.events.length; index += 4) {
    events.push(
      ...(await Promise.all(
        journey.events.slice(index, index + 4).map(async (event) => {
          const input = eventWeatherInput(event)
          if (!input) return { eventId: event.id, weather: null }
          const saved = existing.get(event.id)
          if (saved?.inputKey === input.key)
            return {
              eventId: event.id,
              weather: eventWeatherSchema.parse(JSON.parse(saved.resultJson)),
            }
          // All network work happens outside the Journey lock and content transaction.
          const weather = await fetchOnce(journeyId, event.id, input)
          if (!weather) return { eventId: event.id, weather: null }
          const accepted = await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT "id" FROM "Journey" WHERE "id" = ${journeyId} FOR UPDATE`
            const current = await tx.journey.findFirst({
              where: {
                id: journeyId,
                deletedAt: null,
                ...journeyReadScope(context),
              },
            })
            if (!current) return false
            const currentEvent = journeySnapshotSchema
              .parse(JSON.parse(current.snapshotJson))
              .events.find((item) => item.id === event.id)
            if (
              !currentEvent ||
              eventWeatherInput(currentEvent)?.key !== input.key
            )
              return false
            await tx.eventWeather.upsert({
              where: { journeyId_eventId: { journeyId, eventId: event.id } },
              create: {
                journeyId,
                eventId: event.id,
                inputKey: input.key,
                queryJson: JSON.stringify(input),
                resultJson: JSON.stringify(weather),
                fetchedAt: new Date(weather.fetchedAt),
              },
              update: {
                inputKey: input.key,
                queryJson: JSON.stringify(input),
                resultJson: JSON.stringify(weather),
                fetchedAt: new Date(weather.fetchedAt),
              },
            })
            return true
          })
          return { eventId: event.id, weather: accepted ? weather : null }
        })
      ))
    )
  }
  return { journeyId, revision: journey.revision, events }
}
