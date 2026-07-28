import type { ViewportInsets } from "./contracts"

const MAP_SAFE_MARGIN = 80
const WORKBENCH_OCCUPIED_WIDTH = 460

export const FULL_MAP_VIEWPORT_INSETS: ViewportInsets = {
  top: MAP_SAFE_MARGIN,
  right: MAP_SAFE_MARGIN,
  bottom: MAP_SAFE_MARGIN,
  left: MAP_SAFE_MARGIN,
}

export const WORKBENCH_VIEWPORT_INSETS: ViewportInsets = {
  ...FULL_MAP_VIEWPORT_INSETS,
  left: WORKBENCH_OCCUPIED_WIDTH,
}

export function workspaceViewportInsets(
  workbenchVisible: boolean
): ViewportInsets {
  return workbenchVisible ? WORKBENCH_VIEWPORT_INSETS : FULL_MAP_VIEWPORT_INSETS
}

// 高德 setFitView 的 avoid 顺序是上、下、左、右，与 CSS inset 顺序不同。
export function toAMapAvoid(
  insets: ViewportInsets
): [number, number, number, number] {
  return [insets.top, insets.bottom, insets.left, insets.right]
}
