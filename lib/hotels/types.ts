export const HOTEL_PLACE_TYPES = [
  "城市",
  "机场",
  "景点",
  "火车站",
  "地铁站",
  "酒店",
  "区/县",
  "详细地址",
] as const

export type HotelPlaceType = (typeof HOTEL_PLACE_TYPES)[number]

export interface HotelSearchInput {
  originQuery: string
  place: string
  placeType: HotelPlaceType
  countryCode?: string
  checkInDate?: string
  stayNights?: number
  adultCount?: number
  size?: number
}

export interface HotelStartingPrice {
  amount: number
  currency: string
}

export interface HotelCandidate {
  candidateId: string
  provider: "rollinggo"
  providerHotelId: string
  name: string
  address?: string
  coordinates: { lat: number; lng: number }
  startingPrice?: HotelStartingPrice
  imageUrl?: string
  externalUrl?: string
  fetchedAt: string
}

export interface HotelProviderWarning {
  provider: "rollinggo"
  code: "timeout" | "provider_error" | "quota_exceeded"
  message: string
}

export interface HotelSearchResponse {
  candidates: HotelCandidate[]
  warnings: HotelProviderWarning[]
}
