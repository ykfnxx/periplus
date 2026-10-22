import { z } from "zod"
import { TARGET_ASSET_KINDS } from "@/modules/data-model/contracts/enums"

export const assetDtoSchema = z.object({
  id: z.string(),
  kind: z.enum(TARGET_ASSET_KINDS),
  url: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  originalName: z.string().nullable(),
  createdAt: z.string(),
  canDelete: z.boolean(),
})
export type AssetDto = z.infer<typeof assetDtoSchema>

export class AssetInputError extends Error {}
export class AssetUploadConflictError extends Error {
  constructor(readonly preserveObject = false) {
    super("Upload ID was already used for a different or deleted resource")
  }
}
export class AssetStorageError extends Error {
  constructor() {
    super("Resource storage is temporarily unavailable")
  }
}
