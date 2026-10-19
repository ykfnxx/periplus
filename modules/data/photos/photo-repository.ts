import { createHash } from "node:crypto"
import type { AuthContext } from "@/modules/auth/server/context"
import { isAdmin, PermissionDeniedError } from "@/modules/auth/server/context"
import { deleteAsset } from "@/modules/data/content/content-repository"
import { targetAssetSchema } from "@/modules/data-model/contracts"
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
  uploadId: string
  lat?: number
  lng?: number
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

export class PhotoIdempotencyError extends Error {
  constructor() {
    super("Upload ID was already used for a different or deleted photo")
    this.name = "PhotoIdempotencyError"
  }
}

export type PhotoUploadMetadata = Omit<CreatePhotoInput, "storageKey">

function uploadFingerprint(input: PhotoUploadMetadata) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        checksum: input.checksum,
        mimeType: input.mimeType,
        size: input.size,
        originalName: input.originalName ?? null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
      })
    )
    .digest("hex")
}

export async function findPhotoUpload(
  context: AuthContext,
  input: PhotoUploadMetadata
): Promise<PhotoDto | null> {
  const existing = await prisma.asset.findUnique({
    where: {
      ownerId_uploadId: { ownerId: context.userId, uploadId: input.uploadId },
    },
    include: photoInclude,
  })
  if (!existing) return null
  if (
    existing.deletedAt ||
    existing.kind !== "IMAGE" ||
    existing.uploadFingerprint !== uploadFingerprint(input)
  ) {
    throw new PhotoIdempotencyError()
  }
  return mapPhotoToDto(context, existing)
}

export async function listPhotos(context: AuthContext): Promise<PhotoDto[]> {
  const photos = await prisma.asset.findMany({
    where: {
      kind: "IMAGE",
      deletedAt: null,
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
    },
    include: photoInclude,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  })
  return photos.map((photo) => mapPhotoToDto(context, photo))
}

export async function createPhoto(
  context: AuthContext,
  input: CreatePhotoInput
): Promise<{ photo: PhotoDto; created: boolean }> {
  if (!input.uploadId?.trim() || input.uploadId.length > 200)
    throw new PhotoInputError("A stable uploadId is required")
  if ((input.lat === undefined) !== (input.lng === undefined))
    throw new PhotoInputError("Photo coordinates must be supplied together")
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

  const previous = await findPhotoUpload(context, input)
  if (previous) return { photo: previous, created: false }
  const parsed = targetAssetSchema.omit({ id: true, createdAt: true }).parse({
    ownerId: context.userId,
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
  try {
    const photo = await prisma.asset.create({
      data: {
        ownerId: context.userId,
        kind: "IMAGE",
        visibility: "PRIVATE",
        storageKey: parsed.storageKey,
        originalName: parsed.originalName,
        mimeType: parsed.mimeType,
        sizeBytes: parsed.sizeBytes,
        checksum: parsed.checksum,
        lat: parsed.lat,
        lng: parsed.lng,
        uploadId: input.uploadId,
        uploadFingerprint: uploadFingerprint(input),
      },
      include: photoInclude,
    })
    return { photo: mapPhotoToDto(context, photo), created: true }
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      const raced = await findPhotoUpload(context, input)
      if (raced) return { photo: raced, created: false }
    }
    throw error
  }
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
