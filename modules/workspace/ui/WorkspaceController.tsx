"use client"

import { useCallback } from "react"
import type { MapIntent } from "@/modules/workspace/contracts"
import { selectWorkspaceJourney } from "@/modules/workspace/state/selectors"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import AgentSync from "@/modules/workbench/ui/AgentSync"

export function dispatchMapIntent(intent: MapIntent) {
  const state = useWorkspaceStore.getState()
  if (intent.type === "map.background-clicked") {
    state.setActiveMapPanel("none")
    state.setHoveredEventId(null)
    state.selectEvent(null)
    return
  }
  if (
    intent.type === "map.event-selected" ||
    intent.type === "map.transit-selected" ||
    intent.type === "map.event-hovered" ||
    intent.type === "map.event-hover-cleared"
  ) {
    const event = selectWorkspaceJourney(state)?.events.find(
      (candidate) => candidate.id === intent.eventId
    )
    if (!event) return
    if (intent.type === "map.event-hover-cleared") {
      if (state.hoveredEventId === event.id) state.setHoveredEventId(null)
      return
    }
    if (intent.type === "map.event-hovered") {
      state.setHoveredEventId(event.id)
      return
    }
    state.setWorkbenchTab("preview")
    state.selectEvent(event.id, "anchor" in intent ? intent.anchor : undefined)
    state.requestMapFocus(
      event.category === "TRANSIT"
        ? { type: "transit", eventId: event.id, maxZoom: 14 }
        : { type: "event", eventId: event.id, zoom: 15 }
    )
  }
}

export function useWorkspaceController() {
  const handleMapIntent = useCallback(
    (intent: MapIntent) => dispatchMapIntent(intent),
    []
  )
  return { handleMapIntent }
}

export default function WorkspaceController() {
  return <AgentSync />
}
