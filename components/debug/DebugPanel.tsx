"use client"

import { useState } from "react"
import { useMapStore } from "@/stores/mapStore"

const EXAMPLE_JSON = `[
  {"name": "北京", "lat": 39.9042, "lng": 116.4074},
  {"name": "西安", "lat": 34.3416, "lng": 108.9398},
  {"name": "成都", "lat": 30.5728, "lng": 104.0668}
]`

export default function DebugPanel() {
  const [jsonInput, setJsonInput] = useState(EXAMPLE_JSON)
  const [error, setError] = useState("")
  const setCurrentRoute = useMapStore((s) => s.setCurrentRoute)

  const handleDraw = () => {
    setError("")

    try {
      const parsed = JSON.parse(jsonInput)

      if (!Array.isArray(parsed)) {
        setError("输入必须是 JSON 数组")
        return
      }

      if (parsed.length === 0) {
        setError("数组不能为空")
        return
      }

      for (const item of parsed) {
        if (typeof item.name !== "string") {
          setError(`缺少 name 字段: ${JSON.stringify(item)}`)
          return
        }
        if (typeof item.lat !== "number" || item.lat < -90 || item.lat > 90) {
          setError(`纬度无效: ${item.lat}`)
          return
        }
        if (typeof item.lng !== "number" || item.lng < -180 || item.lng > 180) {
          setError(`经度无效: ${item.lng}`)
          return
        }
      }

      const route = {
        id: `debug-${Date.now()}`,
        ownerId: "debug",
        name: "调试路线",
        description: "通过坐标调试工具创建",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        points: parsed.map(
          (p: { name: string; lat: number; lng: number }, i: number) => ({
            id: `debug-p-${i}`,
            name: p.name,
            lat: p.lat,
            lng: p.lng,
            order: i,
          })
        ),
      }

      setCurrentRoute(route)
    } catch (e) {
      setError(`JSON 解析错误: ${e instanceof Error ? e.message : "未知错误"}`)
    }
  }

  const handleClear = () => {
    setCurrentRoute(null)
    setError("")
  }

  return (
    <div className="w-full max-w-md space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium">
          输入 JSON 坐标数组：
        </label>
        <textarea
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
          className="h-48 w-full resize-none rounded-lg border px-3 py-2 font-mono text-sm"
          placeholder='[{"name":"A","lat":x,"lng":y}, ...]'
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
      <div className="flex gap-3">
        <button
          onClick={handleDraw}
          className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          绘制轨迹
        </button>
        <button
          onClick={handleClear}
          className="flex-1 rounded-lg bg-slate-100 px-4 py-2 hover:bg-slate-200"
        >
          清空
        </button>
      </div>
    </div>
  )
}
