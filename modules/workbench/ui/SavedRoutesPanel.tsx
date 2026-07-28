"use client"

import { useEffect, useState } from "react"
import { listRoutes } from "@/modules/data/routes/client"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import type { Route } from "@/types/route"
import RouteListItem from "@/modules/workbench/ui/RouteListItem"

export default function SavedRoutesPanel() {
  const sendAgentEvent = useWorkspaceStore((state) => state.sendAgentEvent)
  const isDraftLocked = useWorkspaceStore((state) => state.isDraftLocked)
  const setActiveMapPanel = useWorkspaceStore(
    (state) => state.setActiveMapPanel
  )
  const [routes, setRoutes] = useState<Route[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    let mounted = true

    listRoutes()
      .then((savedRoutes) => {
        if (!mounted) return
        setRoutes(savedRoutes)
        setIsLoading(false)
      })
      .catch(() => {
        if (!mounted) return
        setHasError(true)
        setIsLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  const selectRoute = (route: Route) => {
    if (isDraftLocked || !sendAgentEvent) return
    sendAgentEvent("draft.load_saved_route", { routeId: route.id })
    setActiveMapPanel("none")
  }

  if (isLoading) {
    return (
      <div className="text-sm text-[var(--periplus-walnut)]">正在加载...</div>
    )
  }

  if (hasError) {
    return (
      <div className="text-sm text-[var(--periplus-walnut)]">
        保存路线加载失败
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-black text-[var(--periplus-ink)]">
        收藏路线
      </h2>
      <div className="space-y-2">
        {routes.length ? (
          routes.map((route) => (
            <RouteListItem
              key={route.id}
              route={route}
              onSelect={selectRoute}
            />
          ))
        ) : (
          <p className="text-sm text-[var(--periplus-walnut)]">暂无收藏路线</p>
        )}
      </div>
    </div>
  )
}
