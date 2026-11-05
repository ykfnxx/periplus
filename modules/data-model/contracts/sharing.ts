import { z } from "zod"
import { targetIdSchema, targetDateTimeSchema } from "./common"
import { EVENT_CATEGORIES, eventDateSchema } from "./event"
import { eventWeatherSchema } from "./weather"

const sharedPhotoSchema = z
  .object({
    assetId: targetIdSchema,
    caption: z.string(),
    author: z.string(),
    isCover: z.boolean(),
  })
  .strict()

export const sharedJourneySchema = z
  .object({
    title: z.string(),
    description: z.string(),
    authors: z.array(z.string()),
    cities: z.array(z.string()),
    events: z.array(
      z
        .object({
          id: targetIdSchema,
          category: z.enum(EVENT_CATEGORIES),
          title: z.string(),
          body: z.string(),
          date: eventDateSchema,
          timeLabel: z.string(),
          location: z.string().nullable(),
          author: z.string(),
          photos: z.array(sharedPhotoSchema),
          costs: z.array(z.string()),
          weather: eventWeatherSchema.nullable(),
          transit: z
            .object({
              fromName: z.string(),
              toName: z.string(),
              departure: z.string().nullable(),
              arrival: z.string(),
              mode: z.string(),
              duration: z.string().nullable(),
              distance: z.string().nullable(),
              line: z.string().nullable(),
              note: z.string(),
            })
            .strict()
            .nullable(),
        })
        .strict()
    ),
  })
  .strict()

export const shareWriteSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    expectedShareVersion: z.number().int().nonnegative(),
    includeCosts: z.boolean(),
    idempotencyKey: targetIdSchema,
  })
  .strict()
export const shareRevokeSchema = z
  .object({
    expectedShareVersion: z.number().int().positive(),
    idempotencyKey: targetIdSchema,
  })
  .strict()
export const shareStatusSchema = z
  .object({
    version: z.number().int().nonnegative(),
    sourceRevision: z.number().int().nonnegative(),
    currentRevision: z.number().int().positive(),
    includeCosts: z.boolean(),
    url: z.string().nullable(),
    publishedAt: targetDateTimeSchema.nullable(),
    revokedAt: targetDateTimeSchema.nullable(),
    lastMutationId: z.string().nullable(),
  })
  .strict()
export const sharePreviewSchema = z
  .object({
    includeCosts: z.boolean(),
    revision: z.number().int().positive(),
    document: sharedJourneySchema,
    photoUrls: z.record(z.string(), z.string()),
  })
  .strict()
export type SharedJourney = z.infer<typeof sharedJourneySchema>
export type ShareWrite = z.infer<typeof shareWriteSchema>
export type ShareRevoke = z.infer<typeof shareRevokeSchema>
export type ShareStatus = z.infer<typeof shareStatusSchema>
export type SharePreview = z.infer<typeof sharePreviewSchema>
