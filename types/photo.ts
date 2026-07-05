export interface PhotoDto {
  id: string
  ownerId: string
  ownerName: string
  url: string
  lat: number
  lng: number
  caption: string
  createdAt: string
  updatedAt: string
  canDelete: boolean
}
