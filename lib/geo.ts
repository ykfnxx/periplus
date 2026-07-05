export const PROXIMITY_KM = 5 // Photos within 5km of a node are considered associated

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function matchPhotosToNode(
  nodeLat: number,
  nodeLng: number,
  photos: Array<{ lat: number; lng: number; id: string; url?: string; imageDataUrl?: string }>
): Array<{ id: string; url: string }> {
  return photos
    .filter((photo) => haversineKm(nodeLat, nodeLng, photo.lat, photo.lng) <= PROXIMITY_KM)
    .map((photo) => ({ id: photo.id, url: photo.url || photo.imageDataUrl || '' }))
}
