"use client"

import { Image as ImageIcon, Settings, Star } from "lucide-react"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import type { ActiveMapPanel } from "@/modules/workspace/state/types"
import PhotoUploadPanel from "./PhotoUploadPanel"
import SavedRoutesPanel from "./SavedRoutesPanel"
import WorkspaceSettingsPanel from "./WorkspaceSettingsPanel"

const controls: Array<{
  panel: Exclude<ActiveMapPanel, "none">
  label: string
  icon: typeof ImageIcon
}> = [
  { panel: "photo", label: "照片上传", icon: ImageIcon },
  { panel: "saved", label: "收藏路线", icon: Star },
  { panel: "settings", label: "设置", icon: Settings },
]

export default function WorkspaceCornerControls() {
  const activeMapPanel = useWorkspaceStore((state) => state.activeMapPanel)
  const setActiveMapPanel = useWorkspaceStore(
    (state) => state.setActiveMapPanel
  )

  const togglePanel = (panel: ActiveMapPanel) => {
    setActiveMapPanel(activeMapPanel === panel ? "none" : panel)
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="pointer-events-auto absolute top-5 right-5 flex flex-col gap-2">
        {controls.map((control) => {
          const Icon = control.icon
          const isActive = activeMapPanel === control.panel

          return (
            <button
              key={control.panel}
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                togglePanel(control.panel)
              }}
              aria-label={control.label}
              title={control.label}
              className={`flex h-9 w-9 items-center justify-center rounded-lg border border-ink-10 transition ${
                isActive
                  ? "bg-soft-white text-ink shadow-periplus-soft"
                  : "bg-soft-white/60 text-teak hover:bg-soft-white/95 hover:text-ink hover:shadow-periplus-soft"
              }`}
            >
              <Icon aria-hidden="true" className="h-4.5 w-4.5" />
            </button>
          )
        })}
      </div>
      {activeMapPanel !== "none" && (
        <div
          onClick={(event) => event.stopPropagation()}
          className="pointer-events-auto absolute top-5 right-16 max-h-[calc(100vh-40px)] w-[min(300px,calc(100vw-96px))] overflow-auto rounded-xl border border-ink-15 bg-soft-white p-3 shadow-periplus"
        >
          {activeMapPanel === "photo" && <PhotoUploadPanel />}
          {activeMapPanel === "saved" && <SavedRoutesPanel />}
          {activeMapPanel === "settings" && <WorkspaceSettingsPanel />}
        </div>
      )}
    </div>
  )
}
