"use client"
import { recordingApi } from "../adapters/recording-http"

import { useEffect, useState } from "react"
import { journeyHref } from "./navigation"
import {
  draftStorage,
  type DraftContext,
  type LocalDraft,
} from "../adapters/draft-indexeddb"
import { draftError } from "../application/publish-draft"
import DraftEditor from "./DraftEditorController"
import { prepareOfflineDrafts } from "../adapters/offline"

import {
  createDraftLibrary,
  createLocalDraft,
} from "../application/draft-library"
import DraftboxView from "../ui/drafts/Draftbox"
export default function Draftbox() {
  const [library] = useState(() =>
    createDraftLibrary(draftStorage, recordingApi)
  )
  const [context, setContext] = useState<DraftContext | null>(null)
  const [drafts, setDrafts] = useState<LocalDraft[]>([])
  const [selected, setSelected] = useState<LocalDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [offlineReady, setOfflineReady] = useState(false)
  useEffect(() => {
    let disposed = false
    async function load() {
      const result = await library.load()
      const items = result.drafts
      if (!disposed) {
        setContext(result.context)
        setError(result.error)
        setDrafts(items)
        const requested = new URLSearchParams(window.location.search).get(
          "draft"
        )
        setSelected(items.find((item) => item.id === requested) || null)
      }
    }
    void load()
      .catch((cause) => {
        if (!disposed) setError(draftError(cause))
      })
      .finally(() => {
        if (!disposed) setLoading(false)
      })
    void prepareOfflineDrafts()
      .then((ready) => {
        if (!disposed) setOfflineReady(ready)
      })
      .catch((cause) => {
        if (!disposed) setError(`离线资源准备失败：${draftError(cause)}`)
      })
    return () => {
      disposed = true
    }
  }, [library])
  async function refresh() {
    setSelected(null)
    setDrafts(await library.list(context!.userId))
  }
  return (
    <DraftboxView
      context={context}
      drafts={drafts}
      loading={loading}
      error={error}
      offlineReady={offlineReady}
      onSelect={setSelected}
      onCreate={() =>
        setSelected(createLocalDraft(context!.userId, context!.journeys[0]))
      }
      onRemove={async (id) => {
        try {
          await library.remove(id)
          await refresh()
        } catch (cause) {
          setError(draftError(cause))
        }
      }}
      editor={
        selected &&
        context && (
          <DraftEditor
            key={selected.id}
            initial={selected}
            journeys={context.journeys}
            onClose={() => {
              void refresh().catch((cause) => setError(draftError(cause)))
            }}
            onSaved={(journeyId, eventId) =>
              window.location.assign(journeyHref(journeyId, { eventId }))
            }
          />
        )
      }
    />
  )
}
