"use client"

import { useMapStore } from "@/stores/mapStore"

interface ExplorePanelProps {
  searchQuery: string
}

export default function ExplorePanel({ searchQuery }: ExplorePanelProps) {
  const currentRoute = useMapStore((state) => state.currentRoute)

  return (
    <div className="space-y-2 text-sm text-[var(--periplus-walnut)]">
      {currentRoute ? (
        <div>
          <h2 className="text-base font-black text-[var(--periplus-ink)]">
            {currentRoute.name}
          </h2>
          <p>{currentRoute.description}</p>
        </div>
      ) : null}
      <div>探索 {searchQuery}</div>
    </div>
  )
}
