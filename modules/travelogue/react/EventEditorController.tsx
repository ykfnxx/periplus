"use client"
import { useState } from "react"
import { useStore } from "zustand"
import type { EventLocation } from "@/modules/data-model/contracts"
import type { EventWindowRequest } from "../ui/state/workbench-store"
import type { RecordingStore } from "../application/recording-session"
import { operationId } from "../application/operation-id"
import { saveEvent } from "../application/events"
import { initialEventDraft } from "../model/event-draft"
import EventEditor from "../ui/events/EventEditor"
import DraftEditor from "./DraftEditorController"
import PhotoPanel from "./PhotoController"
import RevisionReload from "./RevisionReload"
export default function EventEditorController({
  userId,
  store,
  request,
  onClose,
  onSaved,
  onPickLocation,
}: {
  userId: string
  store: RecordingStore
  request: EventWindowRequest
  onClose: () => void
  onSaved: (id: string) => void
  onPickLocation: (
    location: EventLocation | null
  ) => Promise<EventLocation | null | undefined>
}) {
  const { journey, uploads, saving } = useStore(store)
  const [saveKey] = useState(operationId)
  const [localDraft] = useState(() => ({
    id: operationId(),
    userId,
    journey: { id: journey!.id, title: journey!.title },
    content: initialEventDraft(undefined, request),
    photos: [],
    afterEventId: request.afterEventId,
    updatedAt: new Date().toISOString(),
  }))
  if (!request.eventId)
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
          await store.getState().load()
          window.dispatchEvent(new Event("drafts-changed"))
          onSaved(id)
          onClose()
        }}
      />
    )
  return (
    <EventEditor
      journey={journey!}
      uploads={uploads}
      saving={saving}
      request={request}
      onClose={onClose}
      onSaved={onSaved}
      onPickLocation={onPickLocation}
      onSave={(input) => saveEvent(store, { ...input, saveKey })}
      renderRevision={(onReload) => (
        <RevisionReload
          store={store}
          onReload={() => onReload(store.getState().journey!)}
        />
      )}
      renderPhotos={(props) => <PhotoPanel store={store} {...props} />}
    />
  )
}
