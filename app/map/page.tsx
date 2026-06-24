import MapContainer from '@/components/map/MapContainer';
import RouteEditor from '@/components/sidebar/RouteEditor';

export default function MapPage() {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <aside className="w-80 border-r border-slate-200 bg-white p-4 flex flex-col overflow-hidden">
        <RouteEditor />
      </aside>
      <main className="flex-1 relative">
        <MapContainer />
      </main>
    </div>
  );
}
