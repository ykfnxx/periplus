import type { Prisma } from "@prisma/client"
import type { JourneySnapshot } from "@/modules/data-model/contracts"
import { eventWeatherInput } from "./weather-input"

export async function invalidateEventWeather(
  tx: Prisma.TransactionClient,
  journey: JourneySnapshot
) {
  const expected = new Map(
    journey.events.map((event) => [event.id, eventWeatherInput(event)?.key])
  )
  const rows = await tx.eventWeather.findMany({
    where: { journeyId: journey.id },
    select: { eventId: true, inputKey: true },
  })
  const stale = rows
    .filter((row) => expected.get(row.eventId) !== row.inputKey)
    .map((row) => row.eventId)
  if (stale.length)
    await tx.eventWeather.deleteMany({
      where: { journeyId: journey.id, eventId: { in: stale } },
    })
}
