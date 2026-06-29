"use client"

import { useEffect, useState } from "react"
import { listRoutes } from "@/lib/routes/client"
import { useMapStore } from "@/stores/mapStore"
import type { Route } from "@/types/route"
import RouteListItem from "./RouteListItem"

export default function SavedPanel() {
  const setActiveWorkbenchTool = useMapStore(
    (state) => state.setActiveWorkbenchTool
  )
  const sendAgentEvent = useMapStore((state) => state.sendAgentEvent)
  const isDraftLocked = useMapStore((state) => state.isDraftLocked)
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
    setActiveWorkbenchTool("plan")
  }

  if (isLoading) {
    return (
      <div className="text-sm text-[var(--periplus-walnut)]">
        正在加载收藏路线...
      </div>
    )
  }

  if (hasError) {
    return (
      <div className="text-sm text-[var(--periplus-walnut)]">
        保存路线加载失败，请稍后重试
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-black tracking-[0.16em] text-[var(--periplus-teak)] uppercase">
          SAVED
        </p>
        <h2 className="text-2xl leading-tight font-black text-[var(--periplus-ink)]">
          收藏路线
        </h2>
        <p className="mt-1 text-sm leading-6 text-[var(--periplus-walnut)]">
          继续编辑保存过的路线。
        </p>
      </div>
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
          <p className="text-sm text-[var(--periplus-walnut)]">
            暂无收藏路线
          </p>
        )}
      </div>
    </div>
  )
}
