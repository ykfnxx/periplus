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

export interface PhotoShare {
  id: string
  ownerId: string
  ownerName: string
  lat: number
  lng: number
  imageDataUrl: string
  caption: string
  createdAt: number
  updatedAt?: number
  canDelete: boolean
}
