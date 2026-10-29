"use client"

import { operationId } from "../data/operation-id"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type {
  JourneyCreate,
  MapPhoto,
  JourneySummary,
} from "@/modules/data-model/contracts"
import { recordingApi } from "../data/client"
import JourneyLibrary from "./JourneyLibrary"
import { journeyHref } from "../data/navigation"

export default function JourneyLibraryPage({
  developerMode = false,
}: {
  developerMode?: boolean
}) {
  const router = useRouter()
  const [journeys, setJourneys] = useState<JourneySummary[]>([])
  const [photos, setPhotos] = useState<MapPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const pendingCreate = useRef<JourneyCreate | null>(null)
  useEffect(() => {
    let disposed = false
    recordingApi
      .atlas()
      .then((atlas) => {
        if (!disposed) {
          setJourneys(atlas.journeys)
          setPhotos(atlas.photos)
          setLoading(false)
        }
      })
      .catch((cause) => {
        if (!disposed) {
          setError(
            cause instanceof Error ? cause.message : "旅程列表打开失败。"
          )
          setLoading(false)
        }
      })
    return () => {
      disposed = true
    }
  }, [reload])
  return (
    <JourneyLibrary
      developerMode={developerMode}
      journeys={journeys}
      photos={photos}
      loading={loading}
      error={error}
      onRetry={() => {
        setLoading(true)
        setError(null)
        setReload((value) => value + 1)
      }}
      onOpen={(id, request) => router.push(journeyHref(id, request))}
      onCreate={async (title, request) => {
        pendingCreate.current ||= { idempotencyKey: operationId(), title }
        const result = await recordingApi.create(pendingCreate.current)
        if (result.journey.title !== title)
          await recordingApi.command(result.journey.id, {
            expectedRevision: result.journey.revision,
            idempotencyKey: operationId(),
            command: { name: "journey.update", patch: { title } },
          })
        pendingCreate.current = null
        router.push(journeyHref(result.journey.id, request))
      }}
      onRename={async (id, title) => {
        const journey = await recordingApi.get(id)
        const result = await recordingApi.command(id, {
          expectedRevision: journey.revision,
          idempotencyKey: operationId(),
          command: { name: "journey.update", patch: { title } },
        })
        setJourneys((items) =>
          items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  title: result.journey.title,
                  updatedAt: result.journey.updatedAt,
                  revision: result.journey.revision,
                }
              : item
          )
        )
      }}
    />
  )
}
