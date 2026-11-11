import { describe, expect, it } from "vitest"
import { parseGpx } from "@/app/demo/apple-route/gpx"

const gpx = (body: string) =>
  `<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1"><trk>${body}</trk></gpx>`

describe("Apple GPX import", () => {
  it("preserves WGS84, timestamps, elevation and disconnected segments", () => {
    const [track] = parseGpx(
      gpx(
        '<name>Morning walk</name><trkseg><trkpt lat="30" lon="120"><ele>0</ele><time>2026-11-11T01:00:00Z</time></trkpt><trkpt lat="30.001" lon="120"/></trkseg><trkseg><trkpt lat="40" lon="116"/></trkseg>'
      ),
      "route.gpx"
    )
    expect(track.segments).toHaveLength(2)
    expect(track.segments[0][0]).toEqual({
      lat: 30,
      lng: 120,
      elevation: 0,
      time: "2026-11-11T01:00:00Z",
    })
    expect(track.pointCount).toBe(3)
    expect(track.distanceMeters).toBeCloseTo(111.195, 2)
  })
  it("accepts namespaced tracks and separate workouts without inventing missing measurements", () => {
    const tracks = parseGpx(
      '<g:gpx xmlns:g="http://www.topografix.com/GPX/1/1"><g:trk><g:trkseg><g:trkpt lat="0" lon="0"/></g:trkseg></g:trk><g:trk><g:trkseg><g:trkpt lat="1" lon="1"/></g:trkseg></g:trk></g:gpx>',
      "two.gpx"
    )
    expect(tracks).toHaveLength(2)
    expect(tracks[0].segments[0][0]).toEqual({ lat: 0, lng: 0 })
    expect(tracks[0].distanceMeters).toBe(0)
  })
  it.each([
    "<gpx",
    "<HealthData/>",
    "<gpx><rte/></gpx>",
    gpx("<trkseg/>"),
    gpx('<trkseg><trkpt lon="120"/></trkseg>'),
    gpx('<trkseg><trkpt lat="91" lon="120"/></trkseg>'),
    gpx(
      '<trkseg><trkpt lat="30" lon="120"><time>2026-11-11T10:00:00</time></trkpt></trkseg>'
    ),
    "<!DOCTYPE gpx><gpx/>",
  ])("rejects invalid or non-track input: %s", (xml) => {
    expect(() => parseGpx(xml, "invalid.gpx")).toThrow()
  })
})
