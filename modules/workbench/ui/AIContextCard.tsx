"use client"

import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import {
  selectWorkspaceJourney,
  selectSelectedWorkspaceEvent,
} from "@/modules/workspace/state/selectors"
import { eventTitle } from "@/modules/travelogue/ui/display"

export default function AIContextCard() {
  const journey = useWorkspaceStore(selectWorkspaceJourney)
  const selected = useWorkspaceStore(selectSelectedWorkspaceEvent)
  if (!journey) return null
  return (
    <div className="mx-5 rounded-[10px] bg-cream px-3.5 py-3">
      <p className="truncate text-[13px] font-black text-ink">
        {journey.title}
      </p>
      <p className="mt-1 text-[10px] font-bold text-teak">
        {selected
          ? `当前选中：${eventTitle(selected)}`
          : `${journey.events.length} 段经历`}
      </p>
    </div>
  )
}
