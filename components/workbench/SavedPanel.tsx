"use client"

import { useEffect, useState } from "react"
import { listRoutes } from "@/lib/routes/client"
import { useMapStore } from "@/stores/mapStore"
import type { Route } from "@/types/route"
import RouteListItem from "./RouteListItem"

interface SavedPanelProps {
  searchQuery: string
}

function matchesRoute(route: Route, query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true

  const searchable = [
    route.name,
    route.description ?? "",
    ...route.points.flatMap((point) => [point.name, point.notes ?? ""]),
  ]
    .join(" ")
    .toLowerCase()

  return searchable.includes(normalized)
}

export default function SavedPanel({ searchQuery }: SavedPanelProps) {
  const setCurrentRoute = useMapStore((state) => state.setCurrentRoute)
  const setActiveWorkbenchTab = useMapStore(
    (state) => state.setActiveWorkbenchTab
  )
  const [routes, setRoutes] = useState<Route[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const filteredRoutes = routes.filter((route) =>
    matchesRoute(route, searchQuery)
  )

  useEffect(() => {
    let mounted = true

    setIsLoading(true)
    setHasError(false)

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
    setCurrentRoute(route)
    setActiveWorkbenchTab("plan")
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
        <h2 className="text-2xl leading-tight font-black text-[var(--periplus-ink)]">
          收藏路线
        </h2>
        <p className="mt-1 text-sm leading-6 text-[var(--periplus-walnut)]">
          继续编辑保存过的路线，也可以按地点、标签和备注筛选。
        </p>
      </div>
      <div className="space-y-2">
        {filteredRoutes.length ? (
          filteredRoutes.map((route) => (
            <RouteListItem
              key={route.id}
              route={route}
              onSelect={selectRoute}
            />
          ))
        ) : (
          <p className="text-sm text-[var(--periplus-walnut)]">
            暂无匹配的收藏路线
          </p>
        )}
      </div>
    </div>
  )
}
