"use client"

import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { selectWorkspaceJourney } from "@/modules/workspace/state/selectors"

export default function MapJourneySummary() {
  const journey = useWorkspaceStore(selectWorkspaceJourney)
  if (!journey) return null
  return (
    <div className="pointer-events-auto absolute top-5 left-4 z-20 flex min-w-[190px] items-center rounded-full border border-ink-10 bg-soft-white/95 px-4 py-2 shadow-periplus-soft backdrop-blur-sm md:hidden">
      <span className="min-w-0">
        <span className="block truncate text-[10px] font-black text-teak">
          {journey.title}
        </span>
        <span className="mt-0.5 block text-[11px] font-black text-ink">
          {journey.events.length} 段经历
        </span>
      </span>
    </div>
  )
}
