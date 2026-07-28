"use client"

import { Suspense } from "react"
import MapSurface from "@/modules/map-renderer/ui/MapSurface"
import MapRouteLoader from "@/modules/workspace/ui/MapRouteLoader"
import WorkspaceController, {
  useWorkspaceController,
} from "@/modules/workspace/ui/WorkspaceController"
import WorkspaceInteractionLayer from "@/modules/workspace/ui/WorkspaceInteractionLayer"

export default function MapWorkspace() {
  const { handleMapIntent } = useWorkspaceController()

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[var(--color-cream)] text-[var(--color-ink)]">
      <WorkspaceController />
      <Suspense fallback={null}>
        <MapRouteLoader />
      </Suspense>
      <MapSurface onIntent={handleMapIntent} />
      <WorkspaceInteractionLayer />
    </div>
  )
}
