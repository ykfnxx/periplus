"use client"

import { useEffect } from "react"
import { useMapStore } from "@/stores/mapStore"
import { photoDtoToShare, uploadPhoto } from "@/lib/photos/client"

export default function LocationSelector() {
  const map = useMapStore((s) => s.map)
  const isSelectingLocation = useMapStore((s) => s.isSelectingLocation)
  const locationSelectionMode = useMapStore((s) => s.locationSelectionMode)
  const pendingPhotoUpload = useMapStore((s) => s.pendingPhotoUpload)
  const addPhotoShare = useMapStore((s) => s.addPhotoShare)
  const setPointSelectionDraft = useMapStore((s) => s.setPointSelectionDraft)
  const clearLocationSelection = useMapStore((s) => s.clearLocationSelection)

  useEffect(() => {
    if (!map || !isSelectingLocation) return

    // Add a visual indicator that we're in selection mode
    const mapContainer = map.getContainer()
    if (mapContainer) {
      mapContainer.style.cursor = "crosshair"
    }

    const clickHandler = (e: AMap.MapsEvent<"click", AMap.Map>) => {
      const lng = e.lnglat.getLng()
      const lat = e.lnglat.getLat()

      if (locationSelectionMode === "photo" && pendingPhotoUpload) {
        uploadPhoto({
          file: pendingPhotoUpload.file,
          lat,
          lng,
        })
          .then((photo) => {
            addPhotoShare(photoDtoToShare(photo))
            clearLocationSelection()
          })
          .catch(() => {
            clearLocationSelection()
          })
        return
      }

      if (locationSelectionMode === "point") {
        setPointSelectionDraft({ lat, lng })
        clearLocationSelection()
      }
    }

    map.on("click", clickHandler)

    return () => {
      map.off("click", clickHandler)
      if (mapContainer) {
        mapContainer.style.cursor = ""
      }
    }
  }, [
    map,
    isSelectingLocation,
    locationSelectionMode,
    pendingPhotoUpload,
    addPhotoShare,
    setPointSelectionDraft,
    clearLocationSelection,
  ])

  return null
}
