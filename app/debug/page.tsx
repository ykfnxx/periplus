import MapSurface from "@/modules/map-renderer/ui/MapSurface"
import DebugPanel from "@/components/debug/DebugPanel"

export default function DebugPage() {
  return (
    <div className="flex h-screen flex-col">
      <header className="border-b border-ink-10 bg-soft-white px-4 py-3">
        <h1 className="text-lg font-semibold text-ink">坐标调试工具</h1>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-96 overflow-auto border-r border-ink-10 bg-soft-white p-4">
          <DebugPanel />
        </aside>
        <main className="relative flex-1">
          <MapSurface />
        </main>
      </div>
    </div>
  )
}
