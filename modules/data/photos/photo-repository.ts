import type { AuthContext } from "@/modules/auth/server/context"
import { isAdmin, PermissionDeniedError } from "@/modules/auth/server/context"
import { prisma } from "@/modules/data/db/prisma"
import type { PhotoDto } from "@/types/photo"

interface PhotoOwnerRecord {
  id: string
  name: string
  banned: boolean | null
}

interface PhotoRecord {
  id: string
  ownerId: string
  owner: PhotoOwnerRecord
  url: string
  lat: number
  lng: number
  caption: string | null
  createdAt: Date
  updatedAt: Date
}

interface CreatePhotoInput {
  filePath: string
  url: string
  lat: number
  lng: number
  caption?: string
  mimeType: string
  size: number
}

function ownerName(owner: PhotoOwnerRecord) {
  return owner.banned ? `${owner.name}（已停用）` : owner.name
}

function mapPhotoToDto(context: AuthContext, photo: PhotoRecord): PhotoDto {
  return {
    id: photo.id,
    ownerId: photo.ownerId,
    ownerName: ownerName(photo.owner),
    url: photo.url,
    lat: photo.lat,
    lng: photo.lng,
    caption: photo.caption ?? "",
    createdAt: photo.createdAt.toISOString(),
    updatedAt: photo.updatedAt.toISOString(),
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
  const photos = await prisma.photo.findMany({
    include: photoInclude,
    orderBy: { createdAt: "desc" },
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

  const photos = await prisma.photo.findMany({
    where: { ownerId },
    include: photoInclude,
    orderBy: { createdAt: "desc" },
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

  const photo = await prisma.photo.create({
    data: {
      ownerId: context.userId,
      filePath: input.filePath,
      url: input.url,
      lat: input.lat,
      lng: input.lng,
      caption: input.caption?.trim() || null,
      mimeType: input.mimeType,
      size: input.size,
    },
    include: photoInclude,
  })

  return mapPhotoToDto(context, photo)
}

export async function updatePhotoCaption(
  context: AuthContext,
  id: string,
  caption: string
): Promise<PhotoDto | null> {
  const existing = await prisma.photo.findUnique({
    where: { id },
    include: photoInclude,
  })
  if (!existing) return null
  if (!isAdmin(context) && existing.ownerId !== context.userId) {
    throw new PermissionDeniedError("Cannot update another user's photo")
  }

  const photo = await prisma.photo.update({
    where: { id },
    data: { caption: caption.trim() || null },
    include: photoInclude,
  })
  return mapPhotoToDto(context, photo)
}

export async function deletePhoto(
  context: AuthContext,
  id: string
): Promise<{ deleted: boolean; filePath?: string }> {
  const existing = await prisma.photo.findUnique({ where: { id } })
  if (!existing) return { deleted: false }
  if (!isAdmin(context) && existing.ownerId !== context.userId) {
    throw new PermissionDeniedError("Cannot delete another user's photo")
  }

  await prisma.photo.delete({ where: { id } })
  return { deleted: true, filePath: existing.filePath }
}
