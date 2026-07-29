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
      className="scrollbar-hidden flex gap-1 overflow-x-auto border-b border-ink-10 px-4"
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
          selected={
            viewLevel === "city" && activeRouteNodeId === node.id
          }
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
      className={`relative h-11 shrink-0 px-3 text-xs font-bold transition ${
        selected ? "text-russet" : "text-teak hover:text-ink"
      }`}
    >
      {label}
      {selected ? (
        <span className="absolute right-2 bottom-0 left-2 h-0.5 bg-russet" />
      ) : null}
    </button>
  )
}
