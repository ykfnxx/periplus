import { z } from "zod"
import {
  TARGET_ASSET_KINDS,
  TARGET_ASSET_VISIBILITIES,
  TARGET_EVENT_ASSET_ROLES,
  TARGET_EVENT_SOURCE_ROLES,
  TARGET_OBSERVATION_KINDS,
  TARGET_OBSERVATION_PHASES,
  TARGET_SOURCE_ITEM_RESOLUTION_STATES,
  TARGET_SOURCE_PACK_STATUSES,
  TARGET_SOURCE_PACK_VISIBILITIES,
} from "./enums"
import { targetActorReferenceSchema } from "./journey"

const idSchema = z.string().trim().min(1)
const dateTimeSchema = z.iso.datetime({ offset: true })

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
  eventId: idSchema,
  assetId: idSchema,
  role: z.enum(TARGET_EVENT_ASSET_ROLES),
  rank: z.number().int().nonnegative(),
  caption: z.string().optional(),
  visibility: z.enum(TARGET_ASSET_VISIBILITIES),
  createdAt: dateTimeSchema,
  retiredRevision: z.number().int().positive().optional(),
})

export const targetEventObservationSchema = z.object({
  id: idSchema,
  eventId: idSchema,
  kind: z.enum(TARGET_OBSERVATION_KINDS),
  phase: z.enum(TARGET_OBSERVATION_PHASES),
  body: z.string().optional(),
  value: z.unknown().optional(),
  observedAt: dateTimeSchema,
  actor: targetActorReferenceSchema,
  supersedesId: idSchema.optional(),
  visibility: z.enum(TARGET_ASSET_VISIBILITIES),
  createdAt: dateTimeSchema,
})

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

export const targetEventSourceLinkSchema = z.object({
  id: idSchema,
  eventId: idSchema,
  sourceItemId: idSchema,
  role: z.enum(TARGET_EVENT_SOURCE_ROLES),
  excerpt: z.string().max(500).optional(),
  page: z.string().optional(),
  confidence: z.number().min(0).max(1),
  rank: z.number().int().nonnegative(),
  approvedForJourneySharing: z.boolean(),
  createdAt: dateTimeSchema,
  retiredRevision: z.number().int().positive().optional(),
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
      if (!itemById.has(link.sourceItemId)) {
        context.addIssue({
          code: "custom",
          path: ["eventSourceLinks"],
          message: `source link ${link.id} requires an existing source item`,
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
