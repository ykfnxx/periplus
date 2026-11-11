"use client"

import { useEffect, useRef } from "react"
import { create } from "zustand"
import { Map, NavigationControl, type GeoJSONSource } from "maplibre-gl"
import { FileUp, LocateFixed, Route, X } from "lucide-react"
import "maplibre-gl/dist/maplibre-gl.css"
import { MAP_STYLE, fitMapPoints } from "@/lib/map"
import { journalMapStyle } from "@/lib/ui/map-style"
import { periplusColors } from "@/lib/ui/map-theme"
import { MAX_GPX_BYTES, parseGpx, type WorkoutTrack } from "./gpx"

const useDemo = create<{
  tracks: WorkoutTrack[]
  selected: number
  error: string
  loading: boolean
  mapError: string
  mapReady: boolean
}>(() => ({
  tracks: [],
  selected: 0,
  error: "",
  loading: false,
  mapError: "",
  mapReady: false,
}))

function drawTrack(map: Map, track?: WorkoutTrack) {
  const features: GeoJSON.Feature[] = track
    ? track.segments.map((segment) => ({
        type: "Feature",
        properties: {},
        geometry:
          segment.length === 1
            ? { type: "Point", coordinates: [segment[0].lng, segment[0].lat] }
            : {
                type: "LineString",
                coordinates: segment.map((point) => [point.lng, point.lat]),
              },
      }))
    : []
  ;(map.getSource("workout") as GeoJSONSource).setData({
    type: "FeatureCollection",
    features,
  })
  const points = track?.segments.flat() ?? []
  ;(map.getSource("ends") as GeoJSONSource).setData({
    type: "FeatureCollection",
    features: points.length
      ? [points[0], points[points.length - 1]].map((point, index) => ({
          type: "Feature",
          properties: { label: index ? "终" : "起" },
          geometry: { type: "Point", coordinates: [point.lng, point.lat] },
        }))
      : [],
  })
  if (points.length)
    fitMapPoints(map, points, { top: 65, bottom: 65, left: 65, right: 65 }, 16)
}

