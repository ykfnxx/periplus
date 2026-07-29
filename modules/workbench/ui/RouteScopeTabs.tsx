"use client"

import { useRef } from "react"
import { sortPathNodes } from "@/lib/routes/path-graph"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

export default function RouteScopeTabs() {
  const railRef = useRef<HTMLDivElement>(null)
  const draftRoute = useWorkspaceStore((state) => state.draftRoute)
  const viewLevel = useWorkspaceStore((state) => state.viewLevel)
  const activeRouteNodeId = useWorkspaceStore(
    (state) => state.activeRouteNodeId
  )
  const enterCityView = useWorkspaceStore((state) => state.enterCityView)
  const returnToOverview = useWorkspaceStore((state) => state.returnToOverview)
  const requestMapFocus = useWorkspaceStore((state) => state.requestMapFocus)

  if (!draftRoute) return null

  const selectOverview = () => {
    if (viewLevel === "overview") return
    returnToOverview()
    requestMapFocus({ type: "active-route", maxZoom: 12 })
  }

  const selectCity = (nodeId: string) => {
    if (viewLevel === "city" && activeRouteNodeId === nodeId) return
    enterCityView(nodeId)
    requestMapFocus({ type: "active-route", maxZoom: 15 })
  }

  return (
    <div
      ref={railRef}
      role="tablist"
      aria-label="行程范围"
      className="scrollbar-hidden flex gap-2 overflow-x-auto pt-4 pb-0.5"
    >
      <ScopeTab
        label="总览"
        selected={viewLevel === "overview"}
        onSelect={selectOverview}
      />
      {sortPathNodes(draftRoute.nodes).map((node) => (
        <ScopeTab
          key={node.id}
          label={node.name}
          selected={viewLevel === "city" && activeRouteNodeId === node.id}
          onSelect={() => selectCity(node.id)}
        />
      ))}
    </div>
  )
}

function ScopeTab({
  label,
  selected,
  onSelect,
}: {
  label: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={`h-[30px] shrink-0 rounded-full px-4 text-[11px] font-black transition ${
        selected
          ? "bg-russet text-ink"
          : "bg-cream text-teak hover:bg-ink hover:text-soft-white"
      }`}
    >
      {label}
    </button>
  )
}
