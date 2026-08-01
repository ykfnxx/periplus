import { z } from "zod"
import {
  TARGET_ASSET_KINDS,
  TARGET_ASSET_VISIBILITIES,
  TARGET_EVENT_ASSET_ROLES,
  TARGET_EVENT_SOURCE_ROLES,
  TARGET_OBSERVATION_PHASES,
  TARGET_SOURCE_ITEM_RESOLUTION_STATES,
  TARGET_SOURCE_PACK_STATUSES,
  TARGET_SOURCE_PACK_VISIBILITIES,
} from "./enums"
import {
  targetActorReferenceSchema,
  targetDateTimeSchema as dateTimeSchema,
  targetIdSchema as idSchema,
} from "./common"

export const targetAssetSchema = z.object({
  id: idSchema,
  ownerId: idSchema,
  kind: z.enum(TARGET_ASSET_KINDS),
  visibility: z.enum(TARGET_ASSET_VISIBILITIES),
  storageKey: z.string().trim().min(1),
  originalName: z.string().trim().min(1).optional(),
  mimeType: z.string().trim().min(1),
  sizeBytes: z.number().int().nonnegative(),
  checksum: z.string().trim().min(1),
  capturedAt: dateTimeSchema.optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  createdAt: dateTimeSchema,
  deletedAt: dateTimeSchema.optional(),
})

export const targetEventAssetLinkSchema = z.object({
  id: idSchema,
  journeyId: idSchema,
  eventId: idSchema,
  assetId: idSchema,
  assetChecksum: z.string().trim().min(1),
  role: z.enum(TARGET_EVENT_ASSET_ROLES),
  rank: z.number().int().nonnegative(),
  caption: z.string().optional(),
  visibility: z.enum(TARGET_ASSET_VISIBILITIES),
  introducedRevision: z.number().int().positive(),
  createdAt: dateTimeSchema,
  retiredRevision: z.number().int().positive().optional(),
})

const targetObservationIdentity = {
  id: idSchema,
  eventId: idSchema,
  phase: z.enum(TARGET_OBSERVATION_PHASES),
  observedAt: dateTimeSchema,
  actor: targetActorReferenceSchema,
  supersedesId: idSchema.optional(),
  visibility: z.enum(TARGET_ASSET_VISIBILITIES),
  createdAt: dateTimeSchema,
}

const targetObservationCreateIdentity = {
  phase: z.enum(TARGET_OBSERVATION_PHASES),
  observedAt: dateTimeSchema.optional(),
  supersedesId: idSchema.optional(),
  visibility: z.enum(TARGET_ASSET_VISIBILITIES),
}

const targetObservationVariants = {
  NOTE: { body: z.string().trim().min(1) },
  RATING: {
    value: z.number().min(0).max(5),
    body: z.string().optional(),
  },
  COST: {
    value: z
      .object({
        amount: z.number().nonnegative(),
        currency: z.string().regex(/^[A-Z]{3}$/),
      })
      .strict(),
    body: z.string().optional(),
  },
  WEATHER: {
    value: z
      .object({
        condition: z.string().trim().min(1),
        temperatureCelsius: z.number(),
      })
      .strict(),
    body: z.string().optional(),
  },
  FACT: { body: z.string().trim().min(1) },
} as const

export const targetEventObservationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...targetObservationIdentity,
      kind: z.literal("NOTE"),
      ...targetObservationVariants.NOTE,
    })
    .strict(),
  z
    .object({
      ...targetObservationIdentity,
      kind: z.literal("RATING"),
      ...targetObservationVariants.RATING,
    })
    .strict(),
  z
    .object({
      ...targetObservationIdentity,
      kind: z.literal("COST"),
      ...targetObservationVariants.COST,
    })
    .strict(),
  z
    .object({
      ...targetObservationIdentity,
      kind: z.literal("WEATHER"),
      ...targetObservationVariants.WEATHER,
    })
    .strict(),
  z
    .object({
      ...targetObservationIdentity,
      kind: z.literal("FACT"),
      ...targetObservationVariants.FACT,
    })
    .strict(),
])

export const targetEventObservationCreateSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...targetObservationCreateIdentity,
      kind: z.literal("NOTE"),
      ...targetObservationVariants.NOTE,
    })
    .strict(),
  z
    .object({
      ...targetObservationCreateIdentity,
      kind: z.literal("RATING"),
      ...targetObservationVariants.RATING,
    })
    .strict(),
  z
    .object({
      ...targetObservationCreateIdentity,
      kind: z.literal("COST"),
      ...targetObservationVariants.COST,
    })
    .strict(),
  z
    .object({
      ...targetObservationCreateIdentity,
      kind: z.literal("WEATHER"),
      ...targetObservationVariants.WEATHER,
    })
    .strict(),
  z
    .object({
      ...targetObservationCreateIdentity,
      kind: z.literal("FACT"),
      ...targetObservationVariants.FACT,
    })
    .strict(),
])

export const targetSourcePackSchema = z.object({
  id: idSchema,
  ownerId: idSchema,
  title: z.string().trim().min(1),
  visibility: z.enum(TARGET_SOURCE_PACK_VISIBILITIES),
  status: z.enum(TARGET_SOURCE_PACK_STATUSES),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
  archivedAt: dateTimeSchema.optional(),
})

export const targetSourceDocumentSchema = z.object({
  id: idSchema,
  sourcePackId: idSchema,
  assetId: idSchema,
  checksum: z.string().trim().min(1),
  title: z.string().trim().min(1),
  pageCount: z.number().int().positive().optional(),
  processingStatus: z.enum(["PENDING", "PROCESSING", "READY", "FAILED"]),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
})

