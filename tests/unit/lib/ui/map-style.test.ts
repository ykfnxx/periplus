import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import type { StyleSpecification } from "maplibre-gl"
import { journalMapStyle } from "@/lib/ui/map-style"
import { periplusColors } from "@/lib/ui/map-theme"

function toKebabCase(value: string) {
  return value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)
}

describe("journal workbench and map palette", () => {
  it("keeps periplusColors in sync with app/globals.css @theme tokens", () => {
    const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8")
    for (const [key, expected] of Object.entries(periplusColors)) {
      const token = `--color-${toKebabCase(key)}`
      const match = css.match(new RegExp(`${token}:\\s*([^;]+);`))
      expect(match?.[1]?.trim(), `CSS token ${token}`).toBe(expected)
    }
  })

  it("separates cool mineral map ground from warm journal canvas", () => {
    const baseStyle: StyleSpecification = {
      version: 8,
      sources: {
        openmaptiles: {
          type: "vector",
          url: "https://tiles.openfreemap.org/planet",
        },
      },
      layers: [
        { id: "background", type: "background", paint: {} },
        {
          id: "water",
          type: "fill",
          source: "openmaptiles",
          "source-layer": "water",
          paint: {},
        },
        {
          id: "landuse_residential",
          type: "fill",
          source: "openmaptiles",
          "source-layer": "landuse",
          paint: {},
        },
        {
          id: "building",
          type: "fill",
          source: "openmaptiles",
          "source-layer": "building",
          paint: {},
        },
        {
          id: "highway_major_inner",
          type: "line",
          source: "openmaptiles",
          "source-layer": "transportation",
          paint: {},
        },
        {
          id: "place_city",
          type: "symbol",
          source: "openmaptiles",
          "source-layer": "place",
          layout: { "text-field": "{name}" },
          paint: {},
        },
      ],
    }

    const styled = journalMapStyle(baseStyle)
    const byId = Object.fromEntries(
      styled.layers.map((layer) => [layer.id, layer])
    )

    expect(periplusColors.journalCanvas).toBe("#faf8f3")
    expect(periplusColors.mapLand).toBe("#dfe6e3")
    expect(periplusColors.journalCanvas).not.toBe(periplusColors.mapLand)

    expect(byId.background).toMatchObject({
      paint: { "background-color": periplusColors.mapLand },
    })
    expect(byId.water).toMatchObject({
      paint: { "fill-color": "#9fc3d2" },
    })
    expect(byId.landuse_residential).toMatchObject({
      paint: { "fill-color": "#d4ddd9" },
    })
    expect(byId.building).toMatchObject({
      paint: {
        "fill-color": "#c6d1cd",
        "fill-outline-color": "#b3c0bb",
        "fill-opacity": 0.68,
      },
    })
    expect(byId.journal_landuse).toBeDefined()
    expect(
      styled.layers.findIndex((layer) => layer.id === "journal_landuse")
    ).toBeLessThan(styled.layers.findIndex((layer) => layer.id === "building"))
  })
})
