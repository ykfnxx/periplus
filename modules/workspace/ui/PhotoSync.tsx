"use client"

import { useEffect } from "react"
import { listPhotos, photoDtoToShare } from "@/modules/data/photos/client"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

export default function PhotoSync() {
  const setPhotoShares = useWorkspaceStore((state) => state.setPhotoShares)
  const revisionKey = useWorkspaceStore((state) => {
    const flatJourney = state.workspaceDocument?.session.flatJourney
    return flatJourney
      ? `${flatJourney.journeyId}:${flatJourney.revision}`
      : null
  })
  const routeRenderedRevisionKey = useWorkspaceStore(
    (state) => state.routeRenderedRevisionKey
  )

  useEffect(() => {
    if (!revisionKey || routeRenderedRevisionKey !== revisionKey) return
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
  }, [revisionKey, routeRenderedRevisionKey, setPhotoShares])

  return null
}
