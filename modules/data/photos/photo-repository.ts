import type { AuthContext } from "@/modules/auth/server/context"
import { isAdmin, PermissionDeniedError } from "@/modules/auth/server/context"
import {
  createAsset,
  deleteAsset,
} from "@/modules/data/content/content-repository"
import { prisma } from "@/modules/data/db/prisma"
import {
  privatePhotoExtension,
  privatePhotoFilePath,
} from "@/modules/data/photos/photo-storage"
import type { PhotoDto } from "@/types/photo"

interface PhotoOwnerRecord {
  id: string
  name: string
  banned: boolean | null
}

interface PhotoAssetRecord {
  id: string
  ownerId: string
  owner: PhotoOwnerRecord
  storageKey: string
  lat: number | null
  lng: number | null
  createdAt: Date
}

interface CreatePhotoInput {
  storageKey: string
  lat: number
  lng: number
  caption?: string
  mimeType: string
  size: number
  checksum: string
  originalName?: string
}

function ownerName(owner: PhotoOwnerRecord) {
  return owner.banned ? `${owner.name}（已停用）` : owner.name
}

function mapPhotoToDto(
  context: AuthContext,
  photo: PhotoAssetRecord
): PhotoDto {
  if (photo.lat === null || photo.lng === null) {
    throw new PhotoInputError(`Image Asset ${photo.id} has no location`)
  }
  return {
    id: photo.id,
    ownerId: photo.ownerId,
    ownerName: ownerName(photo.owner),
    url: `/api/photos/${encodeURIComponent(photo.id)}/file`,
    lat: photo.lat,
    lng: photo.lng,
    caption: "",
    createdAt: photo.createdAt.toISOString(),
    updatedAt: photo.createdAt.toISOString(),
    canDelete: isAdmin(context) || photo.ownerId === context.userId,
  }
}

const photoInclude = {
  owner: {
    select: {
      id: true,
      name: true,
      banned: true,
    },
  },
}

export class PhotoInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PhotoInputError"
  }
}

export async function listPhotos(context: AuthContext): Promise<PhotoDto[]> {
  const photos = await prisma.asset.findMany({
    where: {
      kind: "IMAGE",
      deletedAt: null,
      lat: { not: null },
      lng: { not: null },
      ...(isAdmin(context) ? {} : { ownerId: context.userId }),
    },
    include: photoInclude,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  })
  return photos.map((photo) => mapPhotoToDto(context, photo))
}

export async function listPhotosForOwner(
  context: AuthContext,
  ownerId: string
): Promise<PhotoDto[]> {
  if (!isAdmin(context) && context.userId !== ownerId) {
    throw new PermissionDeniedError("Cannot list another user's photos")
  }

  const photos = await prisma.asset.findMany({
    where: {
      ownerId,
      kind: "IMAGE",
      deletedAt: null,
      lat: { not: null },
      lng: { not: null },
    },
    include: photoInclude,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  })
  return photos.map((photo) => mapPhotoToDto(context, photo))
}

export async function createPhoto(
  context: AuthContext,
  input: CreatePhotoInput
): Promise<PhotoDto> {
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) {
    throw new PhotoInputError("Invalid photo location")
  }
  if (input.caption?.trim()) {
    throw new PhotoInputError(
      "Photo captions are stored on EventAssetLink after attaching the Asset"
    )
  }
  const extension = privatePhotoExtension(input.mimeType)
  if (!extension) {
    throw new PhotoInputError("Unsupported photo MIME type")
  }
  try {
    privatePhotoFilePath(input.storageKey)
  } catch {
    throw new PhotoInputError("Photo storage key must use private storage")
  }
  if (!input.storageKey.endsWith(`.${extension}`)) {
    throw new PhotoInputError("Photo storage key must match its MIME type")
  }

  const asset = await createAsset(context, {
    kind: "IMAGE",
    visibility: "PRIVATE",
    storageKey: input.storageKey,
    originalName: input.originalName,
    mimeType: input.mimeType,
    sizeBytes: input.size,
    checksum: input.checksum,
    lat: input.lat,
    lng: input.lng,
  })
  const photo = await prisma.asset.findUniqueOrThrow({
    where: { id: asset.id },
    include: photoInclude,
  })
  return mapPhotoToDto(context, photo)
}

export async function getPhotoFile(
  context: AuthContext,
  id: string
): Promise<{
  storageKey: string
  mimeType: string
} | null> {
  const photo = await prisma.asset.findUnique({
    where: { id, kind: "IMAGE", deletedAt: null },
    select: {
      ownerId: true,
      storageKey: true,
      mimeType: true,
    },
  })
  if (!photo) return null
  if (!isAdmin(context) && photo.ownerId !== context.userId) {
    throw new PermissionDeniedError("Cannot read another user's photo")
  }
  return {
    storageKey: photo.storageKey,
    mimeType: photo.mimeType,
  }
}

export async function updatePhotoCaption(
  context: AuthContext,
  id: string,
  caption: string
): Promise<PhotoDto | null> {
  const existing = await prisma.asset.findUnique({
    where: { id, kind: "IMAGE", deletedAt: null },
    include: photoInclude,
  })
  if (!existing) return null
  if (!isAdmin(context) && existing.ownerId !== context.userId) {
    throw new PermissionDeniedError("Cannot update another user's photo")
  }
  if (caption.trim()) {
    throw new PhotoInputError(
      "Asset has no global caption; update the EventAssetLink caption"
    )
  }
  return mapPhotoToDto(context, existing)
}

export async function deletePhoto(
  context: AuthContext,
  id: string
): Promise<{ deleted: boolean }> {
  const existing = await prisma.asset.findUnique({ where: { id } })
  if (!existing || existing.kind !== "IMAGE" || existing.deletedAt) {
    return { deleted: false }
  }
  if (!isAdmin(context) && existing.ownerId !== context.userId) {
    throw new PermissionDeniedError("Cannot delete another user's photo")
  }

  await deleteAsset(context, id)
  return { deleted: true }
}
