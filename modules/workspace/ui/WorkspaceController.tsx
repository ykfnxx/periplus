"use client"

import { useCallback } from "react"
import { getJourneyScopeProjection } from "@/lib/journeys/projections"
import { photoDtoToShare, uploadPhoto } from "@/modules/data/photos/client"
import type { MapIntent } from "@/modules/workspace/contracts"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import AgentSync from "@/modules/workbench/ui/AgentSync"
import PhotoSync from "./PhotoSync"
import TransitPlanSync from "./TransitPlanSync"

export function dispatchMapIntent(intent: MapIntent) {
  const state = useWorkspaceStore.getState()

  if (intent.type === "map.background-clicked") {
    state.setActiveMapPanel("none")
    state.setHoveredEventId(null)
    state.setSelectedTransitEventId(null)
    state.setSelectedLocationEvent(null)
    state.setSelectedPhotoShare(null)
    state.collapseCluster()
    return
  }

  if (intent.type === "map.location-picked") {
    const { lat, lng } = intent.coordinate
    if (state.locationSelectionMode === "photo" && state.pendingPhotoUpload) {
      void uploadPhoto({ file: state.pendingPhotoUpload.file, lat, lng })
        .then((photo) => {
          useWorkspaceStore.getState().addPhotoShare(photoDtoToShare(photo))
        })
        .catch(() => undefined)
        .finally(() => {
          useWorkspaceStore.getState().clearLocationSelection()
        })
      return
    }
    if (state.locationSelectionMode === "point") {
      state.setPointSelectionDraft({ lat, lng })
      state.clearLocationSelection()
      return
    }
    if (
      state.locationSelectionMode === "upload-photo" &&
      state.uploadLocationSelectionPhotoId
    ) {
      state.updateUploadPhoto(state.uploadLocationSelectionPhotoId, {
        lat,
        lng,
      })
      state.clearLocationSelection()
      state.setUploadModalOpen(true)
    }
    return
  }

  if (
    intent.type === "map.event-selected" ||
    intent.type === "map.event-hovered" ||
    intent.type === "map.event-hover-cleared"
  ) {
    const view = getJourneyScopeProjection(
      state.draftJourney,
      state.viewLevel,
      state.activeSectionEventId
    )
    const event = view.locations.find(
      (candidate) => candidate.id === intent.eventId
    )
    if (!event) return

    if (intent.type === "map.event-hover-cleared") {
      if (state.hoveredEventId === event.id) state.setHoveredEventId(null)
      return
    }
    if (intent.type === "map.event-hovered") {
      state.setHoveredEventId(event.id)
      return
    }
    if (view.level === "overview" && event.type === "SECTION") {
      state.setWorkbenchTab("preview")
      state.enterSectionView(event.id)
      state.requestMapFocus({ type: "active-journey", maxZoom: 15 })
      return
    }
    if (state.selectedLocationEvent?.id === event.id) {
      state.setSelectedLocationEvent(null)
      return
    }
    state.setWorkbenchTab("preview")
    state.setSelectedTransitEventId(null)
    state.setSelectedLocationEvent(event, intent.anchor)
    state.requestMapFocus({ type: "event", eventId: event.id, zoom: 15 })
    return
  }

  if (intent.type === "map.photo-selected") {
    const photo = state.photoShares.find(
      (candidate) => candidate.id === intent.photoId
    )
    if (!photo) return
    state.setSelectedLocationEvent(null)
    state.setLightboxPhotoShare(photo)
    return
  }

  if (intent.type === "map.transit-selected") {
    state.setWorkbenchTab("preview")
    state.setSelectedLocationEvent(null)
    const nextEventId =
      state.selectedTransitEventId === intent.eventId ? null : intent.eventId
    state.setSelectedTransitEventId(nextEventId)
    if (nextEventId) {
      state.requestMapFocus({
        type: "transit",
        eventId: nextEventId,
        maxZoom: 14,
      })
    }
  }
}

export function useWorkspaceController() {
  const handleMapIntent = useCallback(
    (intent: MapIntent) => dispatchMapIntent(intent),
    []
  )
  return { handleMapIntent }
}

export default function WorkspaceController() {
  return (
    <>
      <AgentSync />
      <PhotoSync />
      <TransitPlanSync />
    </>
  )
}
