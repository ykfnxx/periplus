"use client"

import MapSurface from "@/modules/map-renderer/ui/MapSurface"
import WorkspaceController, {
  useWorkspaceController,
} from "@/modules/workspace/ui/WorkspaceController"
import WorkspaceInteractionLayer from "@/modules/workspace/ui/WorkspaceInteractionLayer"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

export default function MapWorkspace() {
  const { handleMapIntent } = useWorkspaceController()
  const documentReady = useWorkspaceStore(
    (state) => state.workspaceDocument !== null
  )

  return (
    <div
      inert={!documentReady}
      className="relative h-screen w-screen overflow-hidden bg-cream text-ink"
    >
      <WorkspaceController />
      <MapSurface onIntent={handleMapIntent} />
      <WorkspaceInteractionLayer />
    </div>
  )
}
