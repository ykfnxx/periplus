export interface TrackPoint {
  lng: number
  lat: number
  time?: string
  elevation?: number
}

export interface WorkoutTrack {
  name: string
  segments: TrackPoint[][]
  distanceMeters: number
  pointCount: number
}

export const MAX_GPX_BYTES = 64 * 1024 * 1024

export function parseGpx(xml: string, filename: string): WorkoutTrack[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error("不支持包含 DTD 或实体声明的文件")
  const doc = new DOMParser().parseFromString(xml, "application/xml")
  if (
    doc.querySelector("parsererror") ||
    doc.documentElement.localName !== "gpx"
  )
    throw new Error(
      "文件不是有效的 GPX。请先解压 Apple 健康导出包，选择 workout-routes 中的 .gpx 文件。"
    )
  const tracks = Array.from(doc.getElementsByTagNameNS("*", "trk"))
  if (!tracks.length)
    throw new Error("文件没有运动轨迹（trk），请选择实际运动记录的 GPX 文件")
  let totalPoints = 0
  return tracks.map((track, trackIndex) => {
    const segments = Array.from(track.getElementsByTagNameNS("*", "trkseg"))
      .map((segment) =>
        Array.from(segment.getElementsByTagNameNS("*", "trkpt")).map(
          (element): TrackPoint => {
            totalPoints++
            if (totalPoints > 200_000)
              throw new Error(
                "此演示最多预览 200,000 个轨迹点，请选择较短的一次运动"
              )
            const latText = element.getAttribute("lat")
            const lngText = element.getAttribute("lon")
            const lat = Number(latText)
            const lng = Number(lngText)
            if (
              !latText?.trim() ||
              !lngText?.trim() ||
              !Number.isFinite(lat) ||
              !Number.isFinite(lng) ||
              Math.abs(lat) > 90 ||
              Math.abs(lng) > 180
            )
              throw new Error(`第 ${totalPoints} 个点的经纬度无效`)
            const time = element
              .getElementsByTagNameNS("*", "time")[0]
              ?.textContent?.trim()
            if (
              time &&
              (!/(Z|[+-]\d{2}:\d{2})$/i.test(time) ||
                !Number.isFinite(Date.parse(time)))
            )
              throw new Error(`第 ${totalPoints} 个点的时间无效或缺少时区`)
            const elevationText = element
              .getElementsByTagNameNS("*", "ele")[0]
              ?.textContent?.trim()
            const elevation = elevationText ? Number(elevationText) : undefined
            if (elevation !== undefined && !Number.isFinite(elevation))
              throw new Error(`第 ${totalPoints} 个点的海拔无效`)
            return {
              lat,
              lng,
              ...(time ? { time } : {}),
              ...(elevation !== undefined ? { elevation } : {}),
            }
          }
        )
      )
      .filter((segment) => segment.length > 0)
    const pointCount = segments.reduce(
      (sum, segment) => sum + segment.length,
      0
    )
    if (!pointCount) throw new Error(`第 ${trackIndex + 1} 条轨迹没有位置点`)
    let distanceMeters = 0
    for (const segment of segments) {
      for (let i = 1; i < segment.length; i++) {
        const a = segment[i - 1],
          b = segment[i]
        const rad = Math.PI / 180
        const h =
          Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
          Math.cos(a.lat * rad) *
            Math.cos(b.lat * rad) *
            Math.sin(((b.lng - a.lng) * rad) / 2) ** 2
        distanceMeters += 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)))
      }
    }
    const name = Array.from(track.children)
      .find((child) => child.localName === "name")
      ?.textContent?.trim()
    return {
      name:
        name || `${filename}${tracks.length > 1 ? ` · ${trackIndex + 1}` : ""}`,
      segments,
      distanceMeters,
      pointCount,
    }
  })
}
