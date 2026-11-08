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
import { PHOTO_MAX_BYTES, PHOTO_SIZE_ERROR, type PhotoDto } from "@/types/photo"
import { AssetInputError } from "@/modules/data/assets/asset-contract"

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
  if (file.size > PHOTO_MAX_BYTES) throw new AssetInputError(PHOTO_SIZE_ERROR)
  if (file.size === 0) throw new AssetInputError("图片文件为空，请重新选择。")
  if (
    !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
      file.type.toLowerCase()
    )
  )
    throw new AssetInputError(
      "不支持此图片格式，请选择 JPEG、PNG、WebP 或 GIF 图片。"
    )
  const result = await uploadResource(
    context,
    {
      source: file.stream(),
      uploadId,
      mimeType: file.type,
      originalName: file.name || undefined,
      sizeBytes: file.size,
      maxBytes: PHOTO_MAX_BYTES,
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
