"use client"

import { useState, useSyncExternalStore } from "react"
import type { EventLocation } from "@/modules/data-model/contracts/index"
import { createDraftSession } from "../application/draft-session"
import { recordingApi } from "../adapters/recording-http"
import {
  draftStorage,
  type DraftJourney,
  type LocalDraft,
} from "../adapters/draft-indexeddb"

import DraftEditorView from "../ui/drafts/DraftEditor"

export default function DraftEditor({
  initial,
  journeys,
  onClose,
  onSaved,
  onPickLocation,
  inline = false,
}: {
  initial: LocalDraft
  journeys: DraftJourney[]
  onClose: () => void
  onSaved: (journeyId: string, eventId: string) => void | Promise<void>
  onPickLocation?: (
    location: EventLocation | null
  ) => Promise<EventLocation | null | undefined>
  inline?: boolean
}) {
  const [session] = useState(() =>
    createDraftSession(initial, draftStorage, recordingApi)
  )
  const { draft, status, error, busy } = useSyncExternalStore(
    session.subscribe,
    session.getState,
    session.getState
  )
  const [picking, setPicking] = useState(false)
  const update = session.update
  const beforeClose = session.beforeClose
  async function closeInline() {
    if (await beforeClose()) onClose()
  }
  async function publish() {
    const result = await session.publish()
    if (result) await onSaved(result.journeyId, result.eventId)
  }

  async function pickEndpoint(which: "from" | "to") {
    if (!onPickLocation) return
    setPicking(true)
    try {
      const currentTransit = session.getState().draft.content.transit
      const currentLoc =
        which === "from"
          ? (currentTransit?.fromLocation ?? null)
          : (currentTransit?.toLocation ?? null)
      const location = await onPickLocation(currentLoc)
      if (location !== undefined) {
        const latestContent = session.getState().draft.content
        const prevTransit = latestContent.transit || {
          fromName: "",
          toName: "",
          transportMode: "TRAIN" as const,
        }
        const nameKey = which === "from" ? "fromName" : "toName"
        const locKey = which === "from" ? "fromLocation" : "toLocation"
        const nextName =
          location &&
          (!prevTransit[nameKey]?.trim() || prevTransit[nameKey] === "所选位置")
            ? location.name
            : prevTransit[nameKey]
        update({
          ...session.getState().draft,
          content: {
            ...latestContent,
            transit: {
              ...prevTransit,
              [nameKey]: nextName,
              [locKey]: location,
            },
          },
        })
      }
    } finally {
      setPicking(false)
    }
  }

  async function pick() {
    if (!onPickLocation) return
    setPicking(true)
    try {
      const location = await onPickLocation(
        session.getState().draft.content.location
      )
      if (location !== undefined)
        update({
          ...session.getState().draft,
          content: { ...session.getState().draft.content, location },
        })
    } finally {
      setPicking(false)
    }
  }
  return (
    <DraftEditorView
      draft={draft}
      journeys={journeys}
      error={error}
      status={status}
      busy={busy}
      picking={picking}
      inline={inline}
      onClose={onClose}
      closeInline={closeInline}
      beforeClose={beforeClose}
      publish={publish}
      update={update}
      onFiles={session.changeFiles}
      canPick={!!onPickLocation}
      pick={pick}
      pickEndpoint={pickEndpoint}
    />
  )
}
