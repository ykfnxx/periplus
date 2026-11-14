import { createStore } from "zustand/vanilla"
export type MapViewport = { lat: number; lng: number; zoom: number }
// 页面切换保留个人地图视角；不保存内容副本，也不写入游记。
export const atlasViewStore = createStore(() => ({
  viewport: null as MapViewport | null,
}))
