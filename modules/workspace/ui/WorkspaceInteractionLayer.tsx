"use client"

import LocationSelectionPrompt from "@/modules/workbench/ui/LocationSelectionPrompt"
import PhotoLightbox from "@/modules/workbench/ui/PhotoLightbox"
import PhotoUploadModal from "@/modules/workbench/ui/PhotoUploadModal"
import WorkbenchShell from "@/modules/workbench/ui/WorkbenchShell"
import type { WorkspaceSwitcherController } from "@/modules/workbench/ui/WorkspaceSwitcherPanel"
import WorkspaceCornerControls from "@/modules/workbench/ui/WorkspaceCornerControls"

export default function WorkspaceInteractionLayer({
  workspaceSwitcher,
}: {
  workspaceSwitcher?: WorkspaceSwitcherController
} = {}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <WorkbenchShell workspaceSwitcher={workspaceSwitcher} />
      <WorkspaceCornerControls />
      <LocationSelectionPrompt />
      <PhotoUploadModal />
      <PhotoLightbox />
    </div>
  )
}
