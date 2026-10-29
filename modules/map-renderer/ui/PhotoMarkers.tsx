"use client"

import { useMemo, useState } from "react"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import {
  selectWorkspaceJourney,
  useWorkspaceViewportInsets,
} from "@/modules/workspace/state/selectors"
import { photoItems } from "@/modules/travelogue/ui/photo-items"
import usePhotoMapLayer, {
  type MapPhoto,
} from "@/modules/travelogue/ui/usePhotoMapLayer"
import PhotoViewer from "@/modules/travelogue/ui/workbench/PhotoViewer"

export default function PhotoMarkers() {
  const map = useWorkspaceStore((state) => state.map)
  const journey = useWorkspaceStore(selectWorkspaceJourney)
  const selected = useWorkspaceStore((state) => state.selectedEventId)
  const insets = useWorkspaceViewportInsets()
  const [selection, setSelection] = useState<string[] | null>(null)
  const photos = useMemo(() => photoItems(journey?.events ?? []), [journey])
  const located = useMemo(
    () =>
      photos.filter((photo): photo is MapPhoto => photo.coordinate !== null),
    [photos]
  )
  usePhotoMapLayer(map, located, insets, selected, setSelection)
  const selectedPhotos = selection
    ? photos.filter((photo) => selection.includes(photo.id))
    : []
  return selectedPhotos.length > 0 ? (
    <PhotoViewer
      photos={selectedPhotos}
      initialIndex={0}
      onClose={() => setSelection(null)}
      onOpenEvent={(photo) => {
        const state = useWorkspaceStore.getState()
        state.selectEvent(photo.eventId)
        state.setWorkbenchTab("preview")
        setSelection(null)
      }}
    />
  ) : null
}
