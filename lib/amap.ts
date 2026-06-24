let amapPromise: Promise<typeof AMap> | null = null;

export async function loadAMap(): Promise<typeof AMap> {
  if (!amapPromise) {
    const AMAP_KEY = process.env.NEXT_PUBLIC_AMAP_KEY;
    if (!AMAP_KEY) {
      throw new Error(
        'NEXT_PUBLIC_AMAP_KEY is required but not set. Please add it to .env.local'
      );
    }

    // Dynamic import to avoid SSR issues with @amap/amap-jsapi-loader
    // which accesses `window` at module evaluation time
    const AMapLoader = (await import('@amap/amap-jsapi-loader')).default;
    amapPromise = AMapLoader.load({
      key: AMAP_KEY,
      version: '2.0',
      plugins: ['AMap.Scale', 'AMap.ToolBar'],
    });
  }
  return amapPromise;
}

export type AMapInstance = AMap.Map;
export type AMapMarker = AMap.Marker;
export type AMapPolyline = AMap.Polyline;
export type AMapInfoWindow = AMap.InfoWindow;
export type AMapLngLat = AMap.LngLat;
