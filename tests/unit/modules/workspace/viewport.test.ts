import { describe, expect, it } from "vitest"
import {
  FULL_MAP_VIEWPORT_INSETS,
  toAMapAvoid,
  WORKBENCH_VIEWPORT_INSETS,
  workspaceViewportInsets,
} from "@/modules/workspace/viewport"

describe("workspace viewport", () => {
  it("reserves the workbench area without changing the map surface", () => {
    expect(workspaceViewportInsets(true)).toBe(WORKBENCH_VIEWPORT_INSETS)
    expect(WORKBENCH_VIEWPORT_INSETS.left).toBeGreaterThan(
      WORKBENCH_VIEWPORT_INSETS.right
    )
  })

  it("uses symmetric safe margins when the workbench is hidden", () => {
    expect(workspaceViewportInsets(false)).toBe(FULL_MAP_VIEWPORT_INSETS)
    expect(FULL_MAP_VIEWPORT_INSETS.left).toBe(FULL_MAP_VIEWPORT_INSETS.right)
  })

  it("converts CSS inset order to the AMap avoid order", () => {
    expect(toAMapAvoid({ top: 10, right: 20, bottom: 30, left: 40 })).toEqual([
      10, 30, 40, 20,
    ])
  })
})
