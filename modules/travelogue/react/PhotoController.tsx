"use client"
import { useMemo } from "react"
import { useStore } from "zustand"
import type { RecordingStore } from "../application/recording-session"
import { createPhotoActions } from "../application/photos"
import PhotoPanel from "../ui/photos/PhotoPanel"
import RevisionReload from "./RevisionReload"
export default function PhotoController({
  store,
  eventId,
  onDirtyChange,
  onClose,
  subpage = false,
}: {
  store: RecordingStore
  eventId: string
  onDirtyChange: (dirty: boolean) => void
  onClose: () => void
  subpage?: boolean
}) {
  const { journey, uploads } = useStore(store)
  const actions = useMemo(
    () => createPhotoActions(store, eventId),
    [store, eventId]
  )
  return (
    <PhotoPanel
      journey={journey!}
      uploads={uploads}
      actions={actions}
      revisionNotice={<RevisionReload store={store} />}
      eventId={eventId}
      onDirtyChange={onDirtyChange}
      onClose={onClose}
      subpage={subpage}
    />
  )
}
