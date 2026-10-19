"use client"

import { operationId } from "../data/operation-id"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type {
  RecordingJourneyCreate,
  RecordingJourneySummary,
} from "@/modules/data-model/contracts/recording"
import { recordingApi } from "../data/client"
import JourneyLibrary from "./JourneyLibrary"

export default function JourneyLibraryPage() {
  const router = useRouter()
  const [journeys, setJourneys] = useState<RecordingJourneySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const pendingCreate = useRef<RecordingJourneyCreate | null>(null)
  useEffect(() => {
    let disposed = false
    setLoading(true)
    setError(null)
    recordingApi
      .list()
      .then((items) => {
        if (!disposed) {
          setJourneys(items)
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
      journeys={journeys}
      loading={loading}
      error={error}
      onRetry={() => setReload((value) => value + 1)}
      onOpen={(id) => router.push(`/journeys/${encodeURIComponent(id)}`)}
      onCreate={async (title) => {
        pendingCreate.current ||= { idempotencyKey: operationId(), title }
        const result = await recordingApi.create(pendingCreate.current)
        if (result.journey.title !== title)
          await recordingApi.command(result.journey.id, {
            expectedRevision: result.journey.revision,
            idempotencyKey: operationId(),
            command: { name: "journey.update", patch: { title } },
          })
        pendingCreate.current = null
        router.push(`/journeys/${encodeURIComponent(result.journey.id)}`)
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
