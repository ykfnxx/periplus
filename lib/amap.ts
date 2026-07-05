import { periplusPublicConfig } from "@/config/periplus"

let amapPromise: Promise<typeof AMap> | null = null

export async function loadAMap(): Promise<typeof AMap> {
  if (!amapPromise) {
    const AMAP_KEY = periplusPublicConfig.amap.key
    if (!AMAP_KEY) {
      throw new Error("AMap key is required in config/periplus.ts")
    }

    // Dynamic import to avoid SSR issues with @amap/amap-jsapi-loader
    // which accesses `window` at module evaluation time
    const AMapLoader = (await import("@amap/amap-jsapi-loader")).default
    amapPromise = AMapLoader.load({
      key: AMAP_KEY,
      version: "2.0",
      plugins: ["AMap.Scale", "AMap.ToolBar"],
    })
  }
  return amapPromise
}

export type AMapInstance = AMap.Map
export type AMapMarker = AMap.Marker
export type AMapPolyline = AMap.Polyline
export type AMapInfoWindow = AMap.InfoWindow
export type AMapLngLat = AMap.LngLat
