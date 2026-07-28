"use client"

import { useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { silkRoadRoute } from "@/lib/mock-routes"

export default function MapRouteLoader() {
  const searchParams = useSearchParams()
  const routeId = searchParams.get("route")
  const sendAgentEvent = useWorkspaceStore((s) => s.sendAgentEvent)

  useEffect(() => {
    if (!sendAgentEvent || !routeId) return

    if (routeId === "preset-silk-road") {
      sendAgentEvent("draft.replace", { route: silkRoadRoute })
    } else {
      sendAgentEvent("draft.load_saved_route", { routeId })
    }
  }, [routeId, sendAgentEvent])

  return null
}
