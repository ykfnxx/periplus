import { describe, expect, it, vi } from "vitest"
import { scrollPlanChoicesHorizontally } from "@/modules/workbench/ui/scroll-plan-choices"

function scroller(scrollLeft = 0) {
  const element = document.createElement("div")
  Object.defineProperties(element, {
    scrollWidth: { value: 500 },
    clientWidth: { value: 200 },
    scrollLeft: { value: scrollLeft, writable: true },
    scrollTo: { value: vi.fn() },
  })
  return element
}

function wheelEvent(deltaY: number) {
  return {
    deltaX: 0,
    deltaY,
    preventDefault: vi.fn(),
  } as unknown as WheelEvent
}

describe("Transit plan choice wheel scrolling", () => {
  it("smoothly scrolls only the plan strip receiving the wheel event", () => {
    const target = scroller()
    const other = scroller(45)
    const event = wheelEvent(80)

    scrollPlanChoicesHorizontally(target, event)

    expect(target.scrollTo).toHaveBeenCalledWith({
      left: 80,
      behavior: "smooth",
    })
    expect(other.scrollTo).not.toHaveBeenCalled()
    expect(other.scrollLeft).toBe(45)
    expect(event.preventDefault).toHaveBeenCalledOnce()
  })

  it("keeps the wheel isolated from the preview at either boundary", () => {
    for (const [scrollLeft, delta] of [
      [0, -80],
      [300, 80],
    ] as const) {
      const target = scroller(scrollLeft)
      const event = wheelEvent(delta)

      scrollPlanChoicesHorizontally(target, event)

      expect(target.scrollTo).not.toHaveBeenCalled()
      expect(event.preventDefault).toHaveBeenCalledOnce()
    }
  })
})
