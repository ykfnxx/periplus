import { expect, it } from "vitest"
import { coordinateToWgs84, wgs84ToGcj02, bd09ToGcj02 } from "@/lib/journeys/coordinates"
import { recordingCoordinateToMap } from "@/modules/travelogue/ui/formatting/display"

it("displays legacy GCJ02 and BD09 records at the same WGS84 location without rewriting them", () => {
  const legacy = { lng: 116.40324337854781, lat: 39.90940335390724, coordinateSystem: "GCJ02" as const }
  const copy = { ...legacy }
  const displayed = recordingCoordinateToMap(legacy)
  expect(displayed.lng).toBeCloseTo(116.397, 5)
  expect(displayed.lat).toBeCloseTo(39.908, 5)
  expect(legacy).toEqual(copy)
  const bd = [116.40961642907855, 39.91574447377555] as const
  const [lng, lat] = bd09ToGcj02(...bd)
  const fromBd = coordinateToWgs84(...bd, "BD09")
  expect(fromBd[0]).toBeCloseTo(coordinateToWgs84(lng, lat, "GCJ02")[0], 5)
})

it("preserves new WGS84 picks and coordinates outside China", () => {
  expect(coordinateToWgs84(-0.1276, 51.5072, "WGS84")).toEqual([-0.1276, 51.5072])
  expect(wgs84ToGcj02(-0.1276, 51.5072)).toEqual([-0.1276, 51.5072])
})
