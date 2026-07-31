"use client"

import { useEffect, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { silkRoadJourney } from "@/lib/mock-journeys"

export default function MapRouteLoader() {
  const loadedJourneyIdRef = useRef<string | null>(null)
  const searchParams = useSearchParams()
  const journeyId = searchParams.get("journey")
  const sendAgentEvent = useWorkspaceStore((s) => s.sendAgentEvent)

  useEffect(() => {
    if (!sendAgentEvent || !journeyId) return
    if (loadedJourneyIdRef.current === journeyId) return

    if (journeyId === "preset-silk-road") {
      sendAgentEvent("draft.replace", { journey: silkRoadJourney })
    } else {
      sendAgentEvent("draft.load_saved_journey", { journeyId })
    }
    loadedJourneyIdRef.current = journeyId
  }, [journeyId, sendAgentEvent])

  return null
}
