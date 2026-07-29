import type { ViewportInsets } from "./contracts"

const MAP_SAFE_MARGIN = 80
const WORKBENCH_OCCUPIED_WIDTH = 460
const WORKBENCH_GAP = 20

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

export interface WorkspacePanelRect {
  top: number
  right: number
  bottom: number
  left: number
  width: number
  height: number
}

export interface WorkspaceViewportSize {
  width: number
  height: number
}

export function workspaceViewportInsets(
  workbenchVisible: boolean
): ViewportInsets {
  return workbenchVisible ? WORKBENCH_VIEWPORT_INSETS : FULL_MAP_VIEWPORT_INSETS
}

export function measuredWorkspaceViewportInsets(
  panel: WorkspacePanelRect,
  viewport: WorkspaceViewportSize
): ViewportInsets {
  if (viewport.width < 768) {
    return {
      top: 24,
      right: 24,
      bottom: Math.min(
        viewport.height - 48,
        Math.max(88, Math.ceil(viewport.height - panel.top + WORKBENCH_GAP))
      ),
      left: 24,
    }
  }

  return {
    top: MAP_SAFE_MARGIN,
    right: MAP_SAFE_MARGIN,
    bottom: MAP_SAFE_MARGIN,
    left: Math.min(
      viewport.width - MAP_SAFE_MARGIN,
      Math.max(MAP_SAFE_MARGIN, Math.ceil(panel.right + WORKBENCH_GAP))
    ),
  }
}

// 高德 setFitView 的 avoid 顺序是上、下、左、右，与 CSS inset 顺序不同。
export function toAMapAvoid(
  insets: ViewportInsets
): [number, number, number, number] {
  return [insets.top, insets.bottom, insets.left, insets.right]
}
