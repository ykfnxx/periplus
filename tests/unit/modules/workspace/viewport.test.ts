import { describe, expect, it } from "vitest"
import {
  FULL_MAP_VIEWPORT_INSETS,
  measuredWorkspaceViewportInsets,
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

  it("measures the occupied desktop panel width instead of using a constant", () => {
    expect(
      measuredWorkspaceViewportInsets(
        {
          top: 20,
          right: 780,
          bottom: 880,
          left: 20,
          width: 760,
          height: 860,
        },
        { width: 1504, height: 900 }
      )
    ).toEqual({
      top: 80,
      right: 80,
      bottom: 80,
      left: 800,
    })
  })

  it("reserves bottom-sheet height instead of a desktop left inset on mobile", () => {
    expect(
      measuredWorkspaceViewportInsets(
        {
          top: 480,
          right: 390,
          bottom: 844,
          left: 0,
          width: 390,
          height: 364,
        },
        { width: 390, height: 844 }
      )
    ).toEqual({
      top: 24,
      right: 24,
      bottom: 384,
      left: 24,
    })
  })
})
