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
