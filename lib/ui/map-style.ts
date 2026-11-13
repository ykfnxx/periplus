import type {
  LayerSpecification,
  StyleSpecification,
  VectorSourceSpecification,
} from "maplibre-gl"
import { periplusColors } from "./map-theme"

// Cool mineral-sage cartography separates the map ground from the warm paper workbench.
export function journalMapStyle(style: StyleSpecification): StyleSpecification {
  const layers = style.layers.map((layer): LayerSpecification => {
    if (layer.type === "background")
      return {
        ...layer,
        paint: { ...layer.paint, "background-color": periplusColors.mapLand },
      }
    if (layer.type === "fill") {
      if (layer.id === "landcover_wood")
        return {
          ...layer,
          filter: [
            "match",
            ["get", "class"],
            ["wood", "grass", "farmland", "wetland", "sand", "rock"],
            true,
            false,
          ],
          paint: {
            ...layer.paint,
            "fill-color": [
              "match",
              ["get", "class"],
              "wood",
              "#b0c9ae",
              "grass",
              "#c7dac4",
              "farmland",
              "#d3dec8",
              "wetland",
              "#b8d2cd",
              "sand",
              "#ddd9cb",
              "rock",
              "#cbd3d0",
              "#b0c9ae",
            ],
          },
        }

      const colors: Record<string, string> = {
        park: "#c2d6c0",
        water: "#9fc3d2",
        landcover_wood: "#b0c9ae",
        landuse_residential: "#d4ddd9",
        building: "#c6d1cd",
        road_area_pier: periplusColors.mapLand,
        "aeroway-area": "#e6ecea",
      }
      const color = colors[layer.id]
      return color
        ? {
            ...layer,
            paint: {
              ...layer.paint,
              "fill-color": color,
              ...(layer.id === "building"
                ? { "fill-outline-color": "#b3c0bb", "fill-opacity": 0.68 }
                : {}),
            },
          }
        : layer
    }
    if (layer.type === "line") {
      const color =
        (layer.id.includes("motorway") || layer.id.includes("major")) &&
        !layer.id.includes("casing")
          ? layer.id.includes("motorway")
            ? "#dce6eb"
            : "#f8faf9"
          : (layer.id.includes("motorway") || layer.id.includes("major")) &&
              layer.id.includes("casing")
            ? layer.id.includes("motorway")
              ? "#aebdc4"
              : "#bcc8c3"
            : layer.id === "highway_minor"
              ? "#eef2f0"
              : layer.id === "highway_path"
                ? "#b5c2bd"
                : layer.id === "waterway"
                  ? "#83aebf"
                  : layer.id.startsWith("boundary")
                    ? "#95a49f"
                    : layer.id.includes("casing")
                      ? "#bcc8c3"
                      : layer.id.includes("inner") ||
                          layer.id.includes("dashline")
                        ? "#f8faf9"
                        : layer.id.startsWith("railway")
                          ? "#a8b6b1"
                          : layer.id === "road_pier"
                            ? periplusColors.mapLand
                            : layer.id.startsWith("highway") ||
                                layer.id.startsWith("aeroway")
                              ? "#cdd7d3"
                              : undefined
      return color
        ? { ...layer, paint: { ...layer.paint, "line-color": color } }
        : layer
    }
    if (layer.type === "symbol" && layer.layout?.["text-field"]) {
      return {
        ...layer,
        paint: {
          ...layer.paint,
          "text-color": layer.id.startsWith("water") ? "#3d6878" : "#47524f",
          "text-halo-color": "#eef2f0",
        },
      }
    }
    return layer
  })
  // Land-use fills sit above natural cover and below building footprints and roads.
  layers.splice(
    layers.findIndex((layer) => layer.id === "building"),
    0,
    {
      id: "journal_landuse",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landuse",
      minzoom: 10,
      filter: [
        "match",
        ["get", "class"],
        [
          "commercial",
          "retail",
          "hospital",
          "school",
          "university",
          "college",
          "kindergarten",
          "library",
          "industrial",
          "railway",
          "parking",
          "garages",
          "cemetery",
          "stadium",
          "pitch",
          "playground",
          "track",
          "theme_park",
          "zoo",
        ],
        true,
        false,
      ],
      paint: {
        "fill-color": [
          "match",
          ["get", "class"],
          ["commercial", "retail"],
          "#d8dce6",
          [
            "hospital",
            "school",
            "university",
            "college",
            "kindergarten",
            "library",
          ],
          "#dfd6da",
          ["industrial", "railway"],
          "#cfd8de",
          ["parking", "garages"],
          "#d5ddd9",
          "cemetery",
          "#c7d5c6",
          ["stadium", "pitch", "playground", "track"],
          "#bed4c1",
          ["theme_park", "zoo"],
          "#c5d8c2",
          "#d4ddd9",
        ],
      },
    }
  )
  return {
    ...style,
    sources: {
      ...style.sources,
      openmaptiles: {
        ...(style.sources.openmaptiles as VectorSourceSpecification),
        attribution:
          '<a href="https://openmaptiles.org/" target="_blank">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap</a>',
      },
    },
    layers,
  }
}
