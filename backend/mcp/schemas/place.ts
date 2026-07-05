import { z } from "zod"
import { PLACE_CATEGORIES, PLACE_SEARCH_INTENTS } from "@/lib/places/types"

export const placeCategorySchema = z.enum(PLACE_CATEGORIES)
export const coordinateSystemSchema = z.enum(["WGS84", "GCJ02", "BD09LL"])
export const placeSearchIntentSchema = z.enum(PLACE_SEARCH_INTENTS)

export const placeSearchInputSchema = z.object({
  query: z.string().min(1).optional(),
  city: z.string().optional(),
  adcode: z.string().optional(),
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
  includeLiveProvider: z.boolean().default(false),
  coordinatePreference: z.enum(["amap", "wgs84", "auto"]).default("auto"),
})

export const placeResolveInputSchema = z.object({
  text: z.string().min(1),
  city: z.string().optional(),
  routeContext: z
    .object({
      currentCity: z.string().optional(),
      nearbyNodeIds: z.array(z.string()).optional(),
    })
    .optional(),
  requireExact: z.boolean().default(false),
})

export const placeEnrichInputSchema = z.object({
  placeId: z.string().min(1).optional(),
  provider: z
    .enum(["periplus", "amap", "fsq", "wikidata", "mct", "osm", "opentripmap"])
    .optional(),
  providerId: z.string().min(1).optional(),
  fields: z.array(
    z.enum([
      "coordinates",
      "aliases",
      "description",
      "provider_match",
      "categories",
    ])
  ),
})

export const eventSearchInputSchema = z.object({
  placeId: z.string().min(1).optional(),
  city: z.string().optional(),
  keyword: z.string().optional(),
  dateRange: z
    .object({
      from: z.string().min(1),
      to: z.string().min(1),
    })
    .optional(),
})
