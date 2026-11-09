import type {
  LayerSpecification,
  StyleSpecification,
  VectorSourceSpecification,
} from "maplibre-gl"

// OpenMapTiles land-use classes share a warm palette with the journal surface.
export function journalMapStyle(style: StyleSpecification): StyleSpecification {
  const layers = style.layers.map((layer): LayerSpecification => {
    if (layer.type === "background")
      return {
        ...layer,
        paint: { ...layer.paint, "background-color": "#f4f0e7" },
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
              "#ccdabc",
              "grass",
              "#dfe8cf",
              "farmland",
              "#e8e1b9",
              "wetland",
              "#c8ded3",
              "sand",
              "#f0dfb9",
              "rock",
              "#ddd8d0",
              "#ccdabc",
            ],
          },
        }

      const colors: Record<string, string> = {
        park: "#dde5cf",
        water: "#bcd8d8",
        landcover_wood: "#ccdabc",
        landuse_residential: "#ede7dc",
        building: "#e5e0d5",
        road_area_pier: "#f4f0e7",
        "aeroway-area": "#fffaf3",
      }
      const color = colors[layer.id]
      return color
        ? {
            ...layer,
            paint: {
              ...layer.paint,
              "fill-color": color,
              ...(layer.id === "building"
                ? { "fill-outline-color": "#d4cdbf", "fill-opacity": 0.65 }
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
            ? "#e6bc69"
            : "#edd08d"
          : (layer.id.includes("motorway") || layer.id.includes("major")) &&
              layer.id.includes("casing")
            ? "#cfb579"
            : layer.id === "highway_minor"
              ? "#fffdf7"
              : layer.id === "highway_path"
                ? "#c9c5bd"
                : layer.id === "waterway"
                  ? "#9ec4c9"
                  : layer.id.startsWith("boundary")
                    ? "#a69d8f"
                    : layer.id.includes("casing")
                      ? "#d7ccb9"
                      : layer.id.includes("inner") ||
                          layer.id.includes("dashline")
                        ? "#fffaf3"
                        : layer.id.startsWith("railway")
                          ? "#bdb8ac"
                          : layer.id === "road_pier"
                            ? "#f4f0e7"
                            : layer.id.startsWith("highway") ||
                                layer.id.startsWith("aeroway")
                              ? "#ddd5c5"
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
          "text-color": layer.id.startsWith("water") ? "#345c63" : "#474e43",
          "text-halo-color": "#fffaf3",
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
          "#e3d8ec",
          [
            "hospital",
            "school",
            "university",
            "college",
            "kindergarten",
            "library",
          ],
          "#f0d9de",
          ["industrial", "railway"],
          "#d8dfe5",
          ["parking", "garages"],
          "#e5e3de",
          "cemetery",
          "#d7dfce",
          ["stadium", "pitch", "playground", "track"],
          "#d1e3d3",
          ["theme_park", "zoo"],
          "#dce7cb",
          "#ede7dc",
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
