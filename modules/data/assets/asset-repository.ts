import { Prisma } from "@prisma/client"
import {
  isAdmin,
  PermissionDeniedError,
  type AuthContext,
} from "@/modules/auth/server/context"
import { prisma } from "@/modules/data/db/prisma"
import { journeyReadScope } from "@/modules/data/journeys/recording-access"
import { AssetUploadConflictError, AssetInUseError } from "./asset-contract"

export const assetOwnerInclude = {
  owner: { select: { id: true, name: true, banned: true } },
} as const
export type AssetRecord = Prisma.AssetGetPayload<{
  include: typeof assetOwnerInclude
}>

export async function lockAssetRows(
  tx: Prisma.TransactionClient,
  assetIds: readonly string[]
) {
  const ids = [...new Set(assetIds)]
  if (!ids.length) return
  // Reference guards lock one Asset at a time. Acquire the complete write set
  // in database ID order first, so opposite photo orders cannot deadlock.
  await tx.$queryRaw`SELECT "id" FROM "Asset" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`
}

export async function findAssetUpload(
  context: AuthContext,
  uploadId: string,
  fingerprint: string,
  candidateKey?: string
) {
  const record = await prisma.asset.findUnique({
    where: { ownerId_uploadId: { ownerId: context.userId, uploadId } },
    include: assetOwnerInclude,
  })
  if (!record) return null
  if (record.deletedAt || record.uploadFingerprint !== fingerprint) {
    throw new AssetUploadConflictError(record.storageKey === candidateKey)
  }
  return record
}

export async function saveAssetUpload(
  context: AuthContext,
  input: {
    storageKey: string
    uploadId: string
    fingerprint: string
    kind: "IMAGE" | "VIDEO" | "AUDIO" | "FILE"
    mimeType: string
    sizeBytes: number
    checksum: string
    originalName?: string
    lat?: number
    lng?: number
  }
) {
  const previous = await findAssetUpload(
    context,
    input.uploadId,
    input.fingerprint
  )
  if (previous) return { asset: previous, created: false }
  try {
    const asset = await prisma.asset.create({
      data: {
        ownerId: context.userId,
        visibility: "PRIVATE",
        storageKey: input.storageKey,
        uploadId: input.uploadId,
        uploadFingerprint: input.fingerprint,
        kind: input.kind,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        checksum: input.checksum,
        originalName: input.originalName,
        lat: input.lat,
        lng: input.lng,
      },
      include: assetOwnerInclude,
    })
    return { asset, created: true }
  } catch (error) {
    // Reconcile unique races and lost commit acknowledgements alike. If the
    // database is unreachable, propagate the original error; the service keeps
    // this attempt's object because its commit outcome is still unknown.
    let receipt: AssetRecord | null
    try {
      receipt = await findAssetUpload(
        context,
        input.uploadId,
        input.fingerprint,
        input.storageKey
      )
    } catch (reconciliationError) {
      if (reconciliationError instanceof AssetUploadConflictError)
        throw reconciliationError
      throw error
    }
    if (receipt)
      return {
        asset: receipt,
        created: receipt.storageKey === input.storageKey,
      }
    throw error
  }
}

export async function listAssetRecords(
  context: AuthContext,
  options: { ownerId?: string; kind?: AssetRecord["kind"] } = {}
) {
  if (
    options.ownerId &&
    options.ownerId !== context.userId &&
    !isAdmin(context)
  ) {
    throw new PermissionDeniedError("Cannot list another user's resources")
  }
  return prisma.asset.findMany({
    where: {
      deletedAt: null,
      ...(options.ownerId
        ? { ownerId: options.ownerId }
        : isAdmin(context)
          ? {}
          : { ownerId: context.userId }),
      ...(options.kind ? { kind: options.kind } : {}),
    },
    include: assetOwnerInclude,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  })
}

export async function getAssetRecord(
  context: AuthContext,
  id: string,
  kind?: AssetRecord["kind"]
) {
  const asset = await prisma.asset.findUnique({
    where: { id },
    include: assetOwnerInclude,
  })
  if (!asset || asset.deletedAt || (kind && asset.kind !== kind)) return null
  if (
    asset.ownerId !== context.userId &&
    !isAdmin(context) &&
    !(await prisma.eventAssetLink.findFirst({
      where: {
        assetId: id,
        journey: { deletedAt: null, ...journeyReadScope(context) },
      },
      select: { id: true },
    }))
  ) {
    throw new PermissionDeniedError("Cannot access another user's resource")
  }
  return asset
}

export async function deleteAsset(context: AuthContext, assetId: string) {
  return prisma.$transaction(async (tx) => {
    // Reference inserts lock this same row in their database guards. Acquire
    // it before inspecting references so attach and soft delete serialize.
    await tx.$queryRaw`SELECT "id" FROM "Asset" WHERE "id" = ${assetId} FOR UPDATE`
    const record = await tx.asset.findUnique({ where: { id: assetId } })
    if (!record) return false
    if (!isAdmin(context) && record.ownerId !== context.userId) {
      throw new PermissionDeniedError("Cannot delete another user's asset")
    }
    if (record.deletedAt) return true

    const activeEventLink = await tx.eventAssetLink.findFirst({
      where: { assetId },
      select: { id: true },
    })
    if (activeEventLink) throw new AssetInUseError()

    await tx.asset.update({
      where: { id: assetId },
      data: { deletedAt: new Date() },
    })
    return true
  })
}
