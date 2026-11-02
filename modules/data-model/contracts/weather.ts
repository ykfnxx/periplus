import { z } from "zod"
import { targetDateTimeSchema, targetIdSchema } from "./common"

const weatherBaseSchema = z.object({
  provider: z.literal("open-meteo"),
  weatherCode: z.number().int().min(0).max(99),
  fetchedAt: targetDateTimeSchema,
})

export const eventWeatherSchema = z.discriminatedUnion("precision", [
  weatherBaseSchema
    .extend({
      precision: z.literal("HOURLY"),
      temperatureC: z.number().finite(),
      matchedAt: targetDateTimeSchema,
    })
    .strict(),
  weatherBaseSchema
    .extend({
      precision: z.literal("DAILY"),
      temperatureMinC: z.number().finite(),
      temperatureMaxC: z.number().finite(),
    })
    .strict(),
])

// Separate derived results never enter the editable Journey snapshot or history.
// Apply a response only while its journeyId/revision still match the open Journey.
export const journeyWeatherResultSchema = z
  .object({
    journeyId: targetIdSchema,
    revision: z.number().int().nonnegative(),
    events: z.array(
      z
        .object({
          eventId: targetIdSchema,
          weather: eventWeatherSchema.nullable(),
        })
        .strict()
    ),
  })
  .strict()

export type EventWeather = z.infer<typeof eventWeatherSchema>
export type JourneyWeatherResult = z.infer<typeof journeyWeatherResultSchema>
