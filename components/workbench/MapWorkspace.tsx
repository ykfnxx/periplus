"use client"

import { Suspense } from "react"
import MapContainer from "@/components/map/MapContainer"
import MapRouteLoader from "@/components/map/MapRouteLoader"
import WorkbenchShell from "./WorkbenchShell"

export default function MapWorkspace() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-cream text-ink">
      <Suspense fallback={null}>
        <MapRouteLoader />
      </Suspense>
      <MapContainer />
      <WorkbenchShell />
    </div>
  )
}
