"use client"

import { useState } from "react"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import type { DraftJourney } from "@/types/journey"

const EXAMPLE_JSON = `[
  {"name": "北京", "lat": 39.9042, "lng": 116.4074},
  {"name": "西安", "lat": 34.3416, "lng": 108.9398},
  {"name": "成都", "lat": 30.5728, "lng": 104.0668}
]`

export default function DebugPanel() {
  const [jsonInput, setJsonInput] = useState(EXAMPLE_JSON)
  const [error, setError] = useState("")
  const setDraftJourney = useWorkspaceStore((state) => state.setDraftJourney)

  const handleDraw = () => {
    setError("")
    try {
      const parsed: unknown = JSON.parse(jsonInput)
      if (!Array.isArray(parsed) || parsed.length === 0) {
        setError("输入必须是非空 JSON 数组")
        return
      }
      const points: Array<{ name: string; lat: number; lng: number }> = []
      for (const item of parsed) {
        if (!item || typeof item !== "object") {
          setError("每一项必须是坐标对象")
          return
        }
        const point = item as Record<string, unknown>
        if (typeof point.name !== "string") {
          setError(`缺少 name 字段: ${JSON.stringify(item)}`)
          return
        }
        if (
          typeof point.lat !== "number" ||
          point.lat < -90 ||
          point.lat > 90
        ) {
          setError(`纬度无效: ${String(point.lat)}`)
          return
        }
        if (
          typeof point.lng !== "number" ||
          point.lng < -180 ||
          point.lng > 180
        ) {
          setError(`经度无效: ${String(point.lng)}`)
          return
        }
        points.push({ name: point.name, lat: point.lat, lng: point.lng })
      }

      const journeyId = `debug-${Date.now()}`
      const eventIds = points.map((_, index) => `${journeyId}-event-${index}`)
      const journey: DraftJourney = {
        id: journeyId,
        title: "调试路线",
        description: "通过坐标调试工具创建",
        status: "DRAFT",
        events: points.map((point, index) => ({
          id: eventIds[index],
          type: "VISIT",
          origin: "USER_INSERTED",
          executionStatus: "PLANNED",
          title: point.name,
          detail: { plannedLat: point.lat, plannedLng: point.lng },
        })),
        links: eventIds.slice(1).map((toEventId, index) => ({
          id: `${journeyId}-link-${index}`,
          fromEventId: eventIds[index],
          toEventId,
          kind: "MAIN",
        })),
      }
      setDraftJourney(journey)
    } catch (caught) {
      setError(
        `JSON 解析错误: ${caught instanceof Error ? caught.message : "未知错误"}`
      )
    }
  }

  return (
    <div className="w-full max-w-md space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-walnut">
          输入 JSON 坐标数组：
        </label>
        <textarea
          value={jsonInput}
          onChange={(event) => setJsonInput(event.target.value)}
          className="h-48 w-full resize-none rounded-lg border border-ink-15 bg-soft-white px-3 py-2 font-mono text-sm text-ink"
          placeholder='[{"name":"A","lat":x,"lng":y}, ...]'
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleDraw}
          className="flex-1 rounded-lg bg-russet px-4 py-2 text-soft-white hover:bg-ink"
        >
          绘制轨迹
        </button>
        <button
          type="button"
          onClick={() => {
            setDraftJourney(null)
            setError("")
          }}
          className="flex-1 rounded-lg bg-cream px-4 py-2 text-ink hover:bg-ink-10"
        >
          清空
        </button>
      </div>
    </div>
  )
}
