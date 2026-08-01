"use client"

import MapSurface from "@/modules/map-renderer/ui/MapSurface"
import WorkspaceController, {
  useWorkspaceController,
} from "@/modules/workspace/ui/WorkspaceController"
import WorkspaceInteractionLayer from "@/modules/workspace/ui/WorkspaceInteractionLayer"

export default function MapWorkspace() {
  const { handleMapIntent } = useWorkspaceController()

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-cream text-ink">
      <WorkspaceController />
      <MapSurface onIntent={handleMapIntent} />
      <WorkspaceInteractionLayer />
    </div>
  )
}
