import MapContainer from '@/components/map/MapContainer';

export const dynamic = 'force-dynamic';

export default function MapPage() {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <aside className="w-80 border-r border-slate-200 bg-white p-4 flex flex-col">
        <h2 className="text-lg font-semibold mb-4">路线编辑</h2>
        <p className="text-sm text-slate-500">Sidebar placeholder</p>
      </aside>
      <main className="flex-1 relative">
        <MapContainer />
      </main>
    </div>
  );
}
