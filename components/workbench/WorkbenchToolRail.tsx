"use client"

import { useMapStore, type WorkbenchTool } from "@/stores/mapStore"

const tools: Array<{ id: WorkbenchTool; label: string }> = [
  { id: "plan", label: "规划" },
  { id: "places", label: "地点" },
  { id: "photos", label: "照片" },
  { id: "saved", label: "收藏" },
]

export default function WorkbenchToolRail() {
  const activeTool = useMapStore((state) => state.activeWorkbenchTool)
  const setActiveTool = useMapStore((state) => state.setActiveWorkbenchTool)

  return (
    <div
      role="tablist"
      aria-label="AI 工作台工具"
      className="mb-2 grid h-8 grid-cols-4 rounded-full border border-[rgb(44_36_22_/_12%)] bg-[var(--periplus-cream)]/70 p-0.5"
    >
      {tools.map((tool) => (
        <button
          key={tool.id}
          type="button"
          role="tab"
          aria-selected={activeTool === tool.id}
          onClick={() => setActiveTool(tool.id)}
          className={`rounded-full text-[11px] font-black transition-colors ${
            activeTool === tool.id
              ? "bg-[var(--periplus-ink)] text-[var(--periplus-soft-white)]"
              : "text-[var(--periplus-walnut)] hover:text-[var(--periplus-russet)]"
          }`}
        >
          {tool.label}
        </button>
      ))}
    </div>
  )
}