export const targetSourceItemSchema = z.object({
  id: idSchema,
  sourceDocumentId: idSchema,
  kind: z.enum(["PLACE", "PERSON", "EVENT", "QUOTE", "NOTE"]),
  title: z.string().trim().min(1),
  body: z.string().optional(),
  sourceOrder: z.number().int().nonnegative(),
  page: z.string().optional(),
  confidence: z.number().min(0).max(1),
  resolutionState: z.enum(TARGET_SOURCE_ITEM_RESOLUTION_STATES),
  resolvedPlaceId: idSchema.optional(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
})

export const targetEventSourceLinkSchema = z
  .object({
    id: idSchema,
    journeyId: idSchema,
    eventId: idSchema,
    sourceItemId: idSchema,
    sourceDocumentId: idSchema,
    sourceDocumentChecksum: z.string().trim().min(1),
    role: z.enum(TARGET_EVENT_SOURCE_ROLES),
    excerpt: z.string().trim().max(500).optional(),
    page: z.string().optional(),
    confidence: z.number().min(0).max(1),
    rank: z.number().int().nonnegative(),
    approvedForJourneySharing: z.boolean(),
    introducedRevision: z.number().int().positive(),
    createdAt: dateTimeSchema,
    retiredRevision: z.number().int().positive().optional(),
  })
  .superRefine((link, context) => {
    if (link.approvedForJourneySharing && !link.excerpt?.trim()) {
      context.addIssue({
        code: "custom",
        path: ["excerpt"],
        message: "approved source links require a nonblank excerpt",
      })
    }
  })

export const targetContentBundleSchema = z
  .object({
    assets: z.array(targetAssetSchema),
    eventAssetLinks: z.array(targetEventAssetLinkSchema),
    observations: z.array(targetEventObservationSchema),
    sourcePacks: z.array(targetSourcePackSchema),
    sourceDocuments: z.array(targetSourceDocumentSchema),
    sourceItems: z.array(targetSourceItemSchema),
    eventSourceLinks: z.array(targetEventSourceLinkSchema),
  })
  .superRefine((bundle, context) => {
    const assertUniqueIds = (
      path: keyof typeof bundle,
      values: readonly { id: string }[]
    ) => {
      if (new Set(values.map((value) => value.id)).size !== values.length) {
        context.addIssue({
          code: "custom",
          path: [path],
          message: `${path} ids must be unique`,
        })
      }
    }
    assertUniqueIds("assets", bundle.assets)
    assertUniqueIds("eventAssetLinks", bundle.eventAssetLinks)
    assertUniqueIds("observations", bundle.observations)
    assertUniqueIds("sourcePacks", bundle.sourcePacks)
    assertUniqueIds("sourceDocuments", bundle.sourceDocuments)
    assertUniqueIds("sourceItems", bundle.sourceItems)
    assertUniqueIds("eventSourceLinks", bundle.eventSourceLinks)

    const assetById = new Map(bundle.assets.map((asset) => [asset.id, asset]))
    const visibilityRank = { PRIVATE: 0, JOURNEY: 1, PUBLIC: 2 } as const
    for (const link of bundle.eventAssetLinks) {
      const asset = assetById.get(link.assetId)
      if (!asset) {
        context.addIssue({
          code: "custom",
          path: ["eventAssetLinks"],
          message: `link ${link.id} requires an existing asset`,
        })
        continue
      }
      if (visibilityRank[link.visibility] > visibilityRank[asset.visibility]) {
        context.addIssue({
          code: "custom",
          path: ["eventAssetLinks"],
          message: `link ${link.id} cannot broaden asset visibility`,
        })
      }
      if (link.assetChecksum !== asset.checksum) {
        context.addIssue({
          code: "custom",
          path: ["eventAssetLinks"],
          message: `link ${link.id} must pin its asset checksum`,
        })
      }
    }

    const packById = new Map(bundle.sourcePacks.map((pack) => [pack.id, pack]))
    const documentById = new Map(
      bundle.sourceDocuments.map((document) => [document.id, document])
    )
    const itemById = new Map(bundle.sourceItems.map((item) => [item.id, item]))
    for (const document of bundle.sourceDocuments) {
      if (!packById.has(document.sourcePackId)) {
        context.addIssue({
          code: "custom",
          path: ["sourceDocuments"],
          message: `document ${document.id} requires an existing source pack`,
        })
      }
      if (!assetById.has(document.assetId)) {
        context.addIssue({
          code: "custom",
          path: ["sourceDocuments"],
          message: `document ${document.id} requires an existing asset`,
        })
      }
    }
    for (const item of bundle.sourceItems) {
      if (!documentById.has(item.sourceDocumentId)) {
        context.addIssue({
          code: "custom",
          path: ["sourceItems"],
          message: `source item ${item.id} requires an existing document`,
        })
      }
    }
    for (const link of bundle.eventSourceLinks) {
      const item = itemById.get(link.sourceItemId)
      const document = item
        ? documentById.get(item.sourceDocumentId)
        : undefined
      if (!item) {
        context.addIssue({
          code: "custom",
          path: ["eventSourceLinks"],
          message: `source link ${link.id} requires an existing source item`,
        })
      } else if (
        link.sourceDocumentId !== item.sourceDocumentId ||
        !document ||
        link.sourceDocumentChecksum !== document.checksum
      ) {
        context.addIssue({
          code: "custom",
          path: ["eventSourceLinks"],
          message: `source link ${link.id} must pin its source document and checksum`,
        })
      }
      if (link.approvedForJourneySharing && !link.excerpt) {
        context.addIssue({
          code: "custom",
          path: ["eventSourceLinks"],
          message: `shared source link ${link.id} requires an explicit excerpt`,
        })
      }
    }
  })

export type TargetContentBundle = z.infer<typeof targetContentBundleSchema>
