"use client"

import { useState, type ReactNode } from "react"
import {
  Image as ImageIcon,
  LocateFixed,
  Menu,
  Minus,
  Plus,
  Settings,
  Star,
} from "lucide-react"
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
  const [menuOpen, setMenuOpen] = useState(false)
  const map = useWorkspaceStore((state) => state.map)
  const draftJourney = useWorkspaceStore((state) => state.draftJourney)
  const activeMapPanel = useWorkspaceStore((state) => state.activeMapPanel)
  const setActiveMapPanel = useWorkspaceStore(
    (state) => state.setActiveMapPanel
  )
  const requestMapFocus = useWorkspaceStore((state) => state.requestMapFocus)

  const openPanel = (panel: Exclude<ActiveMapPanel, "none">) => {
    setActiveMapPanel(activeMapPanel === panel ? "none" : panel)
    setMenuOpen(false)
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="pointer-events-auto absolute top-5 right-5 flex flex-col gap-2">
        <MapControlButton
          label="地图菜单"
          active={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </MapControlButton>
        <MapControlButton
          label="放大地图"
          disabled={!map}
          onClick={() => map?.zoomIn()}
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
        </MapControlButton>
        <MapControlButton
          label="缩小地图"
          disabled={!map}
          onClick={() => map?.zoomOut()}
        >
          <Minus className="h-5 w-5" aria-hidden="true" />
        </MapControlButton>
        <MapControlButton
          label="定位当前行程"
          disabled={!draftJourney}
          onClick={() =>
            requestMapFocus({ type: "active-journey", maxZoom: 15 })
          }
        >
          <LocateFixed className="h-5 w-5" aria-hidden="true" />
        </MapControlButton>
      </div>

      {menuOpen ? (
        <div className="pointer-events-auto absolute top-5 right-[72px] flex gap-2 rounded-xl border border-ink-15 bg-soft-white p-2 shadow-periplus-soft">
          {controls.map((control) => {
            const Icon = control.icon
            return (
              <button
                key={control.panel}
                type="button"
                onClick={() => openPanel(control.panel)}
                className="flex h-10 items-center gap-2 rounded-lg bg-cream px-3 text-[11px] font-black text-teak transition hover:bg-ink hover:text-soft-white"
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {control.label}
              </button>
            )
          })}
        </div>
      ) : null}

      {activeMapPanel !== "none" ? (
        <div
          onClick={(event) => event.stopPropagation()}
          className="pointer-events-auto absolute top-5 right-[72px] max-h-[calc(100vh-40px)] w-[min(300px,calc(100vw-96px))] overflow-auto rounded-xl border border-ink-15 bg-soft-white p-3 shadow-periplus"
        >
          {activeMapPanel === "photo" ? <PhotoUploadPanel /> : null}
          {activeMapPanel === "saved" ? <SavedRoutesPanel /> : null}
          {activeMapPanel === "settings" ? <WorkspaceSettingsPanel /> : null}
        </div>
      ) : null}
    </div>
  )
}

function MapControlButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className={`flex h-10 w-10 items-center justify-center rounded-[10px] border border-ink-10 shadow-periplus-soft transition disabled:cursor-not-allowed disabled:opacity-45 ${
        active
          ? "bg-russet text-soft-white"
          : "bg-soft-white/90 text-walnut hover:bg-ink hover:text-soft-white"
      }`}
    >
      {children}
    </button>
  )
}
