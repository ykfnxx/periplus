import AMapLoader from '@amap/amap-jsapi-loader';

const AMAP_KEY = process.env.NEXT_PUBLIC_AMAP_KEY || '';

export async function loadAMap(): Promise<typeof AMap> {
  return AMapLoader.load({
    key: AMAP_KEY,
    version: '2.0',
    plugins: ['AMap.Scale', 'AMap.ToolBar'],
  });
}

export type AMapInstance = AMap.Map;
export type AMapMarker = AMap.Marker;
export type AMapPolyline = AMap.Polyline;
export type AMapInfoWindow = AMap.InfoWindow;
export type AMapLngLat = AMap.LngLat;
