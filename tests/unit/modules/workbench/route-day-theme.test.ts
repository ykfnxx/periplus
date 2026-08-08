import { describe, expect, it } from "vitest"
import { getRouteDayColor, periplusColors } from "@/lib/ui/map-theme"
import { routeDayTone } from "@/modules/workbench/ui/route-day-theme"

describe("route day themes", () => {
  it("keeps the first ten journey days visually distinct", () => {
    const tones = Array.from({ length: 10 }, (_, index) => routeDayTone(index))
    const mapColors = Array.from({ length: 10 }, (_, index) =>
      getRouteDayColor(index)
    )

    expect(new Set(tones.map((tone) => tone.id)).size).toBe(10)
    expect(new Set(mapColors).size).toBe(10)
    expect(routeDayTone(4).id).not.toBe(routeDayTone(0).id)
    expect(getRouteDayColor(4)).not.toBe(getRouteDayColor(0))
  })

  it("uses teak consistently for unscheduled UI and map markers", () => {
    expect(routeDayTone(null)).toMatchObject({
      id: "unscheduled",
      marker: "bg-teak",
      line: "bg-teak/30",
      tabSelected: "bg-teak text-soft-white",
    })
    expect(getRouteDayColor(null)).toBe(periplusColors.teak)
  })
})
