import AMapLoader from '@amap/amap-jsapi-loader';

const AMAP_KEY = process.env.NEXT_PUBLIC_AMAP_KEY;

if (!AMAP_KEY) {
  throw new Error(
    'NEXT_PUBLIC_AMAP_KEY is required but not set. Please add it to .env.local'
  );
}

// TypeScript now knows AMAP_KEY is non-null after the guard above
const AMAP_KEY_STRING: string = AMAP_KEY;

let amapPromise: Promise<typeof AMap> | null = null;

export async function loadAMap(): Promise<typeof AMap> {
  if (!amapPromise) {
    amapPromise = AMapLoader.load({
      key: AMAP_KEY_STRING,
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
