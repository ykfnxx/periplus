"use client"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useStore } from "zustand"
import type { EventLocation } from "@/modules/data-model/contracts"
import type { EventWindowRequest } from "../ui/state/workbench-store"
import type { RecordingStore } from "../application/recording-session"
import { operationId } from "../application/operation-id"
import { createEventEditor } from "../application/event-editor"
import { initialEventDraft } from "../model/event-draft"
import EventEditor from "../ui/events/EventEditor"
import DraftEditor from "./DraftEditorController"
import PhotoPanel from "./PhotoController"
import RevisionReload from "./RevisionReload"

type Props = {
  userId: string
  store: RecordingStore
  request: EventWindowRequest
  onClose: () => void
  onSaved: (id: string) => void
  onPickLocation: (
    location: EventLocation | null
  ) => Promise<EventLocation | null | undefined>
}

export default function EventEditorController(props: Props) {
  return props.request.eventId ? (
    <ExistingEventEditor {...props} />
  ) : (
    <NewEventEditor {...props} />
  )
}

function useMounted() {
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  return mounted
}

function NewEventEditor({
  userId,
  store,
  request,
  onClose,
  onSaved,
  onPickLocation,
}: Props) {
  const mounted = useMounted()
  const [localDraft] = useState(() => ({
    id: operationId(),
    userId,
    journey: {
      id: store.getState().journey!.id,
      title: store.getState().journey!.title,
    },
    content: initialEventDraft(undefined, request),
    photos: [],
    afterEventId: request.afterEventId,
    updatedAt: new Date().toISOString(),
  }))
  return (
    <DraftEditor
      inline
      initial={localDraft}
      journeys={[localDraft.journey]}
      onPickLocation={onPickLocation}
      onClose={() => {
        window.dispatchEvent(new Event("drafts-changed"))
        onClose()
      }}
      onSaved={async (_, id) => {
        if (!mounted.current) return
        await store.getState().load()
        if (!mounted.current) return
        window.dispatchEvent(new Event("drafts-changed"))
        onSaved(id)
        onClose()
      }}
    />
  )
}

function ExistingEventEditor({
  store,
  request,
  onClose,
  onSaved,
  onPickLocation,
}: Props) {
  const journey = useStore(store, (state) => state.journey)!
  const uploads = useStore(store, (state) => state.uploads)
  const saving = useStore(store, (state) => state.saving)
  const mounted = useMounted()
  const entry = journey.events.find((event) => event.id === request.eventId)
  const [editor] = useState(() =>
    createEventEditor(
      store,
      request.eventId!,
      initialEventDraft(entry, request)
    )
  )
  const state = useSyncExternalStore(
    editor.subscribe,
    editor.getState,
    editor.getState
  )
  return (
    <EventEditor
      entry={entry}
      {...state}
      pendingSave={state.pending}
      dirty={
        JSON.stringify(state.draft) !== JSON.stringify(state.saved) ||
        state.files.length > 0
      }
      uploads={uploads}
      saving={saving}
      onClose={onClose}
      onChange={editor.change}
      onFiles={editor.files}
      onSave={async () => {
        const id = await editor.save()
        if (id && mounted.current) onSaved(id)
      }}
      onPickLocation={async () => {
        const location = await onPickLocation(editor.getState().draft.location)
        if (mounted.current && location !== undefined)
          editor.change({ ...editor.getState().draft, location })
      }}
      onPickTransitLocation={async (which) => {
        const current = editor.getState().draft.transit!
        const location = await onPickLocation(
          current[which === "from" ? "fromLocation" : "toLocation"] ?? null
        )
        if (!mounted.current || location === undefined) return
        const draft = editor.getState().draft
        const nameKey = which === "from" ? "fromName" : "toName"
        const name = draft.transit![nameKey]
        editor.change({
          ...draft,
          transit: {
            ...draft.transit!,
            [which === "from" ? "fromLocation" : "toLocation"]: location,
            [nameKey]:
              location && (!name?.trim() || name === "所选位置")
                ? location.name
                : name,
          },
        })
      }}
      revisionNotice={
        <RevisionReload
          store={store}
          onReload={() => editor.reload(store.getState().journey!)}
        />
      }
      renderPhotos={(props) => <PhotoPanel store={store} {...props} />}
    />
  )
}
