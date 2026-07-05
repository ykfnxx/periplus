"use client"

import { useEffect } from "react"
import { listPhotos, photoDtoToShare } from "@/lib/photos/client"
import { useMapStore } from "@/stores/mapStore"

export default function PhotoSync() {
  const setPhotoShares = useMapStore((state) => state.setPhotoShares)

  useEffect(() => {
    let mounted = true

    listPhotos()
      .then((photos) => {
        if (!mounted) return
        setPhotoShares(photos.map(photoDtoToShare))
      })
      .catch(() => {
        if (mounted) setPhotoShares([])
      })

    return () => {
      mounted = false
    }
  }, [setPhotoShares])

  return null
}
