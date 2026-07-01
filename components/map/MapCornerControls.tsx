"use client"

import { useEffect } from "react"
import { Image as ImageIcon, Settings, Star } from "lucide-react"
import { useMapStore, type ActiveMapPanel } from "@/stores/mapStore"
import PhotoUploadPanel from "./PhotoUploadPanel"
import SavedRoutesPanel from "./SavedRoutesPanel"
import SettingsPanel from "./SettingsPanel"

const controls: Array<{
  panel: Exclude<ActiveMapPanel, "none">
  label: string
  icon: typeof ImageIcon
}> = [
  { panel: "photo", label: "照片上传", icon: ImageIcon },
  { panel: "saved", label: "收藏路线", icon: Star },
  { panel: "settings", label: "设置", icon: Settings },
]

export default function MapCornerControls() {
  const map = useMapStore((state) => state.map)
  const activeMapPanel = useMapStore((state) => state.activeMapPanel)
  const setActiveMapPanel = useMapStore((state) => state.setActiveMapPanel)

  useEffect(() => {
    if (!map) return

    const closePanel = () => {
      setActiveMapPanel("none")
    }

    map.on("click", closePanel)

    return () => {
      map.off("click", closePanel)
    }
  }, [map, setActiveMapPanel])

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
              className={`flex h-9 w-9 items-center justify-center rounded-lg border border-[rgb(44_36_22_/_12%)] transition ${
                isActive
                  ? "bg-[var(--periplus-soft-white)] text-[var(--periplus-ink)] shadow-[var(--periplus-soft-shadow)]"
                  : "bg-[rgb(255_250_243_/_60%)] text-[var(--periplus-teak)] hover:bg-[rgb(255_250_243_/_95%)] hover:text-[var(--periplus-ink)] hover:shadow-[var(--periplus-soft-shadow)]"
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
          className="pointer-events-auto absolute top-5 right-16 max-h-[calc(100vh-40px)] w-[min(300px,calc(100vw-96px))] overflow-auto rounded-[12px] border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-soft-white)] p-3 shadow-[var(--periplus-shadow)]"
        >
          {activeMapPanel === "photo" && <PhotoUploadPanel />}
          {activeMapPanel === "saved" && <SavedRoutesPanel />}
          {activeMapPanel === "settings" && <SettingsPanel />}
        </div>
      )}
    </div>
  )
}
