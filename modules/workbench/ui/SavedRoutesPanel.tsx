"use client"

import { useEffect, useState } from "react"
import { listJourneys } from "@/modules/data/journeys/client"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import type { Journey } from "@/types/journey"
import RouteListItem from "@/modules/workbench/ui/RouteListItem"

export default function SavedRoutesPanel() {
  const sendAgentEvent = useWorkspaceStore((state) => state.sendAgentEvent)
  const isDraftLocked = useWorkspaceStore((state) => state.isDraftLocked)
  const setActiveMapPanel = useWorkspaceStore(
    (state) => state.setActiveMapPanel
  )
  const [journeys, setJourneys] = useState<Journey[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    let mounted = true
    listJourneys()
      .then((savedJourneys) => {
        if (!mounted) return
        setJourneys(savedJourneys)
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

  const selectJourney = (journey: Journey) => {
    if (isDraftLocked || !sendAgentEvent) return
    sendAgentEvent("draft.load_saved_journey", { journeyId: journey.id })
    setActiveMapPanel("none")
  }

  if (isLoading) return <div className="text-sm text-walnut">正在加载...</div>
  if (hasError) {
    return <div className="text-sm text-walnut">保存行程加载失败</div>
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold text-ink">收藏行程</h2>
      <div className="space-y-2">
        {journeys.length ? (
          journeys.map((journey) => (
            <RouteListItem
              key={journey.id}
              journey={journey}
              onSelect={selectJourney}
            />
          ))
        ) : (
          <p className="text-sm text-walnut">暂无收藏行程</p>
        )}
      </div>
    </div>
  )
}
