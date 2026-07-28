"use client"

import { useEffect } from "react"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

export default function LocationSelector() {
  const map = useWorkspaceStore((s) => s.map)
  const isSelectingLocation = useWorkspaceStore((s) => s.isSelectingLocation)

  useEffect(() => {
    if (!map) return

    const mapContainer = map.getContainer()
    if (mapContainer) {
      mapContainer.style.cursor = isSelectingLocation ? "crosshair" : ""
    }

    return () => {
      if (mapContainer) {
        mapContainer.style.cursor = ""
      }
    }
  }, [map, isSelectingLocation])

  return null
}
