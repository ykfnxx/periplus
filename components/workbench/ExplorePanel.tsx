"use client"

import { silkRoadRoute } from "@/lib/mock-routes"
import { useMapStore } from "@/stores/mapStore"
import type { Route } from "@/types/route"
import RouteListItem from "./RouteListItem"

interface ExplorePanelProps {
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

export default function ExplorePanel({ searchQuery }: ExplorePanelProps) {
  const setCurrentRoute = useMapStore((state) => state.setCurrentRoute)
  const setActiveWorkbenchTab = useMapStore(
    (state) => state.setActiveWorkbenchTab
  )
  const routes = [silkRoadRoute].filter((route) =>
    matchesRoute(route, searchQuery)
  )

  const selectRoute = (route: Route) => {
    setCurrentRoute(route)
    setActiveWorkbenchTab("plan")
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-2xl leading-tight font-black text-[var(--periplus-ink)]">
          探索路线
        </h2>
        <p className="mt-1 text-sm leading-6 text-[var(--periplus-walnut)]">
          从经典路线开始，也可以搜索地点、标签和备注。
        </p>
      </div>
      <div className="space-y-2">
        {routes.map((route) => (
          <RouteListItem key={route.id} route={route} onSelect={selectRoute} />
        ))}
      </div>
    </div>
  )
}
