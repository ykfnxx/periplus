export const PHOTO_MAX_BYTES = 64 * 1024 * 1024
export const PHOTO_SIZE_ERROR = "图片过大，单张图片不能超过 64MiB。"

export interface PhotoDto {
  id: string
  ownerId: string
  ownerName: string
  url: string
  lat: number | null
  lng: number | null
  caption: string
  createdAt: string
  updatedAt: string
  canDelete: boolean
}
