"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createRecordingStore } from "../state/recording-store"
import RecordingEditor from "./RecordingEditor"
import { recordingApi } from "../data/client"
import type { RecordingJourneySummary } from "@/modules/data-model/contracts/recording"
import { journeyHref, type JourneyOpenRequest } from "../data/navigation"

export default function RecordingPage({
  journeyId,
  developerMode = false,
}: {
  journeyId: string
  developerMode?: boolean
}) {
  const router = useRouter()
  const query = useSearchParams()
  const [directoryError, setDirectoryError] = useState<string | null>(null)
  const [reloadDirectory, setReloadDirectory] = useState(0)
  const [journeys, setJourneys] = useState<RecordingJourneySummary[]>([])
  const [initialRequest] = useState<JourneyOpenRequest>(() => {
    const lat = Number(query.get("lat")),
      lng = Number(query.get("lng"))
    const hasCoordinate =
      query.has("lat") &&
      query.has("lng") &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    return {
      eventId: query.get("event") || undefined,
      add: query.get("add") === "1",
      ...(hasCoordinate
        ? {
            location: {
              name: "所选位置",
              address: null,
              coordinates: { lat, lng, coordinateSystem: "GCJ02" as const },
            },
          }
        : {}),
    }
  })
  const [store] = useState(() => createRecordingStore(journeyId))
  useEffect(() => {
    void store.getState().load()
    return () => store.getState().dispose()
  }, [store])
  useEffect(() => {
    let disposed = false
    recordingApi
      .list()
      .then((items) => {
        if (!disposed) {
          setJourneys(items)
          setDirectoryError(null)
        }
      })
      .catch((cause) => {
        if (!disposed)
          setDirectoryError(
            cause instanceof Error ? cause.message : "目录打开失败"
          )
      })
    return () => {
      disposed = true
    }
  }, [reloadDirectory])
  return (
    <RecordingEditor
      journeys={journeys}
      directoryError={directoryError}
      onRetryDirectory={() => setReloadDirectory((value) => value + 1)}
      initialRequest={initialRequest}
      onRequestHandled={() =>
        router.replace(journeyHref(journeyId), { scroll: false })
      }
      onOpenJourney={(id, request) => router.push(journeyHref(id, request))}
      developerMode={developerMode}
      store={store}
      onBack={() => router.push("/journeys")}
    />
  )
}
