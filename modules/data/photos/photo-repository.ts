import { isAdmin, type AuthContext } from "@/modules/auth/server/context"
import {
  listAssetRecords,
  type AssetRecord,
} from "@/modules/data/assets/asset-repository"
import {
  assetUrl,
  removeResource,
  uploadResource,
} from "@/modules/data/assets/asset-service"
import type { PhotoDto } from "@/types/photo"

export function photoDto(context: AuthContext, photo: AssetRecord): PhotoDto {
  return {
    id: photo.id,
    ownerId: photo.ownerId,
    ownerName: photo.owner.banned
      ? `${photo.owner.name}（已停用）`
      : photo.owner.name,
    url: assetUrl(photo.id),
    lat: photo.lat,
    lng: photo.lng,
    caption: "",
    createdAt: photo.createdAt.toISOString(),
    updatedAt: photo.createdAt.toISOString(),
    canDelete: isAdmin(context) || photo.ownerId === context.userId,
  }
}

export async function listPhotos(context: AuthContext): Promise<PhotoDto[]> {
  return (await listAssetRecords(context, { kind: "IMAGE" })).map((asset) =>
    photoDto(context, asset)
  )
}
export async function listPhotosForOwner(
  context: AuthContext,
  ownerId: string
): Promise<PhotoDto[]> {
  return (await listAssetRecords(context, { ownerId, kind: "IMAGE" })).map(
    (asset) => photoDto(context, asset)
  )
}
export async function uploadPhotoResource(
  context: AuthContext,
  file: File,
  uploadId: string,
  coordinates: { lat?: number; lng?: number },
  signal?: AbortSignal
) {
  const result = await uploadResource(
    context,
    {
      source: file.stream(),
      uploadId,
      mimeType: file.type,
      originalName: file.name || undefined,
      sizeBytes: file.size,
      maxBytes: 5 * 1024 * 1024,
      requiredKind: "IMAGE",
      ...coordinates,
    },
    signal
  )
  return { photo: photoDto(context, result.asset), created: result.created }
}
export async function deletePhoto(context: AuthContext, id: string) {
  return { deleted: await removeResource(context, id, "IMAGE") }
}
