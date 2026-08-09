import { z } from "zod"
import { PLACE_CATEGORIES, PLACE_SEARCH_INTENTS } from "@/lib/places/types"

const requestIdSchema = z.string().trim().min(1)

export const placeCategorySchema = z.enum(PLACE_CATEGORIES)
export const coordinateSystemSchema = z.enum(["WGS84", "GCJ02", "BD09LL"])
export const placeSearchIntentSchema = z.enum(PLACE_SEARCH_INTENTS)

export const placeSearchInputSchema = z
  .object({
    requestId: requestIdSchema,
    query: z.string().min(1).optional(),
    city: z.string().optional(),
    categories: z.array(placeCategorySchema).optional(),
    intent: placeSearchIntentSchema.optional(),
    near: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        coordinateSystem: coordinateSystemSchema,
      })
      .optional(),
    radiusMeters: z.number().int().positive().max(50000).optional(),
    limit: z.number().int().positive().max(20).default(8),
  })
  .strict()

export const placeResolveInputSchema = z
  .object({
    requestId: requestIdSchema,
    text: z.string().min(1),
    city: z.string().optional(),
    intent: placeSearchIntentSchema.optional(),
    requireExact: z.boolean().default(false),
  })
  .strict()

export const placeEnrichInputSchema = z
  .object({
    requestId: requestIdSchema,
    placeResolutionId: z.string().trim().min(1),
    fields: z.array(z.literal("images")).min(1),
  })
  .strict()
