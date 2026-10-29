"use client"

import { useCallback } from "react"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { selectWorkspaceJourney } from "@/modules/workspace/state/selectors"
import type { MapIntent } from "@/modules/workspace/contracts"
import type { JourneyEvent } from "@/modules/data-model/contracts"
import useJourneyRoutes from "./useJourneyRoutes"

const emptyEvents: JourneyEvent[] = []
export default function RoutePolyline({
  onIntent,
}: {
  onIntent?: (intent: MapIntent) => void
}) {
  const map = useWorkspaceStore((state) => state.map)
  const journey = useWorkspaceStore(selectWorkspaceJourney)
  const selected = useWorkspaceStore((state) => state.selectedEventId)
  const select = useCallback(
    (eventId: string) => onIntent?.({ type: "map.transit-selected", eventId }),
    [onIntent]
  )
  useJourneyRoutes(map, journey?.events ?? emptyEvents, selected, select)
  return null
}