export default function RouteDemo() {
  const { tracks, selected, error, loading, mapError, mapReady } = useDemo()
  const track = tracks[selected]
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const generation = useRef(0)

  useEffect(() => {
    const map = new Map({
      container: container.current!,
      style: MAP_STYLE,
      center: [120.15, 30.25],
      zoom: 11,
      transformStyle: (_, next) => journalMapStyle(next),
    })
    mapRef.current = map
    map.addControl(new NavigationControl({ showCompass: false }), "top-right")
    map.on("error", () =>
      useDemo.setState({
        mapError:
          "底图加载失败，请检查网络后刷新。已导入的轨迹仍保留在当前页面。",
      })
    )
    map.on("load", () => {
      map.addSource("workout", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      })
      map.addLayer({
        id: "workout-halo",
        type: "line",
        source: "workout",
        paint: { "line-color": periplusColors.softWhite, "line-width": 8 },
      })
      map.addLayer({
        id: "workout-line",
        type: "line",
        source: "workout",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": periplusColors.mapRoute, "line-width": 4 },
      })
      map.addLayer({
        id: "workout-point",
        type: "circle",
        source: "workout",
        filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-color": periplusColors.mapRoute, "circle-radius": 5 },
      })
      map.addSource("ends", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      })
      map.addLayer({
        id: "ends",
        type: "circle",
        source: "ends",
        paint: {
          "circle-radius": 13,
          "circle-color": periplusColors.softWhite,
          "circle-stroke-width": 2,
          "circle-stroke-color": periplusColors.mapRoute,
        },
      })
      map.addLayer({
        id: "end-labels",
        type: "symbol",
        source: "ends",
        layout: {
          "text-field": ["get", "label"],
          "text-size": 12,
          "text-allow-overlap": true,
        },
        paint: { "text-color": periplusColors.mapRoute },
      })
      const state = useDemo.getState()
      drawTrack(map, state.tracks[state.selected])
      useDemo.setState({ mapReady: true })
    })
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (map?.getSource("workout")) drawTrack(map, track)
  }, [track])

  async function importFile(file: File) {
    const request = ++generation.current
    useDemo.setState({ loading: true, error: "" })
    try {
      if (!file.name.toLowerCase().endsWith(".gpx"))
        throw new Error(
          "请选择 .gpx 文件。Apple 健康 ZIP 请先解压，再打开 workout-routes 文件夹。"
        )
      if (file.size > MAX_GPX_BYTES)
        throw new Error("文件超过 64 MB，请选择单次运动的 GPX 文件")
      const parsed = parseGpx(await file.text(), file.name)
      if (request === generation.current)
        useDemo.setState({ tracks: parsed, selected: 0 })
    } catch (cause) {
      if (request === generation.current)
        useDemo.setState({
          error:
            cause instanceof Error ? cause.message : "文件读取失败，请重新选择",
        })
    } finally {
      if (request === generation.current) useDemo.setState({ loading: false })
    }
  }

  const points = track?.segments.flat() ?? []
  const times = points.flatMap((point) =>
    point.time ? [Date.parse(point.time)] : []
  )
  const timeRange = times.length
    ? times.reduce(
        ([min, max], value) => [Math.min(min, value), Math.max(max, value)],
        [Infinity, -Infinity]
      )
    : undefined
  const timeLabel = (time: number) =>
    new Date(time).toLocaleString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    })

  return (
    <main className="flex min-h-dvh flex-col bg-soft-white text-ink">
      <header className="flex items-center justify-between border-b border-ink-10 px-6 py-4">
        <span className="text-lg font-semibold tracking-tight">
          Periplus{" "}
          <span className="ml-2 text-sm font-normal text-walnut">
            运动轨迹预览
          </span>
        </span>
        <span className="text-xs text-walnut">Apple GPX Demo</span>
      </header>
      <div className="grid flex-1 md:grid-cols-[340px_1fr]">
        <aside className="space-y-6 border-b border-ink-10 p-6 md:border-r md:border-b-0">
          <div>
            <h1 className="text-2xl font-semibold">把走过的路带回来</h1>
            <p className="mt-3 text-sm leading-6 text-walnut">
              选择 Apple 健康导出的运动轨迹，在地图上查看这段旅程。
            </p>
          </div>
          <div
            className="rounded-2xl border border-dashed border-ink-20 bg-white p-5"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              const file = event.dataTransfer.files[0]
              if (file) void importFile(file)
            }}
          >
            <input
              ref={input}
              aria-label="选择 GPX 文件"
              type="file"
              accept=".gpx,application/gpx+xml"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void importFile(file)
                event.target.value = ""
              }}
            />
            <button
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-action px-4 py-3 text-sm font-medium text-white hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-4"
              onClick={() => input.current?.click()}
            >
              <FileUp size={18} />
              {loading ? "正在读取…" : "选择 GPX 文件"}
            </button>
            <p className="mt-3 text-center text-xs text-walnut">
              也可以将文件拖到这里 · 最大 64 MB
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-coral">
              {error}
              {track ? "（仍显示上次成功导入的轨迹）" : ""}
            </p>
          )}
          {track ? (
            <section className="space-y-4" aria-label="轨迹详情">
              <div className="flex items-start justify-between gap-3">
                <h2 className="min-w-0 font-semibold break-words">
                  {track.name}
                </h2>
                <button
                  aria-label="清除轨迹"
                  className="shrink-0 rounded p-1 hover:bg-ink-5"
                  onClick={() => {
                    generation.current++
                    useDemo.setState({
                      tracks: [],
                      selected: 0,
                      error: "",
                      loading: false,
                    })
                  }}
                >
                  <X size={18} />
                </button>
              </div>
              {tracks.length > 1 && (
                <select
                  aria-label="选择运动轨迹"
                  className="w-full rounded border border-ink-20 bg-white p-2"
                  value={selected}
                  onChange={(event) =>
                    useDemo.setState({ selected: Number(event.target.value) })
                  }
                >
                  {tracks.map((item, index) => (
                    <option key={index} value={index}>
                      {item.name}
                    </option>
                  ))}
                </select>
              )}
              <div className="rounded-xl bg-cream p-4">
                <span className="text-3xl font-semibold tabular-nums">
                  {(track.distanceMeters / 1000).toFixed(2)}
                </span>
                <span className="ml-2 text-sm text-walnut">km</span>
                <p className="mt-1 text-xs text-walnut">
                  根据各段 GPS 点估算，不跨断点连线
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-walnut">轨迹点</dt>
                  <dd className="mt-1 font-medium">
                    {track.pointCount.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-walnut">独立分段</dt>
                  <dd className="mt-1 font-medium">{track.segments.length}</dd>
                </div>
              </dl>
              <p className="text-sm leading-6 text-walnut">
                {timeRange
                  ? `${timeLabel(timeRange[0])} — ${timeLabel(timeRange[1])}${times.length < points.length ? "（部分点缺少时间）" : ""}`
                  : "文件未提供时间"}
              </p>
              <button
                className="flex items-center gap-2 rounded-lg border border-ink-20 px-3 py-2 text-sm hover:bg-ink-5"
                onClick={() => {
                  if (mapRef.current?.getSource("workout"))
                    drawTrack(mapRef.current, track)
                }}
              >
                <LocateFixed size={16} />
                查看完整路线
              </button>
            </section>
          ) : (
            <div className="flex items-center gap-3 text-sm text-walnut">
              <Route size={22} />
              <span>尚未导入轨迹</span>
            </div>
          )}
          <details className="text-sm leading-6 text-walnut">
            <summary className="cursor-pointer">
              如何从 Apple 健康取得文件
            </summary>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>健康 App → 个人头像 → 导出所有健康数据。</li>
              <li>解压导出的 ZIP，找到 workout-routes 文件夹。</li>
              <li>选择其中一次运动的 .gpx 文件；室内运动可能没有路线。</li>
            </ol>
          </details>
          <p className="text-xs leading-5 text-walnut">
            文件仅在此浏览器内读取，不上传、不保存；刷新即清除。底图由
            OpenFreeMap 在线提供。
          </p>
        </aside>
        <section
          className="relative min-h-[55dvh] md:min-h-[calc(100dvh-73px)]"
          aria-label="运动轨迹地图"
        >
          <div ref={container} style={{ position: "absolute", inset: 0 }} />
          {!mapReady && !mapError && (
            <p
              role="status"
              className="absolute top-4 left-4 rounded-lg bg-soft-white px-4 py-2 text-sm text-walnut shadow-periplus"
            >
              正在加载底图…
            </p>
          )}
          {mapError && (
            <p
              role="alert"
              className="absolute top-4 left-4 max-w-sm rounded-lg bg-soft-white p-3 text-sm text-coral shadow-periplus"
            >
              {mapError}
            </p>
          )}
        </section>
      </div>
    </main>
  )
}
