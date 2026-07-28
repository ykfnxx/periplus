"use client"

import { useEffect } from "react"
import { listPhotos, photoDtoToShare } from "@/modules/data/photos/client"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

export default function PhotoSync() {
  const setPhotoShares = useWorkspaceStore((state) => state.setPhotoShares)

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
