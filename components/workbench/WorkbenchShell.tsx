"use client"

import { useMapStore } from "@/stores/mapStore"
import AgentSync from "./AgentSync"
import AIComposer from "./AIComposer"
import PhotosPanel from "./PhotosPanel"
import PlacesPanel from "./PlacesPanel"
import PlanPanel from "./PlanPanel"
import SavedPanel from "./SavedPanel"
import WorkbenchToolRail from "./WorkbenchToolRail"

export default function WorkbenchShell() {
  const activeTool = useMapStore((state) => state.activeWorkbenchTool)

  return (
    <>
      <AgentSync />
      <section className="pointer-events-none absolute top-5 bottom-5 left-5 z-20 w-[min(420px,calc(100vw-40px))]">
        <div className="pointer-events-auto flex h-full min-h-0 flex-col overflow-hidden rounded-[10px] border border-[rgb(44_36_22_/_16%)] bg-[var(--periplus-soft-white)]/95 shadow-[var(--periplus-shadow)] backdrop-blur-sm">
          <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-3">
            {activeTool === "plan" && <PlanPanel />}
            {activeTool === "places" && <PlacesPanel />}
            {activeTool === "photos" && <PhotosPanel />}
            {activeTool === "saved" && <SavedPanel />}
          </div>
          <div className="border-t border-[rgb(44_36_22_/_10%)] px-3 pt-2 pb-3">
            <WorkbenchToolRail />
            <AIComposer />
          </div>
        </div>
      </section>
    </>
  )
}
