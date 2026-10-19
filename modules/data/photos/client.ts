import type { PhotoDto, PhotoShare } from "@/types/photo"

export class PhotoApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message)
    this.name = "PhotoApiError"
  }
}

async function parsePhotoResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "照片请求失败"
    throw new PhotoApiError(message, response.status)
  }

  return body as T
}

export async function listPhotos(): Promise<PhotoDto[]> {
  const response = await fetch("/api/photos", { cache: "no-store" })
  return parsePhotoResponse<PhotoDto[]>(response)
}

export async function deletePhoto(id: string): Promise<void> {
  const response = await fetch(`/api/photos/${id}`, { method: "DELETE" })
  await parsePhotoResponse<{ success: true }>(response)
}

export function photoDtoToShare(photo: PhotoDto): PhotoShare | null {
  if (photo.lat === null || photo.lng === null) return null
  return {
    id: photo.id,
    ownerId: photo.ownerId,
    ownerName: photo.ownerName,
    lat: photo.lat,
    lng: photo.lng,
    imageDataUrl: photo.url,
    caption: photo.caption,
    createdAt: Date.parse(photo.createdAt),
    updatedAt: Date.parse(photo.updatedAt),
    canDelete: photo.canDelete,
  }
}
