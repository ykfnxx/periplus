"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createRecordingStore } from "../application/recording-session"
import RecordingEditor from "./RecordingController"
import { recordingApi } from "../adapters/recording-http"
import { useStore } from "zustand"
import { journeyHref, type JourneyOpenRequest } from "./navigation"

export default function RecordingPage({
  userId,
  journeyId,
  developerMode = false,
}: {
  userId: string
  journeyId: string
  developerMode?: boolean
}) {
  const router = useRouter()
  const query = useSearchParams()
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
              coordinates: { lat, lng, coordinateSystem: "WGS84" as const },
            },
          }
        : {}),
    }
  })
  const [store] = useState(() => createRecordingStore(journeyId, recordingApi))
  const directory = useStore(store, (state) => state.directory)
  useEffect(() => {
    store.getState().activate()
    void store.getState().load()
    void store.getState().loadDirectory()
    return () => store.getState().dispose()
  }, [store])
  return (
    <RecordingEditor
      userId={userId}
      journeys={directory.journeys}
      directoryError={directory.error}
      directoryLoading={directory.loading}
      onRetryDirectory={() => void store.getState().loadDirectory()}
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
