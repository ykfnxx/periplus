import {
  LngLatBounds,
  setWorkerUrl,
  type Map,
  type PaddingOptions,
} from "maplibre-gl"

setWorkerUrl(
  new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString()
)

export const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron"

export function fitMapPoints(
  map: Map,
  points: { lng: number; lat: number }[],
  padding: PaddingOptions,
  maxZoom: number
) {
  const bounds = new LngLatBounds()
  for (const point of points) bounds.extend([point.lng, point.lat])
  map.fitBounds(bounds, { padding, maxZoom, duration: 0 })
}
