"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/kumo/components/button/button"
import { draftStorage, type DraftJourney } from "./storage"
import { prepareOfflineDrafts } from "./offline"

export default function DraftEntry({
  userId,
  journeys,
}: {
  userId: string
  journeys?: DraftJourney[]
}) {
  const [count, setCount] = useState(0)
  const [error, setError] = useState(false)
  useEffect(() => {
    let disposed = false
    Promise.all([draftStorage.activate(userId), draftStorage.list(userId)])
      .then(([, drafts]) => {
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
      void draftStorage
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
  }, [userId])
  useEffect(() => {
    if (journeys === undefined) return
    let disposed = false
    void draftStorage
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
  }, [userId, journeys])
  return (
    <Button
      variant="ghost"
      size="sm"
      title={error ? "本机草稿准备失败，请打开检查" : "本机草稿箱"}
      onClick={() => window.location.assign("/drafts")}
    >
      草稿箱{count > 0 ? ` · ${count}` : ""}
      {error ? " !" : ""}
    </Button>
  )
}
