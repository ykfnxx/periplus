"use client"

import { useCallback } from "react"
import { getActivePathView } from "@/lib/routes/active-path"
import { photoDtoToShare, uploadPhoto } from "@/modules/data/photos/client"
import type { MapIntent } from "@/modules/workspace/contracts"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import AgentSync from "@/modules/workbench/ui/AgentSync"
import PhotoSync from "./PhotoSync"
import RoutePlanSync from "./RoutePlanSync"

export function dispatchMapIntent(intent: MapIntent) {
  const state = useWorkspaceStore.getState()

  if (intent.type === "map.background-clicked") {
    state.setActiveMapPanel("none")
    state.setSelectedEdgeId(null)
    state.setSelectedLocationPoint(null)
    state.setSelectedPhotoShare(null)
    state.collapseCluster()
    return
  }

  if (intent.type === "map.location-picked") {
    const { lat, lng } = intent.coordinate
    if (state.locationSelectionMode === "photo" && state.pendingPhotoUpload) {
      void uploadPhoto({
        file: state.pendingPhotoUpload.file,
        lat,
        lng,
      })
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
    intent.type === "map.waypoint-selected" ||
    intent.type === "map.waypoint-hovered" ||
    intent.type === "map.waypoint-hover-cleared"
  ) {
    const view = getActivePathView(
      state.draftRoute,
      state.viewLevel,
      state.activeRouteNodeId
    )
    const waypoint = view.nodes.find((node) => node.id === intent.waypointId)
    if (!waypoint) return

    if (intent.type === "map.waypoint-hover-cleared") {
      if (state.selectedLocationPoint?.id === waypoint.id) {
        state.setSelectedLocationPoint(null)
      }
      return
    }

    if (intent.type === "map.waypoint-selected" && view.level === "overview") {
      state.enterCityView(waypoint.id)
      return
    }

    if (
      intent.type === "map.waypoint-selected" &&
      state.selectedLocationPoint?.id === waypoint.id
    ) {
      state.setSelectedLocationPoint(null)
      return
    }

    state.setSelectedLocationPoint(
      waypoint,
      intent.type === "map.waypoint-selected" ? intent.anchor : undefined
    )
    return
  }

  if (intent.type === "map.photo-selected") {
    const photo = state.photoShares.find(
      (candidate) => candidate.id === intent.photoId
    )
    if (!photo) return
    state.setSelectedLocationPoint(null)
    state.setLightboxPhotoShare(photo)
    return
  }

  if (intent.type === "map.edge-selected") {
    state.setSelectedEdgeId(
      state.selectedEdgeId === intent.edgeId ? null : intent.edgeId
    )
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
      <RoutePlanSync />
    </>
  )
}
