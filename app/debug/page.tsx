import MapContainer from '@/components/map/MapContainer';
import DebugPanel from '@/components/debug/DebugPanel';

export default function DebugPage() {
  return (
    <div className="h-screen flex flex-col">
      <header className="bg-white border-b border-slate-200 px-4 py-3">
        <h1 className="text-lg font-semibold">坐标调试工具</h1>
      </header>
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-96 border-r border-slate-200 bg-white p-4 overflow-auto">
          <DebugPanel />
        </aside>
        <main className="flex-1 relative">
          <MapContainer />
        </main>
      </div>
    </div>
  );
}
