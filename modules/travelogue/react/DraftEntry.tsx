"use client"

import { useEffect, useState } from "react"
import DraftEntryView from "../ui/drafts/DraftEntry"
import { recordingApi } from "../adapters/recording-http"
import { createDraftLibrary } from "../application/draft-library"
import { draftStorage, type DraftJourney } from "../adapters/draft-indexeddb"
import { prepareOfflineDrafts } from "../adapters/offline"

export default function DraftEntry({
  userId,
  journeys,
}: {
  userId: string
  journeys?: DraftJourney[]
}) {
  const [library] = useState(() =>
    createDraftLibrary(draftStorage, recordingApi)
  )
  const [count, setCount] = useState(0)
  const [error, setError] = useState(false)
  useEffect(() => {
    let disposed = false
    library
      .open(userId)
      .then((drafts) => {
        if (disposed) return
        setCount(drafts.length)
      })
      .catch(() => {
        if (!disposed) setError(true)
      })
    void prepareOfflineDrafts().catch(() => {
      if (!disposed) setError(true)
    })
    const refresh = () => {
      void library
        .list(userId)
        .then((drafts) => {
          if (!disposed) setCount(drafts.length)
        })
        .catch(() => {
          if (!disposed) setError(true)
        })
    }
    window.addEventListener("focus", refresh)
    window.addEventListener("drafts-changed", refresh)
    return () => {
      disposed = true
      window.removeEventListener("focus", refresh)
      window.removeEventListener("drafts-changed", refresh)
    }
  }, [library, userId])
  useEffect(() => {
    if (journeys === undefined) return
    let disposed = false
    void library
      .remember({
        userId,
        journeys: journeys.map(({ id, title }) => ({ id, title })),
      })
      .catch(() => {
        if (!disposed) setError(true)
      })
    return () => {
      disposed = true
    }
  }, [library, userId, journeys])
  return (
    <DraftEntryView
      count={count}
      error={error}
      onOpen={() => window.location.assign("/drafts")}
    />
  )
}
