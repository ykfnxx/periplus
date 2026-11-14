import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import type { StyleSpecification } from "maplibre-gl"
import { journalMapStyle } from "@/lib/ui/map-style"
import { periplusColors } from "@/lib/ui/map-theme"

function toKebabCase(value: string) {
  return value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)
}

function parseHexColor(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "")
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ]
}

function relativeLuminance([r, g, b]: [number, number, number]) {
  const toLinear = (channel: number) => {
    const srgb = channel / 255
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

function contrastRatio(foreground: string, background: string, alpha = 1) {
  const fg = parseHexColor(foreground)
  const bg = parseHexColor(background)
  const blended: [number, number, number] = [
    fg[0] * alpha + bg[0] * (1 - alpha),
    fg[1] * alpha + bg[1] * (1 - alpha),
    fg[2] * alpha + bg[2] * (1 - alpha),
  ]
  const l1 = relativeLuminance(blended)
  const l2 = relativeLuminance(bg)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
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
          id: "park",
          type: "fill",
          source: "openmaptiles",
          "source-layer": "park",
          paint: {},
        },
        {
          id: "landcover_wood",
          type: "fill",
          source: "openmaptiles",
          "source-layer": "landcover",
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

    const woodMatch = (
      byId.landcover_wood as { paint: { "fill-color": unknown[] } }
    ).paint["fill-color"]
    const woodColor = woodMatch[woodMatch.indexOf("wood") + 1] as string
    const mapFillSurfaces = {
      land: (byId.background as { paint: { "background-color": string } })
        .paint["background-color"],
      residential: (
        byId.landuse_residential as { paint: { "fill-color": string } }
      ).paint["fill-color"],
      park: (byId.park as { paint: { "fill-color": string } }).paint[
        "fill-color"
      ],
      wood: woodColor,
      water: (byId.water as { paint: { "fill-color": string } }).paint[
        "fill-color"
      ],
    }

    // Normal and selected route colors must stay >= 3:1 across map fills, including 0.94 line-opacity.
    for (const [surfaceName, surfaceHex] of Object.entries(mapFillSurfaces)) {
      expect(
        contrastRatio(periplusColors.mapRoute, surfaceHex),
        `mapRoute opaque vs ${surfaceName} (${surfaceHex})`
      ).toBeGreaterThanOrEqual(3)
      expect(
        contrastRatio(periplusColors.mapRoute, surfaceHex, 0.94),
        `mapRoute @0.94 vs ${surfaceName} (${surfaceHex})`
      ).toBeGreaterThanOrEqual(3)
      expect(
        contrastRatio(periplusColors.journalTransitAccent, surfaceHex),
        `journalTransitAccent opaque vs ${surfaceName} (${surfaceHex})`
      ).toBeGreaterThanOrEqual(3)
      expect(
        contrastRatio(periplusColors.journalTransitAccent, surfaceHex, 0.94),
        `journalTransitAccent @0.94 vs ${surfaceName} (${surfaceHex})`
      ).toBeGreaterThanOrEqual(3)
    }
  })
})
